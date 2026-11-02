# Wave 7 Naivete Remediation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remediate 35+ systemic naivete findings from Wave 7 audit across type safety, security, data integrity, observability, dead code, and dependency health.

**Architecture:** Fix critical security and integrity issues first (highest cascade), then type safety, then code health, then dependencies.

**Tech Stack:** Bun monorepo (34 packages), TypeScript/JavaScript, SQLite, JSON Schema

---

## Planning Philosophy

**Cascade Impact Priority:**
1. **Wave 7A** (Security/Integrity): Auth gaps, FK enforcement, prototype pollution
2. **Wave 7B** (Type Safety): Return types, `any` reduction
3. **Wave 7C** (Code Health): Remove dead code, deprecated functions
4. **Wave 7D** (Observability): Logger adoption, correlation IDs
5. **Wave 7E** (Dependencies): Fix missing deps, patch CVEs

**DO NOT fix while changing:**
- Do NOT add features while fixing security
- Do NOT refactor unrelated code
- Do NOT change public APIs without backward compat

---

## Wave 7A: Security & Data Integrity (Critical)

### Task 1: Enable SQLite Foreign Key Enforcement
**Problem:** FK constraints declared but not enforced (PRAGMA missing)

**Location:** `packages/opencode-sisyphus-state/src/database.js:41`

**Required Changes:**
```javascript
// After creating connection
this.db.exec('PRAGMA foreign_keys = ON;');

// Add startup integrity check
const fkCheck = this.db.prepare('PRAGMA foreign_key_check').all();
if (fkCheck.length > 0) {
  console.warn('[database] Foreign key violations found:', fkCheck);
}
```

**Test:** Verify orphan rows are rejected
**Commit:** `fix(database): enable SQLite foreign key enforcement`

---

### Task 2: Add Auth Gate to Config Endpoint
**Problem:** GET /api/config returns secrets without authentication

**Location:** `packages/opencode-dashboard/src/app/api/config/route.ts:51`

**Required Changes:**
```typescript
import { requireReadAccess } from '../_lib/auth';

export async function GET(request: Request) {
  await requireReadAccess(request);  // Add this
  // ... rest
}

// Redact sensitive keys before response
function redactSecrets(config: any): any {
  const sensitive = ['apiKey', 'token', 'secret', 'password', 'Authorization'];
  // Deep clone and redact
}
```

**Test:** Verify 401 without auth, secrets redacted in response
**Commit:** `security(dashboard): require auth for config endpoint, redact secrets`

---

### Task 3: Fix Prototype Pollution in Plugin Supervisor
**Problem:** User-controlled plugin names can mutate object prototype

**Locations:**
- `packages/opencode-dashboard/src/app/api/plugin-supervisor/route.ts:55`
- `packages/opencode-plugin-lifecycle/src/index.js:82`

**Required Changes:**
```javascript
// In plugin-lifecycle/index.js
constructor() {
  this.state = Object.create(null);  // Use null prototype
}

setPluginState(name, next) {
  // Reject dangerous keys
  if (name === '__proto__' || name === 'prototype' || name === 'constructor') {
    throw new Error('Invalid plugin name');
  }
  this.state[name] = next;
}
```

**Also:** Add `requireWriteAccess` to POST route in plugin-supervisor

**Test:** Verify `__proto__` injection rejected
**Commit:** `security(plugin): prevent prototype pollution via sanitized keys and null prototype`

---

### Task 4: Add Auth to State Mutation Endpoints
**Problem:** POST /monitoring and POST /policy-sim unauthenticated

**Locations:**
- `packages/opencode-dashboard/src/app/api/monitoring/route.ts:120`
- `packages/opencode-dashboard/src/app/api/orchestration/policy-sim/route.ts:101`

**Required Changes:**
Add `await requireWriteAccess(request)` to both POST handlers.

**Commit:** `security(dashboard): require auth for state mutation endpoints`

