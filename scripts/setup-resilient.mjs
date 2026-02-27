#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const steps = [
  { label: 'preflight-versions', command: 'node', args: ['scripts/preflight-versions.mjs'] },
  { label: 'bun-install', command: 'bun', args: ['install'] },
  { label: 'link-all', command: 'bun', args: ['run', 'link-all'] },
  { label: 'hooks-install', command: 'bun', args: ['run', 'hooks:install'] },
  { label: 'copy-config', command: 'bun', args: ['run', 'copy-config'] },
  { label: 'generate-mcp-config', command: 'bun', args: ['run', 'generate'] },
  { label: 'verify-setup', command: 'node', args: ['scripts/verify-setup.mjs'] },
  { label: 'validate-plugin-compatibility', command: 'node', args: ['scripts/validate-plugin-compatibility.mjs'] },
  { label: 'verify-portability-strict', command: 'node', args: ['scripts/verify-portability.mjs', '--strict'] },
];

function runStep(step) {
  console.log(`\n[setup-resilient] Running ${step.label}: ${step.command} ${step.args.join(' ')}`);
  const result = spawnSync(step.command, step.args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      OPENCODE_VERIFY_ENV_PROFILE: process.env.OPENCODE_VERIFY_ENV_PROFILE || 'strict',
      OPENCODE_ENV_CONTRACT_STRICT: process.env.OPENCODE_ENV_CONTRACT_STRICT || '1',
    },
  });

  if (result.error) {
    throw new Error(`[setup-resilient] ${step.label} failed: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`[setup-resilient] ${step.label} failed with exit code ${result.status}`);
  }
}

function main() {
  for (const step of steps) {
    runStep(step);
  }
  console.log('\n[setup-resilient] PASS: strict portability setup completed.');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
