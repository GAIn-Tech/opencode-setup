#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();

function runCommand(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    shell: false,
  });

  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();

  return {
    status: result.status ?? 1,
    stdout,
    stderr,
    command: `${command} ${args.join(' ')}`,
  };
}

export function evaluateRuntimeProof(payload) {
  if (payload?.allSelectedToolsVisible === true) {
    return { ok: true, reason: 'ok' };
  }

  const missing = Array.isArray(payload?.missingSelectedTools) ? payload.missingSelectedTools : [];
  if (missing.length === 0) {
    return { ok: false, reason: 'runtime proof failed: selected tool visibility is false' };
  }

  return { ok: false, reason: `runtime proof failed: missing selected tools: ${missing.join(', ')}` };
}

function assertSuccess(result, stepName) {
  if (result.status === 0) return;

  const details = [
    `[protocol:compliance] ${stepName} failed`,
    `command: ${result.command}`,
  ];

  if (result.stdout) details.push(result.stdout);
  if (result.stderr) details.push(result.stderr);

  throw new Error(details.join('\n'));
}

function printStep(stepName, result) {
  console.log(`\n=== ${stepName} ===`);
  if (result.stdout) console.log(result.stdout);
  if (result.stderr) console.error(result.stderr);
}

function main() {
  const checks = [
    { name: 'Governance hash verification', command: 'node', args: ['scripts/learning-gate.mjs', '--verify-hashes', '--base', 'HEAD'] },
    { name: 'Governance gate', command: 'bun', args: ['run', 'governance:check'] },
    { name: 'Strict setup verification', command: 'bun', args: ['run', 'verify:strict'] },
    { name: 'MCP smoke harness', command: 'bun', args: ['run', 'mcp:smoke'] },
    { name: 'MCP exercise harness', command: 'bun', args: ['run', 'mcp:exercise'] },
    { name: 'Config coherence', command: 'bun', args: ['run', 'config:coherence'] },
  ];

  for (const check of checks) {
    const result = runCommand(check.command, check.args);
    printStep(check.name, result);
    assertSuccess(result, check.name);
  }

  const runtimeProof = runCommand('node', ['scripts/runtime-tool-surface-proof.mjs']);
  printStep('Runtime tool-surface proof', runtimeProof);
  assertSuccess(runtimeProof, 'Runtime tool-surface proof');

  const parsed = JSON.parse(runtimeProof.stdout);
  const evaluation = evaluateRuntimeProof(parsed);
  if (!evaluation.ok) {
    throw new Error(`[protocol:compliance] ${evaluation.reason}`);
  }

  console.log('\n[protocol:compliance] PASS');
}

const thisFilePath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(thisFilePath);

if (isDirectRun) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}
