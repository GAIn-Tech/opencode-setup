#!/usr/bin/env node

import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
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

function main() {
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

  writeFileSync(preCommitPath, preCommitHookContent, 'utf8');
  writeFileSync(commitMsgPath, commitMsgHookContent, 'utf8');
  writeFileSync(prePushPath, prePushHookContent, 'utf8');

  if (!isWindows) {
    chmodSync(preCommitPath, 0o755);
    chmodSync(commitMsgPath, 0o755);
    chmodSync(prePushPath, 0o755);
  }

  console.log(`Installed hooks in ${hooksDir}`);
  console.log('Configured core.hooksPath=.githooks');
  console.log('Generated: pre-commit, commit-msg, pre-push');
}

main();
