#!/usr/bin/env node

import { chmodSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();
const hooksDir = path.join(root, '.githooks');
const isWindows = process.platform === 'win32';

const preCommitHookContent = `#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

bun run scripts/learning-gate.mjs --staged
`;

const commitMsgHookContent = `#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

bun run scripts/commit-governance.mjs --staged --message-file "$1"
`;

const prePushHookContent = `#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

bun run governance:check

while read -r local_ref local_sha remote_ref remote_sha; do
  if [ -z "\${local_sha:-}" ]; then
    continue
  fi

  if [ "$local_sha" = "0000000000000000000000000000000000000000" ]; then
    continue
  fi

  if [ "$remote_sha" = "0000000000000000000000000000000000000000" ]; then
    continue
  fi

  node scripts/commit-governance.mjs --base "$remote_sha" --head "$local_sha"
done
`;

const postCommitHookContent = `#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

changed_files="$(git diff-tree --root --no-commit-id --name-only -r HEAD)"
if [ -z "$changed_files" ]; then
  exit 0
fi

learning_update_files=()
while IFS= read -r rel_file; do
  case "$rel_file" in
    opencode-config/learning-updates/*.json)
      learning_update_files+=("$rel_file")
      ;;
  esac
done <<< "$changed_files"

if [ \${#learning_update_files[@]} -eq 0 ]; then
  exit 0
fi

for rel_file in "\${learning_update_files[@]}"; do
  source_value="\$({ git show "HEAD:\$rel_file" 2>/dev/null || true; } | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{const v=JSON.parse(d)?.source;process.stdout.write(typeof v==='string'?v:'');}catch{process.stdout.write('');}});")"
  if [ "$source_value" = "meta-kb-auto" ]; then
    echo "post-commit: skipping meta-KB synthesis (source: meta-kb-auto)"
    exit 0
  fi
done

if [ -f "scripts/synthesize-meta-kb.mjs" ]; then
  if ! node scripts/synthesize-meta-kb.mjs; then
    echo "post-commit: meta-KB synthesis failed (non-blocking)" >&2
  fi
fi
`;

function main() {
  const gitDir = path.join(root, '.git');
  if (!existsSync(gitDir)) {
    console.log('Skipping hook installation: no .git directory found (non-git environment).');
    return;
  }

  mkdirSync(hooksDir, { recursive: true });

  const configResult = spawnSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (configResult.status !== 0) {
    throw new Error(`Failed to set core.hooksPath: ${configResult.stderr || configResult.stdout || 'unknown error'}`);
  }

  const preCommitPath = path.join(hooksDir, 'pre-commit');
  const commitMsgPath = path.join(hooksDir, 'commit-msg');
  const prePushPath = path.join(hooksDir, 'pre-push');
  const postCommitPath = path.join(hooksDir, 'post-commit');

  writeFileSync(preCommitPath, preCommitHookContent, 'utf8');
  writeFileSync(commitMsgPath, commitMsgHookContent, 'utf8');
  writeFileSync(prePushPath, prePushHookContent, 'utf8');
  writeFileSync(postCommitPath, postCommitHookContent, 'utf8');

  if (!isWindows) {
    chmodSync(preCommitPath, 0o755);
    chmodSync(commitMsgPath, 0o755);
    chmodSync(prePushPath, 0o755);
    chmodSync(postCommitPath, 0o755);

    for (const hookPath of [preCommitPath, commitMsgPath, prePushPath, postCommitPath]) {
      const mode = statSync(hookPath).mode;
      if ((mode & 0o111) === 0) {
        throw new Error(`Hook is not executable after install: ${hookPath}`);
      }
    }
  }

  console.log(`Installed hooks in ${hooksDir}`);
  console.log('Configured core.hooksPath=.githooks');
  console.log('Generated: pre-commit, commit-msg, pre-push, post-commit');
}

main();
