# AGENTS.md Drift Report — 2026-03-29

## Summary
Found 3 drift issues across 2 AGENTS.md files.

## Drift Details

### AGENTS.md
| Claim | Documented | Actual | Delta |
|-------|-----------|--------|-------|
| Script count | 92 | 93 | +1 |

### scripts/AGENTS.md
| Claim | Documented | Actual | Delta |
|-------|-----------|--------|-------|
| Script count | 92 | 93 | +1 |
| Script count | 92 | 93 | +1 |

## Proposed Fixes

### AGENTS.md
```diff
- ├── scripts/               # 92 .mjs infrastructure scripts (governance, deployment, validation)
+ ├── scripts/               # 93 .mjs infrastructure scripts (governance, deployment, validation)
```

### scripts/AGENTS.md
```diff
- 92 infrastructure scripts (.mjs) for governance, deployment, validation, and automation. Core infrastructure, not utilities.
+ 93 infrastructure scripts (.mjs) for governance, deployment, validation, and automation. Core infrastructure, not utilities.
- - **Governance-Heavy**: 92 scripts for validation/governance (unusual for typical projects)
+ - **Governance-Heavy**: 93 scripts for validation/governance (unusual for typical projects)
```
