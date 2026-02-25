# Technical Debt Refinement Plan - Phase 2

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Execute security, performance, and reliability debt refinements identified in the extended 4-lens analyze-mode audit (security, performance, reliability, dependency lenses).

**Architecture:** This plan addresses debt in 3 phases: (1) Security Hardening, (2) Performance Optimization, (3) Reliability & Error Handling. Each phase contains bite-sized tasks with TDD approach.

**Tech Stack:** Bun, Node.js, Next.js 14 API Routes, SQLite, TypeScript

---

## Phase 1: Security Hardening

### Task 1: Fix Command Injection in learning-gate.mjs

**Files:**
- Modify: `scripts/learning-gate.mjs:58`

**Step 1: Identify the vulnerable code**

Current code at line 58:
```javascript
const cmd = staged
  ? 'git diff --cached --name-only'
  : `git diff --name-only ${base}...HEAD`;  // VULNERABLE: base not sanitized
```

**Step 2: Add input validation**

```javascript
// Validate base parameter against allowed characters
const sanitizedBase = base?.replace(/[^a-zA-Z0-9/_.\-]/g, '');
if (base && base !== sanitizedBase) {
  console.error('[learning-gate] WARNING: base parameter contained invalid characters, sanitized');
}
const safeBase = sanitizedBase || 'HEAD';

const cmd = staged
  ? 'git diff --cached --name-only'
  : `git diff --name-only ${safeBase}...HEAD`;
```

**Step 3: Run governance check**

```bash
bun run governance:check
```

---

### Task 2: Fix Timing Attack in Token Validation

**Files:**
- Modify: `packages/opencode-dashboard/src/app/api/_lib/write-access.ts:48`

**Step 1: Identify vulnerable code**

Current code uses simple string comparison:
```typescript
if (tokenSecret !== configuredToken) {
  return null;
}
```

**Step 2: Replace with constant-time comparison**

```typescript
import { timingSafeEqual, createHash } from 'crypto';

// In verifyToken function, replace string comparison with:
function safeStringCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return timingSafeEqual(bufA, bufB);
}

// Then use:
if (!safeStringCompare(tokenSecret, configuredToken)) {
  return null;
}
```

**Step 2: Test timing-safe comparison**

```bash
bun test integration-tests/write-access-roles.test.js
```

---

### Task 3: Add Rate Limiting Middleware

**Files:**
- Create: `packages/opencode-dashboard/src/app/api/_lib/rate-limit.ts`
- Modify: Add to write routes

**Step 1: Create rate limiter**

```typescript
// Simple in-memory rate limiter (for production, use Redis)
const requestCounts = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number = 100, windowMs: number = 60000): boolean {
  const now = Date.now();
  const record = requestCounts.get(key);
  
  if (!record || record.resetAt < now) {
    requestCounts.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  
  if (record.count >= limit) {
    return false;
  }
  
  record.count++;
  return true;
}
```

**Step 2: Add to write routes**

Add to config/route.ts, models/route.ts, models/transition/route.ts:
```typescript
import { rateLimit } from '../_lib/rate-limit';

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';
  if (!rateLimit(`write:${ip}`, 10, 60000)) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }
  // ... rest of handler
}
```

---

## Phase 2: Performance Optimization

### Task 4: Add Database Indexes

**Files:**
- Modify: `packages/opencode-model-manager/src/lifecycle/audit-logger.js`

**Step 1: Add index on model_id**

In the SQLite database initialization, add:
```javascript
// After table creation, add indexes
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_audit_model_id ON audit_log(model_id);
  CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
  CREATE INDEX IF NOT EXISTS idx_audit_model_timestamp ON audit_log(model_id, timestamp DESC);
`);
```

**Step 2: Test index creation**

```bash
# Verify indexes exist
sqlite3 packages/opencode-model-manager/audit.db ".indexes audit_log"
```

---

### Task 5: Add Pagination to History Queries

**Files:**
- Modify: `packages/opencode-model-manager/src/lifecycle/state-machine.js:142-150`

**Step 1: Modify getHistory to accept pagination**

```javascript
getHistory(modelId, options = {}) {
  const { limit = 100, offset = 0 } = options;
  
  const stmt = this.db.prepare(`
    SELECT * FROM model_lifecycle_history
    WHERE model_id = ?
    ORDER BY timestamp DESC
    LIMIT ? OFFSET ?
  `);
  
  return stmt.all(modelId, limit, offset);
}
```

**Step 2: Update route handlers**

In dashboard API routes that call getHistory, add pagination params.

---

### Task 6: Replace Sync File I/O with Async

**Files:**
- Modify: `packages/opencode-dashboard/src/app/api/_lib/write-audit.ts:64`

**Step 1: Replace appendFileSync with async append**

```typescript
import { appendFile } from 'fs/promises';

