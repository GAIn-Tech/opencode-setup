#!/usr/bin/env node

import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();
const hooksDir = path.join(root, '.git', 'hooks');
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

function main() {
  mkdirSync(hooksDir, { recursive: true });

  const preCommitPath = path.join(hooksDir, 'pre-commit');
  const commitMsgPath = path.join(hooksDir, 'commit-msg');

  writeFileSync(preCommitPath, preCommitHookContent, 'utf8');
  writeFileSync(commitMsgPath, commitMsgHookContent, 'utf8');

  if (!isWindows) {
    chmodSync(preCommitPath, 0o755);
    chmodSync(commitMsgPath, 0o755);
  }

  console.log(`Installed hooks in ${hooksDir}`);
  console.log('Generated: pre-commit, commit-msg');
}

main();
