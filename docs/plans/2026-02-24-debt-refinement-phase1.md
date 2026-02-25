# Technical Debt Refinement Plan - Phase 1

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Execute critical and high-priority technical debt refinements identified in the 2026-02-24 analyze-mode audit.

**Architecture:** This plan addresses debt in 3 phases: (1) Governance/Policy Enforcement, (2) API Security Hardening, (3) Data Durability. Each phase contains bite-sized tasks with TDD approach.

**Tech Stack:** Bun, Node.js, Next.js 14 API Routes, SQLite, TypeScript

---

## Phase 1: Governance & Policy Enforcement

### Task 1: Prevent config governance bypass (learning-gate)

**Files:**
- Modify: `scripts/learning-gate.mjs`
- Test: Existing governance tests should still pass

**Step 1: Analyze current bypass vector**

The script only checks git-diff contexts. Manual runtime/file edits can evade governance.

Current code at line 34:
```javascript
const changedFiles = execSync('git diff --name-only', { encoding: 'utf-8' });
```

**Step 2: Add file-system watch or runtime checkpoint**

Add a secondary verification that checks governed files against a known-good hash at startup:
- Store hash of governed config files in `opencode-config/.governance-hashes.json`
- On each run, verify current file hashes match known-good
- Add `--verify-hashes` flag to enforce

**Step 3: Run governance tests**

```bash
bun run governance:check
```

---

### Task 2: Enforce package boundary contracts in CI

**Files:**
- Create: `scripts/ci-boundary-enforce.mjs`
- Modify: `package.json` (add to CI pipeline)

**Step 1: Write boundary check script**

Create script that:
- Parses all TypeScript files in `packages/opencode-dashboard/src/app/api/`
- Detects imports from `opencode-model-manager` that are NOT from `opencode-model-manager` package entrypoint
- Fails CI if deep relative paths like `../../../../../opencode-model-manager/src/lifecycle/state-machine` are found

**Step 2: Test the enforcer**

```bash
node scripts/ci-boundary-enforce.mjs
```

Expected: Should detect any existing deep imports

**Step 3: Add to CI pipeline**

Add to `package.json` scripts:
```json
"ci:boundary": "node scripts/ci-boundary-enforce.mjs"
```

---

### Task 3: Fix DB path consistency

**Files:**
- Modify: `packages/opencode-model-manager/src/lifecycle/state-machine.js:6`
- Modify: `packages/opencode-dashboard/src/app/api/models/lifecycle/route.ts:13`
- Test: Verify both read/write to same DB

**Step 1: Standardize path resolution**

Create a shared path utility in `opencode-model-manager`:
```javascript
// packages/opencode-model-manager/src/lib/paths.js
import { homedir } from 'os';
import path from 'path';

export function getDBPath(name) {
  const base = process.env.OPENCODE_DATA_DIR || path.join(homedir(), '.opencode');
  return path.join(base, name);
}
```

**Step 2: Update state-machine.js to use shared utility**

Replace relative path default with shared utility.

**Step 3: Verify path consistency**

Run lifecycle operations and confirm both components read/write same DB.

---

## Phase 2: API Security Hardening

### Task 4: Add role-based access control to write routes

**Files:**
- Modify: `packages/opencode-dashboard/src/app/api/_lib/write-access.ts`
- Test: Verify role checks work

**Step 1: Add role matrix**

Extend write-access.ts with role definitions:
```javascript
const ROLE_MATRIX = {
  'config:write': ['admin', 'operator'],
  'models:write': ['admin', 'operator'],
  'models:transition': ['admin', 'operator'],
  // etc.
};
```

**Step 2: Add role verification**

Add function to verify caller has required role based on token.

**Step 3: Test role enforcement**

Create test that attempts write with wrong role, should fail 403.

---

### Task 5: Add tamper-evident write-audit chain

**Files:**
- Modify: `packages/opencode-dashboard/src/app/api/_lib/write-audit.ts`
- Test: Verify hash chain integrity

**Step 1: Add hash chain to NDJSON**

Each entry includes:
- `prevHash`: SHA256 of previous entry
- `hash`: SHA256 of current entry (including prevHash)

**Step 2: Add integrity verification function**

```javascript
export function verifyWriteAuditChain(auditPath) {
  // Read entries, verify hash chain
  // Return { valid: boolean, brokenAt: number | null }
}
```

**Step 3: Test chain integrity**

Run test that adds entries and verifies chain, then corrupts one and detects it.

---

### Task 6: Make orchestration write path atomic

**Files:**
- Modify: `packages/opencode-dashboard/src/app/api/orchestration/route.ts:898`
- Test: Verify no partial writes under interruption

**Step 1: Identify write location**

Line 898 uses `writeFileSync` on critical event store.

**Step 2: Implement atomic write pattern**

```javascript
import { writeFileSync, renameSync } from 'fs';

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp.' + Date.now();
  writeFileSync(tmp, JSON.stringify(data), 'utf8');
  renameSync(tmp, filePath);
}
```

**Step 3: Test atomicity**

Simulate interruption during write, verify either complete or no file.

---

## Phase 3: Maintainability Refactoring

### Task 7: Add force-dynamic to monitoring route

**Files:**
- Modify: `packages/opencode-dashboard/src/app/api/monitoring/route.ts`
- Test: Verify route is always dynamic

**Step 1: Add export**

Add at top of file:
```javascript
export const dynamic = 'force-dynamic';
```

**Step 2: Verify**

Build dashboard and check no static generation warning.

---

### Task 8: Document integrity guard environment assumptions

**Files:**
- Modify: `scripts/integrity-guard.mjs`
- Test: Document expected environment

**Step 1: Add environment validation**

Add startup check that verifies:
- `OPENCODE_DATA_DIR` or `~/.opencode` exists
- Required baseline files present

**Step 2: Document requirements**

Add README section explaining environment assumptions.

---

## Execution Notes

- Run each task independently with test verification
- Commit after each passing task
- Skip Task 3 (DB path) if both components already use same path
- Focus on Tasks 1, 2, 4, 5, 6 for maximum ROI

---

**Plan complete and saved to `docs/plans/2026-02-24-debt-refinement-phase1.md`.**

**Two execution options:**

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
