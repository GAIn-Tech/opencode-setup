# Context Budget Remediation Policy

## Overview

This document defines the operational policy for context budget thresholds and the corresponding remediation actions required at each level.

## Threshold Semantics

| Threshold | Percentage | Status | Meaning |
|-----------|------------|--------|---------|
| Healthy | < 65% | `ok` | Budget is healthy |
| Warning | 65% - 74% | `warn` | Proactive compression recommended |
| Critical | 75% - 79% | `warning` | Compression strongly advised |
| Mandatory | 80% - 84% | `error` | Compression is mandatory |
| Block | 85% - 94% | `critical` | Operations should be blocked |
| Emergency | >= 95% | `exceeded` | Emergency recovery required |

## API Contract

`/api/budget` should expose remediation metadata with:

- `action`
- `description`
- `steps`
- `must_compress`
- `must_block`
- `grace_period_ms`
- `next_step`

## Operational Guidance

- At 65%: recommend proactive compression
- At 75%: show critical warning and compress soon
- At 80%: compression mandatory
- At 85%: block new heavy operations
- At 95%: emergency recovery workflow

## Verification

Run:

```bash
bun test packages/opencode-model-manager/test/monitoring/alert-manager-budget-guidance.test.js
bun test packages/opencode-dashboard/test/budget-route.test.ts
bun run build
```
