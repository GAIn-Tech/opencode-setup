# opencode-proofcheck

Pluginized deployment gate. Verify before commit/push.

## Gate Logic

```
(git clean) AND (tests pass) AND (lint pass) = safe to commit/push
```

## Install

```bash
npm install -g opencode-proofcheck   # global CLI
npm install opencode-proofcheck      # local dependency
```

## CLI Usage

```bash
proofcheck                     # run all checks
proofcheck --force             # bypass gate (exits 0, reports issues)
proofcheck --skip security     # skip specific checks
proofcheck --cwd /my/project   # check different project
proofcheck --verbose           # show failure details
```

## Programmatic Usage

```js
const { Proofcheck } = require('opencode-proofcheck');

const pc = new Proofcheck({ cwd: '/my/project' });
const result = await pc.gateDeployment('main');
console.log(result.summary);
// safe: true/false, forced: true/false, results: {...}

// Custom plugin check
pc.addCheck('customRule', (opts) => ({
  passed: true,
  message: 'Custom check passed',
}));

// Alias for addCheck
pc.registerGate('policyGuard', (opts) => ({
  passed: true,
  message: 'Policy gate passed',
}));
```

## API

### Package Exports

```js
const { Proofcheck } = require('opencode-proofcheck');
```

`Proofcheck` now extends Node's `EventEmitter` for gate/evidence hooks.

### Methods

- `addCheck(name, fn)` - register custom check plugin
- `registerGate(name, fn)` - alias of `addCheck()`
- `removeCheck(name)` - remove check plugin
- `verify()` - run all checks and collect results
- `gateDeployment(branch?)` - render gate summary + status
- `exitCode()` - return `0` or `1` for scripts
- `registerHook(hookName, fn)` - register hook callback
- `unregisterHook(hookName, fn)` - unregister hook callback

### Extension Hooks

Use either `pc.registerHook(name, fn)` or `pc.on(name, fn)`.

| Hook | When it fires | Payload |
|------|---------------|---------|
| `onGateRegistered` | Check/gate added | `{ gate, fn }` |
| `onGateRemoved` | Check/gate removed | `{ gate }` |
| `verifyStarted` | Verification cycle starts | `{ cwd, check_count }` |
| `onEvidenceCaptured` | A gate emits pass/fail/skip/crash result | `{ gate, result }` |
| `verifyCompleted` | Verification cycle ends | `{ allPassed, results }` |
| `hook:error` | Hook callback throws | `{ hook, payload, error }` |

## Checks

| Check | What it does | Auto-detect |
|-------|-------------|-------------|
| `gitStatus` | Working tree clean (no uncommitted changes) | git repo |
| `tests` | Runs test suite, exit code 0 = pass | `npm test` or `pytest` |
| `lint` | Runs linter | `npm run lint`, `ruff`, `flake8` |
| `security` | Dependency audit | `npm audit`, `pip-audit` |
| `branchSync` | Branch not behind remote | git upstream |

## Options

| Flag | Description |
|------|-------------|
| `--force`, `-f` | Bypass gate (report but don't block) |
| `--skip <checks>` | Comma-separated checks to skip |
| `--cwd <path>` | Project root directory |
| `--verbose`, `-v` | Show check details |

## Part of opencode toolkit

One of 8 packages in the opencode ops suite. Final integration after all 8.
