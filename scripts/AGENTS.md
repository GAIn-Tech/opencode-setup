# AGENTS.md

## OVERVIEW
92 infrastructure scripts (.mjs) for governance, deployment, validation, and automation. Core infrastructure, not utilities.

## STRUCTURE
```
scripts/
├── governance/              # Governance checks
├── ops/                     # Operations automation
├── security/                # Security validation
├── evals/                   # Evaluation harnesses
├── fault/                   # Fault injection
├── frontier/                # Frontier model tracking
├── perf/                    # Performance monitoring
├── replay/                  # Replay utilities
├── health-check.mjs         # 11KB comprehensive health check
├── model-rollback.mjs       # 26KB rollback system
├── validate-models.mjs      # Model catalog validation (12 checks)
├── learning-gate.mjs        # Learning governance
├── deployment-state.mjs     # Deployment state management
└── weekly-model-sync.mjs    # CI model synchronization
```

## WHERE TO LOOK
| If you need... | Look in... |
|----------------|------------|
| Governance checks | learning-gate.mjs, deployment-state.mjs, pr-governance.mjs |
| Model management | model-rollback.mjs, validate-models.mjs, weekly-model-sync.mjs |
| Health monitoring | health-check.mjs, health-check.sh |
| Setup automation | setup.sh, verify-setup.mjs, install-git-hooks.mjs |
| Config validation | validate-*.mjs files |

## CONVENTIONS
- **ESM Scripts**: All .mjs files (ES modules)
- **Scripts as Infrastructure**: Not utilities — core to project operation
- **Governance-Heavy**: 92 scripts for validation/governance (unusual for typical projects)
- **Complex Logic**: health-check.mjs (11KB), model-rollback.mjs (26KB)

## ANTI-PATTERNS
None specific to scripts

## UNIQUE STYLES
- **Rollback System**: Timestamp/hash-based recovery with backup-before-restore pattern
- **Governance Gates**: Learning-gate.mjs, deployment-state.mjs run before deployment
- **12-Check Validation**: validate-models.mjs runs 12 checks with 5-min timeout
- **Weekly CI Sync**: weekly-model-sync.mjs runs in GitHub Actions

## COMMANDS
| Command | Purpose |
|---------|---------|
| bun run governance:check | Run governance gates (learning-gate + deployment-state) |
| scripts/health-check.mjs | Comprehensive system health check |
| scripts/model-rollback.mjs --to-last-good | Rollback model catalog to last good state |
| scripts/validate-models.mjs | Validate model catalog (12 checks) |
| scripts/weekly-model-sync.mjs | Weekly model discovery (CI) |
| bun run setup | Run setup.sh (6-step setup) |
