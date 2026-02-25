# AGENTS.md

## OVERVIEW
Model lifecycle management system with discovery, assessment, approval workflow, and monitoring. SQLite-backed with immutable audit logs.

## STRUCTURE
```
src/
├── adapters/          # 6 provider adapters (OpenAI, Anthropic, Google, Groq, Cerebras, NVIDIA)
├── discovery/         # Parallel discovery engine (<10s)
├── cache/             # Two-tier caching (L1: 5min, L2: 1hr)
├── snapshot/          # Snapshot store + diff engine
├── assessment/        # Real benchmark assessor (HumanEval, MBPP, latency)
├── lifecycle/         # 5-state machine (detected→assessed→approved→selectable→default)
├── metrics/           # 4-pillar metrics (accuracy, latency, cost, robustness)
├── monitoring/        # Metrics collector + alert manager
├── events/            # Change event system
├── validation/        # Catalog validator (12 checks)
└── pr/                # PR generator for catalog updates

test/                  # 320 tests, 1,845 assertions, 0 failures
audit.db               # Tamper-evident audit log (hash chain)
```

## WHERE TO LOOK
| If you need... | Look in... |
|----------------|------------|
| Provider integration | src/adapters/ |
| Model discovery | src/discovery/ |
| Lifecycle state machine | src/lifecycle/state-machine.js |
| Audit logging | src/lifecycle/audit-logger.js |
| Auto-approval rules | src/lifecycle/auto-approval-rules.js |
| Metrics collection | src/metrics/ + src/monitoring/ |
| Catalog validation | src/validation/ |
| PR automation | src/pr/ |

## CONVENTIONS
- **No package.json**: Internal library, not published package
- **SQLite in Package Root**: audit.db, audit.db-shm, audit.db-wal (non-standard location)
- **Immutable Audit Logs**: Hash chain integrity, append-only
- **5-State Lifecycle**: detected→assessed→approved→selectable→default (no skipping)
- **Risk-Based Approval**: 0-50 auto, 50-80 manual, >80 block
- **Two-Tier Caching**: L1 (5min in-memory), L2 (1hr SQLite)
- **Parallel Discovery**: All providers queried concurrently (<10s total)

## ANTI-PATTERNS
- **ON CONFLICT DO NOTHING**: Intentional for idempotent logging (src/lifecycle/audit-logger.js:295). Do NOT change to UPDATE.
- **Hash Chain Integrity**: NEVER modify previousHash in audit log (tamper detection)
- **State Transitions**: NEVER skip states (guarded transitions enforced)

## UNIQUE STYLES
- **Snapshot Diffing**: 100% accuracy change detection
- **Tamper-Evident Logging**: Genesis hash '0', chain verification
- **Auto-Approval Metadata**: Risk factors stored in audit log
- **Monitoring Metrics**: Discovery success rate, cache hit/miss, state transitions, PR creation rate
- **Rollback Support**: Timestamp/hash-based recovery (see scripts/model-rollback.mjs)

## COMMANDS
| Command | Purpose |
|---------|---------|
| bun test packages/opencode-model-manager/test/ | Run all model manager tests (320 tests) |
| scripts/validate-models.mjs | Validate model catalog (12 checks, 5-min timeout) |
| scripts/model-rollback.mjs --to-last-good | Rollback to last good catalog state |
| scripts/weekly-model-sync.mjs | Weekly model discovery (CI workflow) |
