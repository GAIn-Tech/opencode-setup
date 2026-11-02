# Central Config + Dashboard Editing Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Centralize configurable settings in `opencode-config/central-config.json`, make them editable in the dashboard, and merge safely with RL outputs using hard/soft bounds and a global confidence threshold.

**Architecture:** Add a layered config system (defaults → central-config → RL state → hard clamp) with a pure merge function and audit logging. Expose raw + effective config in the dashboard and keep RL learning authoritative while respecting immutable boundaries.

**Tech Stack:** Node/Bun, JSON schema validation, Next.js dashboard (app router), existing config-loader + dashboard config API.

---

### Task 1: Add central config schema and seed file

**Files:**
- Create: `opencode-config/central-config.schema.json`
- Create: `opencode-config/central-config.json`

**Step 1: Write schema (initial minimal structure)**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["schema_version", "config_version", "rl", "sections"],
  "properties": {
    "schema_version": { "type": "string" },
    "config_version": { "type": "integer", "minimum": 1 },
    "rl": {
      "type": "object",
      "required": ["override_min_confidence"],
      "properties": {
        "override_min_confidence": { "type": "number", "minimum": 0.5, "maximum": 0.99 }
      },
      "additionalProperties": false
    },
    "sections": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "additionalProperties": {
          "type": "object",
          "required": ["value", "soft", "hard", "locked", "rl_allowed"],
          "properties": {
            "value": {},
            "soft": { "type": "object" },
            "hard": { "type": "object" },
            "locked": { "type": "boolean" },
            "rl_allowed": { "type": "boolean" }
          },
          "additionalProperties": false
        }
      }
    }
  },
  "additionalProperties": false
}
```

**Step 2: Create seed central-config.json**

```json
{
  "schema_version": "1.0.0",
  "config_version": 1,
  "rl": {
    "override_min_confidence": 0.85
  },
  "sections": {
    "routing": {
      "rate_limit_fallback_enabled": {
        "value": true,
        "soft": { "min": false, "max": true },
        "hard": { "min": false, "max": true },
        "locked": false,
        "rl_allowed": true
      }
    }
  }
}
```

**Step 3: Commit**

```bash
git add opencode-config/central-config.schema.json opencode-config/central-config.json
git commit -m "feat: add central config schema and seed"
```

---

### Task 2: Implement central-config loader + merge

**Files:**
- Create: `packages/opencode-config-loader/src/central-config.js`
- Modify: `packages/opencode-config-loader/src/index.js`

**Step 1: Add pure merge function (hard clamp + RL gating)**

```js
function mergeCentralConfig({ defaults, central, rlState }) {
  // returns { effective, diff, metadata }
}
```

**Step 2: Add schema validation on read**

```js
function loadCentralConfig(path) { /* read + validate */ }
```

**Step 3: Wire into config-loader exports**

```js
module.exports = { /* existing */, loadCentralConfig, mergeCentralConfig };
```

**Step 4: Write tests for merge logic**

**Files:**
- Create: `packages/opencode-config-loader/test/central-config.test.js`

```js
const { describe, test, expect } = require('bun:test');
const { mergeCentralConfig } = require('../src/central-config');