---

### Task 5: Add AJV Full Schema Validation
**Problem:** Config loader validates only subset despite loading full JSON Schema

**Location:** `packages/opencode-config-loader/src/central-config.js:11`

**Required Changes:**
```javascript
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

function validateSchema(data) {
  const valid = validate(data);
  if (!valid) {
    throw new Error(`Schema validation failed: ${ajv.errorsText(validate.errors)}`);
  }
  return data;
}
```

**Test:** Verify unknown keys rejected, full schema enforced
**Commit:** `fix(config-loader): use AJV for full JSON Schema validation`

---

### Task 6: Add Quota Input Validation
**Problem:** Quota manager accepts negative tokens, invalid thresholds

**Location:** `packages/opencode-sisyphus-state/src/quota-manager.js:16,53,84`

**Required Changes:**
```javascript
configureQuota(config) {
  if (config.threshold < 0 || config.threshold > 100) {
    throw new Error('Invalid threshold');
  }
  if (config.tokens < 0) {
    throw new Error('Negative tokens not allowed');
  }
  // Validate quota_type against allowed values
}
```

**Also:** Add DB CHECK constraints:
```sql
CHECK (quota_type IN ('api_calls', 'tokens', 'cost')),
CHECK (threshold >= 0 AND threshold <= 100),
CHECK (tokens >= 0)
```

**Commit:** `fix(quota): validate quota inputs and add DB constraints`

---

## Wave 7B: Type Safety

### Task 7: Add Return Types to 50 Files
**Problem:** 50 files missing explicit return types

**Strategy:** Batch by package, add return types to public APIs

**Files:** All dashboard API routes, model-manager tests

**Pattern:**
```typescript
// Before
export async function GET(request: Request) {
  // returns Response implicitly
}

// After
export async function GET(request: Request): Promise<Response> {
  // explicit return type
}
```

**Commit:** `types(dashboard): add explicit return types to API routes`

---

### Task 8: Reduce Explicit `any` Types
**Problem:** 125 explicit `any` annotations

**Strategy:** Replace with `unknown` or specific types, batch by package

**Priority files:**
1. Dashboard API routes (highest)
2. Model-manager tests
3. Learning-engine

**Commit:** `types: reduce explicit any annotations`

---

## Wave 7C: Code Health

### Task 9: Remove 79 Unused Exports
**Problem:** Dead code cluttering codebase

**Strategy:** Remove with deprecation warning first, delete in follow-up

**High-confidence candidates:**
- `getRlStatePath`, `getAuditLogPath`, `getSnapshotsDir` (config-loader)
- `safeParse`, `safeClone` (crash-guard - now in safe-io)
- `registerInterval`, `registerTimeout`, `registerCleanup` (shutdown-manager - verify usage)

**Commit:** `chore: remove unused exports from config-loader, crash-guard`

---

### Task 10: Remove 6 Unused Variables
**Problem:** Declared but never read

**Locations:**
- `packages/opencode-goraphdb-bridge/src/index.js:338` (fileNode)
- `packages/opencode-graphdb-bridge/src/index.js:338` (fileNode)
- `packages/opencode-model-router-x/src/index.js:434` (baseName)
- etc.

**Commit:** `chore: remove unused variables`

---

### Task 11: Remove 5 Deprecated Functions
**Problem:** Still present, should be removed

**Locations:**
- `packages/opencode-learning-engine/src/tool-usage-tracker.js:141` (init)
- `packages/opencode-learning-engine/src/tool-usage-tracker.js:202` (writeJsonSync)
- `packages/opencode-learning-engine/src/tool-usage-tracker.js:212` (readJsonSync)
- `packages/opencode-memory-graph/src/graph-builder.js:245` (buildGraph)
- `packages/opencode-safe-io/src/index.js:64` (safeJsonReadSync)

**Commit:** `chore: remove deprecated functions after grace period`

---

## Wave 7D: Observability

