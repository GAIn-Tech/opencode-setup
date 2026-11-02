#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { resolveRoot } from './resolve-root.mjs';

const ROOT = resolveRoot();
const STATE_PATH = path.join(ROOT, 'opencode-config', 'deployment-state.json');
const ENVIRONMENTS = ['dev', 'staging', 'prod'];
const PROMOTION_FLOW = {
  dev: ['staging'],
  staging: ['prod'],
  prod: []
};

function nowIso() {
  return new Date().toISOString();
}

function currentSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function readState() {
  if (!fs.existsSync(STATE_PATH)) {
    return {
      version: 1,
      environments: {
        dev: { version: '0.0.0', sha: 'unknown', updated_at: null, updated_by: null },
        staging: { version: '0.0.0', sha: 'unknown', updated_at: null, updated_by: null },
        prod: { version: '0.0.0', sha: 'unknown', updated_at: null, updated_by: null }
      },
      history: []
    };
  }
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function writeState(state) {
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function parseArgs(argv) {
  const [, , command, ...rest] = argv;
  return { command, rest };
}

function ensureEnv(env) {
  if (!ENVIRONMENTS.includes(env)) {
    throw new Error(`invalid environment '${env}'. expected one of: ${ENVIRONMENTS.join(', ')}`);
  }
}

function printUsage() {
  console.log('Usage: node scripts/deployment-state.mjs <command>');
  console.log('Commands:');
  console.log('  show');
  console.log('  set <env> <version> [--sha <sha>] [--note <text>]');
  console.log('  promote <fromEnv> <toEnv> [--note <text>]');
  console.log('  rollback <env> <version> [--note <text>]');
  console.log('  check-flow');
}

function parseOptional(rest, key) {
  const idx = rest.indexOf(key);
  return idx >= 0 ? rest[idx + 1] ?? null : null;
}

function appendHistory(state, event) {
  state.history.push({
    timestamp: nowIso(),
    actor: process.env.USER || process.env.USERNAME || 'unknown',
    ...event
  });
}

function cmdShow(state) {
  console.log(JSON.stringify(state, null, 2));
}

function cmdSet(state, rest) {
  const [env, version] = rest;
  if (!env || !version) {
    throw new Error('set requires: <env> <version>');
  }
  ensureEnv(env);

  const sha = parseOptional(rest, '--sha') || currentSha();
  const note = parseOptional(rest, '--note');
  const actor = process.env.USER || process.env.USERNAME || 'unknown';

  state.environments[env] = {
    version,
    sha,
    updated_at: nowIso(),
    updated_by: actor
  };

  appendHistory(state, {
    event: 'set',
    environment: env,
    version,
    sha,
    note: note || null
  });

  writeState(state);
  console.log(`deployment-state: set ${env}=${version} (${sha})`);
}

function cmdPromote(state, rest) {
  const [fromEnv, toEnv] = rest;
  if (!fromEnv || !toEnv) {
    throw new Error('promote requires: <fromEnv> <toEnv>');
  }
  ensureEnv(fromEnv);
  ensureEnv(toEnv);

  const allowedTargets = PROMOTION_FLOW[fromEnv] || [];
  if (!allowedTargets.includes(toEnv)) {
    throw new Error(
      `invalid promotion path '${fromEnv} -> ${toEnv}'. allowed: ${fromEnv} -> ${allowedTargets.join(', ') || '(none)'}`
    );
  }

  const note = parseOptional(rest, '--note');
  const source = state.environments[fromEnv];

  state.environments[toEnv] = {
    version: source.version,
    sha: source.sha,
    updated_at: nowIso(),
    updated_by: process.env.USER || process.env.USERNAME || 'unknown'
  };

  appendHistory(state, {
    event: 'promote',
    from: fromEnv,
    to: toEnv,
    version: source.version,
    sha: source.sha,
    note: note || null
  });

  writeState(state);
  console.log(`deployment-state: promoted ${source.version} (${source.sha}) from ${fromEnv} -> ${toEnv}`);
}

function cmdRollback(state, rest) {
  const [env, version] = rest;
  if (!env || !version) {
    throw new Error('rollback requires: <env> <version>');
  }
  ensureEnv(env);

  const note = parseOptional(rest, '--note');
  const sha = parseOptional(rest, '--sha') || state.environments[env].sha || currentSha();
  const actor = process.env.USER || process.env.USERNAME || 'unknown';

  state.environments[env] = {
    version,
    sha,
    updated_at: nowIso(),
    updated_by: actor
  };

  appendHistory(state, {
    event: 'rollback',
    environment: env,
    version,
    sha,
    note: note || null
  });

  writeState(state);
  console.log(`deployment-state: rolled back ${env} to ${version} (${sha})`);
}

function cmdCheckFlow(state) {
  const warnings = [];
  const dev = state.environments.dev;
  const staging = state.environments.staging;
  const prod = state.environments.prod;

  if (prod.sha !== 'unknown' && staging.sha === 'unknown') {
    warnings.push('prod has deployment metadata while staging is unknown');
  }

  if (staging.sha !== 'unknown' && dev.sha === 'unknown') {
    warnings.push('staging has deployment metadata while dev is unknown');
  }

  if (warnings.length > 0) {
    console.log('deployment-state: WARN');
    for (const warning of warnings) {
      console.log(`- ${warning}`);
    }
    process.exit(1);
  }

  console.log('deployment-state: flow check PASS');
}

function main() {
  const { command, rest } = parseArgs(process.argv);
  if (!command) {
    printUsage();
    process.exit(1);
  }

  const state = readState();
  switch (command) {
    case 'show':
      cmdShow(state);
      break;
    case 'set':
      cmdSet(state, rest);
      break;
    case 'promote':
      cmdPromote(state, rest);
      break;
    case 'rollback':
      cmdRollback(state, rest);
      break;
    case 'check-flow':
      cmdCheckFlow(state);
      break;
    default:
      printUsage();
      process.exit(1);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
}
