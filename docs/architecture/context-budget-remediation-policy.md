# Context Budget Remediation Policy

## Overview

This document defines the operational policy for context budget thresholds and the corresponding remediation actions required at each level.

## Threshold Semantics

| Threshold | Percentage | Status | Meaning |
|-----------|------------|--------|---------|
| Healthy | < 65% | `ok` | Budget is healthy, no action required |
| Warning | 65% - 74% | `warn` | Proactive compression recommended |
| Critical | 75% - 79% | `warning` | Compression strongly advised |
| Mandatory | 80% - 84% | `error` | Compression is now mandatory |
| Block | 85% - 94% | `critical` | Operations may be blocked |
| Emergency | >= 95% | `exceeded` | Emergency recovery required |

## Remediation Actions by Threshold

### 65% - Proactive Compression Recommended

**Runtime Behavior:**
- ContextBridge returns `action: 'compress'`
- AlertManager fires WARNING alert
- Dashboard shows yellow warning card

**Operator Actions:**
1. Consider enabling context compression: `/distill compress`
2. Review large file reads and prune if not needed
3. Use grep/ast-grep instead of reading full files when possible
4. Monitor budget dashboard for trends

**API Response:**
```json
{
  "action": "PROACTIVE_COMPRESSION",
  "must_compress": false,
  "must_block": false,
  "grace_period_ms": 60000,
  "next_step": "Enable compression if budget continues to rise"
}
```

### 75% - Critical Warning

**Runtime Behavior:**
- AlertManager fires WARNING alert with enhanced messaging
- Dashboard shows orange warning card
- Model router may begin penalizing expensive models

**Operator Actions:**
1. Enable context compression immediately
2. Review session for unnecessary token consumption
3. Consider completing current task soon
4. Switch to more efficient model if available

**API Response:**
```json
{
  "action": "CRITICAL_WARNING",
  "must_compress": false,
  "must_block": false,
  "grace_period_ms": 30000,
  "next_step": "Compress context or complete task within 30 seconds"
}
```

### 80% - Mandatory Compression

**Runtime Behavior:**
- ContextBridge returns `action: 'compress_urgent'`
- AlertManager fires CRITICAL alert
- Dashboard shows red mandatory card
- Compression becomes mandatory

**Operator Actions:**
1. Enable urgent context compression: `/distill compress_urgent`
2. Review and prune non-essential context immediately
3. Consider using Context7 for library lookups instead of full docs
4. Switch to more efficient model if available

**API Response:**
```json
{
  "action": "MANDATORY_COMPRESSION",
  "must_compress": true,
  "must_block": false,
  "grace_period_ms": 30000,
  "next_step": "Compress context within 30 seconds or risk emergency state"
}
```

### 85% - Operations Blocked

**Runtime Behavior:**
- ContextBridge returns `action: 'block'`
- AlertManager fires CRITICAL alert
- Dashboard shows blocked state UI
- New operations may be rejected

**Operator Actions:**
1. Immediately compress context: `/distill compress_urgent`
2. Complete or save current task state
3. Consider starting new session for remaining work
4. Review session history for token-heavy operations

**API Response:**
```json
{
  "action": "BLOCK",
  "must_compress": true,
  "must_block": true,
  "grace_period_ms": 0,
  "next_step": "Execute emergency compression or complete task immediately"
}
```

### 95% - Emergency Recovery

**Runtime Behavior:**
- AlertManager fires CRITICAL alert with emergency flag
- Dashboard shows emergency recovery UI
- All non-essential operations blocked
- Emergency compression triggered automatically if available

**Operator Actions:**
1. Enable emergency context compression: `/distill compress_urgent`
2. Switch to cheaper model tier if possible
3. Complete current task immediately or save state
4. Consider starting new session for remaining work

**API Response:**
```json
{
  "action": "EMERGENCY_RECOVERY",
  "must_compress": true,
  "must_block": true,
  "grace_period_ms": 0,
  "next_step": "Execute emergency compression or complete task"
}
```

## Cross-Component Consistency

### Threshold Alignment

All components use the same threshold values:

| Component | 65% | 75% | 80% | 85% | 95% |
|-----------|-----|-----|-----|-----|-----|
| ContextBridge | compress | - | compress_urgent | block | block |
| Governor | - | warn | error | - | exceeded |
| AlertManager | - | WARNING | CRITICAL | CRITICAL | CRITICAL |
| Dashboard | yellow | orange | red | blocked | emergency |

### API Contract

The `/api/budget` endpoint returns consistent guidance:

```typescript
interface BudgetResponse {
  sessionId: string;
  model: string;
  used: number;
  remaining: number;
  max: number;
  pct: number;
  status: 'ok' | 'warn' | 'error' | 'exceeded';
  remediation: {
    action: string;
    description: string;
    steps: string[];
    must_compress: boolean;
    must_block: boolean;
    grace_period_ms: number;
    next_step: string;
  };
}
```

## Testing

Run budget remediation tests:
```bash
bun test packages/opencode-model-manager/test/monitoring/alert-manager-budget-guidance.test.js
bun test packages/opencode-dashboard/tests/api/budget-route.test.ts
bun test integration-tests/context-management.test.js
```

## Policy Version

This policy is versioned. Changes to thresholds or remediation actions require:
1. Update to this document
2. Version bump in policy file
3. Communication to all teams
4. Dashboard UI updates if needed

Current version: 1.0.0