### Task 12: Replace console.* with Logger in Hotspots
**Problem:** 650 console.* vs 36 logger.*, 533 console in source

**Priority files:**
- `packages/opencode-model-router-x/src/index.js`
- `packages/opencode-crash-guard/src/shutdown-manager.js`
- `packages/opencode-integration-layer/src/index.js`

**Strategy:** Add logger import, replace console calls in target files

**Commit:** `refactor: replace console.* with structured logger in hotspots`

---

### Task 13: Add Correlation ID Propagation
**Problem:** Correlation IDs exist but not propagated across boundaries

**Strategy:** Add `AsyncLocalStorage` context propagation

**Commit:** `feat(observability): add request context propagation with correlation IDs`

---

## Wave 7E: Dependencies

### Task 14: Fix Missing Dependencies
**Problem:** 13 packages import undeclared deps

**Critical missing:**
- `which` in crash-guard
- `better-sqlite3` in model-manager
- `opencode-safe-io` in feature-flags and others

**Strategy:** Add to package.json dependencies

**Commit:** `fix(deps): add missing dependencies to 13 packages`

---

### Task 15: Remove Unused Dependencies
**Problem:** 5 packages with unused deps

**Candidates:**
- `opencode-dashboard`: clsx, react-dom (verify), tailwind-merge
- `opencode-model-benchmark`: sqlite3
- etc.

**Commit:** `chore(deps): remove unused dependencies`

---

### Task 16: Patch Critical CVE
**Problem:** next.js critical CVE (>=14.0.0 <14.2.10)

**Fix:** Update opencode-dashboard next.js version

**Commit:** `security(deps): patch critical CVE in next.js`

---

### Task 17: Standardize Workspace Dependency Spec
**Problem:** Inconsistent @jackoatmon/opencode-* references

**Strategy:** Use `workspace:*` consistently

**Commit:** `chore(deps): standardize internal workspace dependency spec`

---

## Success Metrics

| Wave | Tasks | Deliverable | Verification |
|------|-------|-------------|--------------|
| 7A | 6 | Security/integrity fixes | `bun test`, auth tests pass |
| 7B | 2 | Return types added, `any` reduced | `tsc --noEmit` passes |
| 7C | 3 | Dead code removed | `bun test` passes, bundle size ↓ |
| 7D | 2 | Logger adoption, correlation | console.* count ↓ 50% |
| 7E | 4 | Deps fixed, CVEs patched | `bun audit` → 0 critical/high |

**Total Estimated Risk Points Reduced:** ~140

---

## Execution Strategy

**Parallel Waves:**
- Wave 7A tasks 1-4: Can run in parallel (different packages)
- Wave 7A tasks 5-6: Sequential (config-loader → quota-manager)
- Wave 7B: Parallel with 7A completion
- Wave 7C: After 7B (code health)
- Wave 7D: Parallel with 7C
- Wave 7E: Embarrassingly parallel (independent packages)

**Dependencies:**
- Task 2 (auth gate) → Before Task 4 (state mutation auth)
- Task 5 (AJV) → Before Task 6 (quota validation)
- Task 14 (missing deps) → Before any package tests

---

## Notes

**Guardrails (Must NOT):**
- Do NOT change module.exports shapes (backward compatibility)
- Do NOT remove functions without deprecation period (use @deprecated first)
- Do NOT add breaking changes to public APIs
- Do NOT skip tests for security fixes

**Acceptance Criteria per Task:**
- [ ] Implementation matches spec
- [ ] Tests added/regression tests pass
- [ ] `bun test` full suite passes
- [ ] Commit with Learning-Update trailer
- [ ] LSP diagnostics clean

---

## Plan Metadata

**Created:** 2026-02-25
**Based on:** Wave 7 Audit Findings
**Total Tasks:** 17
**Estimated Duration:** 3-4 hours (subagent-driven)
**Estimated Risk Points:** ~140