test('hard bounds clamp RL and dashboard', () => { /* ... */ });
test('RL overrides soft bounds only at confidence threshold', () => { /* ... */ });
test('locked values ignore RL', () => { /* ... */ });
```

**Step 5: Run tests**

```bash
bun test packages/opencode-config-loader/test/central-config.test.js
```

**Step 6: Commit**

```bash
git add packages/opencode-config-loader/src/central-config.js packages/opencode-config-loader/src/index.js packages/opencode-config-loader/test/central-config.test.js
git commit -m "feat: add central config loader and merge logic"
```

---

### Task 3: Add RL state storage + audit log

**Files:**
- Create: `packages/opencode-config-loader/src/central-config-state.js`

**Step 1: Implement RL state read/write**

```js
// rl-state.json lives in user data dir (.opencode)
function loadRlState() {}
function saveRlState(next, { expectedVersion }) {}
```

**Step 2: Implement audit log append**

```js
// append-only JSONL in ~/.opencode/audit/central-config.log
function appendAuditEntry(entry) {}
```

**Step 3: Add optimistic concurrency (config_version)**

```js
// reject if expectedVersion !== current config_version
```

**Step 4: Unit tests for version conflicts**

```js
test('saveRlState rejects stale config_version', () => { /* ... */ });
```

**Step 5: Commit**

```bash
git add packages/opencode-config-loader/src/central-config-state.js packages/opencode-config-loader/test/central-config.test.js
git commit -m "feat: add central config rl-state and audit log"
```

---

### Task 4: Dashboard API support (raw + effective)

**Files:**
- Modify: `packages/opencode-dashboard/src/app/api/config/route.ts`

**Step 1: Add centralConfig to GET**

```ts
// return raw central-config + effective config
```

**Step 2: Add POST handler for centralConfig**

```ts
// validate schema + enforce config_version + append audit
```

**Step 3: Add raw/effective endpoints**

```ts
// /api/config?view=effective
```

**Step 4: Commit**

```bash
git add packages/opencode-dashboard/src/app/api/config/route.ts
git commit -m "feat: add central config API (raw + effective)"
```

---

### Task 5: Dashboard UI (Central Config editor)

**Files:**
- Modify: `packages/opencode-dashboard/src/components/dashboard/ConfigViewer.tsx`

**Step 1: Add new tab for Central Config**

```tsx
<ConfigSection title="Central Config" />
```

**Step 2: Add editor for soft/hard/locked/rl_allowed**

```tsx
// field editor + lock toggle + bounds inputs
```

**Step 3: Add RL confidence slider**

```tsx
// global override_min_confidence
```

**Step 4: Read-only “effective config” preview**

```tsx
// show diff raw vs effective
```

**Step 5: Commit**

```bash
git add packages/opencode-dashboard/src/components/dashboard/ConfigViewer.tsx
git commit -m "feat: add central config editor to dashboard"
```

---

### Task 6: Migration + compatibility

**Files:**
- Create: `scripts/migrate-central-config.mjs`

**Step 1: Seed central-config from existing files**

```js
// read opencode.json, config.yaml, rate-limit-fallback.json
// map values into central-config sections
```

**Step 2: Shadow mode + diff report**

```js
// print diffs between central-config and current runtime
```

**Step 3: Commit**

```bash
git add scripts/migrate-central-config.mjs
git commit -m "feat: add central config migration script"
```

---

### Task 7: Verification + documentation

**Files:**
- Modify: `scripts/verify-setup.mjs`
- Create: `docs/central-config.md`

**Step 1: Add verify step for central-config.json presence + schema**

```js
// verify reads + schema validation
```

**Step 2: Document central-config schema, precedence, and RL boundaries**

```md
// include raw vs effective view, audit log, rollback semantics
```

**Step 3: Commit**

```bash
git add scripts/verify-setup.mjs docs/central-config.md
git commit -m "docs: document central config + verification"
```

---

### Task 8: Rollback + corruption recovery

**Files:**
- Modify: `packages/opencode-config-loader/src/central-config-state.js`

**Step 1: Add snapshot + restore**

```js
// keep last N snapshots; rollback restores config + rl-state atomically
```

**Step 2: Add corruption recovery fallback**

```js
// load last known good if JSON parse fails
```

**Step 3: Tests**

```js
test('rollback restores config and rl-state')
test('corrupted config loads backup')
```

**Step 4: Commit**

```bash
git add packages/opencode-config-loader/src/central-config-state.js packages/opencode-config-loader/test/central-config.test.js
git commit -m "feat: add rollback + corruption recovery"
```

---

## Final verification

Run:

```bash
bun test packages/opencode-config-loader/test/central-config.test.js
bun run verify
```

Expected: all tests pass and verify succeeds.

---

Plan complete and saved to `docs/plans/2026-02-23-central-config-dashboard.md`. Two execution options:

1. Subagent-Driven (this session) — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. Parallel Session (separate) — Open new session with executing-plans, batch execution with checkpoints

Which approach?
