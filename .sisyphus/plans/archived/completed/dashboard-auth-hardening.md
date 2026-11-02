# Dashboard API Auth Hardening Plan

## Goal
Close the last hardening backlog item (Concern 2): ensure every mutable dashboard endpoint requires authenticated write access with a specific RBAC permission.

## Architecture
Extend existing RBAC system in `write-access.ts` with 4 new permissions. Gate 3 unprotected POST endpoints and fix 1 endpoint missing its permission argument. Add regression test that structurally enforces all POST route exports call `requireWriteAccess` with a specific permission string.

## Current State
- 6/10 POST endpoints properly guarded with specific permissions
- 3 endpoints completely unprotected: `status/usage`, `providers`, `orchestration`
- 1 endpoint (`skills/promotions`) calls `requireWriteAccess(request)` without permission arg
- Existing RBAC: admin (9 perms), operator (7 perms), viewer (2 perms)

## Constraints
- MUST NOT break existing auth behavior for already-guarded endpoints
- MUST use existing `requireWriteAccess` pattern (not invent new auth mechanism)
- MUST add permissions to both admin AND operator roles (these are operational endpoints)
- TypeScript files — dashboard uses Next.js App Router with TypeScript

---

## Wave 1 (Parallel)

### Task 1: Add new permissions to ROLE_MATRIX and fix skills/promotions

**Files:**
- Modify: `packages/opencode-dashboard/src/app/api/_lib/write-access.ts`
  - Add to `ROLE_MATRIX.admin`: `'skills:promote'`, `'usage:write'`, `'providers:manage'`, `'orchestration:write'`
  - Add to `ROLE_MATRIX.operator`: `'skills:promote'`, `'usage:write'`, `'providers:manage'`, `'orchestration:write'`
- Modify: `packages/opencode-dashboard/src/app/api/skills/promotions/route.ts`
  - Line 43: Change `requireWriteAccess(request)` to `requireWriteAccess(request, 'skills:promote')`

**Verification:**
- `bun test integration-tests/dashboard-write-guard.test.ts` — existing tests still pass
- `node -c` syntax check on modified TS files (or `bun build --no-bundle` check)

### Task 2: Gate unprotected POST endpoints

**Files:**
- Modify: `packages/opencode-dashboard/src/app/api/status/usage/route.ts`
  - Add import: `import { requireWriteAccess } from '../../_lib/write-access'`
  - Add at start of POST handler: `const authError = requireWriteAccess(request, 'usage:write'); if (authError) return authError;`
- Modify: `packages/opencode-dashboard/src/app/api/providers/route.ts`
  - Add import: `import { requireWriteAccess } from '../../_lib/write-access'`
  - Add at start of POST handler: `const authError = requireWriteAccess(request, 'providers:manage'); if (authError) return authError;`
- Modify: `packages/opencode-dashboard/src/app/api/orchestration/route.ts`
  - Add import: `import { requireWriteAccess } from '../_lib/write-access'`
  - Add at start of POST handler: `const authError = requireWriteAccess(request, 'orchestration:write'); if (authError) return authError;`

**Verification:**
- `bun test integration-tests/dashboard-write-guard.test.ts` — existing tests still pass

## Wave 2 (Sequential, after Wave 1)

### Task 3: Add regression test enforcing universal auth coverage

**Files:**
- Create: `scripts/tests/dashboard-auth-coverage.test.js`
  - Scan all `packages/opencode-dashboard/src/app/api/**/route.ts` files
  - For each file containing `export async function POST`, assert it contains `requireWriteAccess(request,` (with comma, proving permission arg is present)
  - Maintain an explicit allowlist of expected POST routes (10 total) so new routes trigger test failure
- Extend: `integration-tests/dashboard-write-guard.test.ts`
  - Add test: POST /api/skills/promotions rejects without token
  - Add test: POST /api/status/usage rejects without token
  - Add test: POST /api/providers rejects without token
  - Add test: POST /api/orchestration rejects without token

**Verification:**
- `bun test scripts/tests/dashboard-auth-coverage.test.js` — all pass
- `bun test integration-tests/dashboard-write-guard.test.ts` — all pass (old + new)
- `bun test` — full regression green

### Task 4: Update hardening backlog doc

**Files:**
- Modify: `docs/model-management/HARDENING-BACKLOG.md`
  - Mark Concern 2 as DONE with summary of what was implemented

**Verification:**
- Visual review of updated backlog