export async function appendWriteAuditEntry(entry: WriteAuditEntry, options?: AppendWriteAuditOptions): Promise<void> {
  const auditPath = options?.auditPath || DEFAULT_AUDIT_PATH;
  
  // ... hash computation ...
  
  // Use async append instead of sync
  await appendFile(auditPath, `${JSON.stringify(payload)}\n`, 'utf-8');
  
  // ... update lastHash ...
}
```

---

## Phase 3: Reliability & Error Handling

### Task 7: Standardize Error Response Format

**Files:**
- Create: `packages/opencode-dashboard/src/app/api/_lib/error-response.ts`
- Modify: All API routes

**Step 1: Create error response builder**

```typescript
export function errorResponse(message: string, status: number = 500, details?: unknown) {
  return NextResponse.json({
    error: message,
    ...(details && { details }),
    timestamp: new Date().toISOString()
  }, { status });
}

export function successResponse(data: unknown) {
  return NextResponse.json({
    data,
    timestamp: new Date().toISOString()
  });
}
```

**Step 2: Replace inconsistent error responses**

Search for patterns like:
- `{ message: '...', error: String(error) }`
- `{ error: String(error) }`
- `{ error: message }`

Replace all with `errorResponse()`.

---

### Task 8: Replace Silent Catch Blocks

**Files:**
- Modify: `packages/opencode-dashboard/src/app/api/models/route.ts:54-56`
- Modify: `packages/opencode-dashboard/src/app/api/health/route.ts:66-68`
- Modify: `packages/opencode-dashboard/src/app/api/memory-graph/route.ts`

**Step 1: Replace silent catches**

Before:
```typescript
} catch {
  continue;  // Silent skip
}
```

After:
```typescript
} catch (error) {
  console.error('[models] Failed to get model usage:', error);
  continue;
}
```

**Step 2: Verify with tests**

```bash
bun test
```

---

### Task 9: Add Error Boundaries to React Components

**Files:**
- Create: `packages/opencode-dashboard/src/app/error.tsx`
- Create: `packages/opencode-dashboard/src/components/ErrorBoundary.tsx`

**Step 1: Create Next.js error boundary**

```typescript
'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[ConfigViewer] Error:', error);
  }, [error]);

  return (
    <div className="p-4 border border-red-500 rounded">
      <h2 className="text-red-500">Something went wrong</h2>
      <p className="text-gray-600">{error.message}</p>
      <button onClick={reset} className="btn btn-primary mt-2">
        Try again
      </button>
    </div>
  );
}
```

**Step 2: Wrap components**

Add error boundary to ConfigViewer and other dashboard components.

---

## Phase 4: IDOR Fix

### Task 10: Add RBAC to Audit Endpoint

**Files:**
- Modify: `packages/opencode-dashboard/src/app/api/models/audit/route.ts`

**Step 1: Add role verification**

```typescript
import { verifyRole } from '../../_lib/write-access';

export async function GET(request: Request) {
  const token = request.headers.get('authorization')?.replace('Bearer ', '');
  
  // Add RBAC check
  if (!verifyRole(token, 'audit:read')) {
    return NextResponse.json({ error: 'Forbidden: audit:read role required' }, { status: 403 });
  }
  
  // ... rest of handler
}
```

---

## Execution Notes

- Run each task independently with test verification
- Commit after each passing task
- Focus on Tasks 1-3 (Security) for maximum immediate impact
- Then Tasks 4-6 (Performance)
- Then Tasks 7-10 (Reliability + IDOR)

---

**Plan complete and saved to `.sisyphus/plans/2026-02-24-debt-refinement-phase2.md`.**

**Two execution options:**

1. **Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

2. **Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
