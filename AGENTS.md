# AGENTS.md

## OVERVIEW
OpenCode ecosystem: Bun-native monorepo (34 packages) for AI agent orchestration, model management, learning engine, and dashboard. NOT Node.js-compatible without adaptation.

## STRUCTURE
```
.
├── packages/              # 34 workspace packages (opencode-*)
├── plugins/               # 14 external OpenCode plugins (oh-my-opencode, antigravity-auth)
├── scripts/               # 32 .mjs infrastructure scripts (governance, deployment, validation)
├── opencode-config/       # Central config hub (agents, skills, models, learning-updates)
├── .sisyphus/             # Persistent workflow state (plans, notepads, docs)
├── .worktrees/            # Git worktrees for isolated feature branches
├── local/oh-my-opencode/  # 2,187 files, 30 AGENTS.md files (see local/oh-my-opencode/AGENTS.md)
├── mcp-servers/           # MCP server configurations
├── integration-tests/     # E2E and regression test suites
├── orchestrate-bridge/    # Session/memory graph bridge utilities
└── docs/                  # Architecture, plans, model management docs
```

## WHERE TO LOOK
| If you need... | Look in... |
|----------------|------------|
| Package implementation | packages/opencode-{name}/ |
| External plugins | plugins/ |
| Infrastructure automation | scripts/ (32 .mjs files) |
| Agent/skill/model config | opencode-config/ |
| Workflow state | .sisyphus/ |
| Feature branches | .worktrees/ |
| Model management | packages/opencode-model-manager/ |
| Dashboard/UI | packages/opencode-dashboard/ (Next.js) |
| State machine | packages/opencode-sisyphus-state/ (347 files) |
| Learning engine | packages/opencode-learning-engine/ |
| Test utilities | packages/opencode-test-utils/ |
| Integration tests | packages/opencode-integration-layer/tests/ (138 files) |

## CONVENTIONS (Deviations Only)
- **Bun-First**: bunfig.toml, .bun-version (1.3.9), NOT npm/yarn compatible
- **Dual Plugins**: plugins/ (external) + packages/ (internal workspace packages)
- **Config Fragmentation**: 6+ config files (opencode.json 116KB, central-config.json, oh-my-opencode.json, compound-engineering.json, config.yaml, .opencode.config.json)
- **SQLite in Packages**: packages/opencode-model-manager/audit.db (database files in source tree)
- **No Build Step**: Source files consumed directly (except opencode-dashboard/.next/)
- **Mixed Modules**: ESM (type: "module") and CJS (type: "commonjs") inconsistently
- **Flat Namespace**: opencode-* prefix, NOT @org/ scoped packages
- **Scripts as Infrastructure**: 32 .mjs files are core infrastructure, not utilities
- **Documentation Versioned**: 20+ markdown files at root (STATUS.md, COMPLETE-INVENTORY.md, MODEL_AUDIT_REPORT.md)

## ANTI-PATTERNS
**CRITICAL (Must Avoid)**:
- **Bun v1.3.x ENOENT Segfault**: spawn operations crash on ENOENT. ALWAYS check command existence first (see packages/opencode-crash-guard/src/spawn-guard.js)
- **Core Learning Decay**: If learning.persistence === 'core', weight is ALWAYS 1.0 (never decays). See packages/opencode-learning-engine/src/index.js:134
- **Atomic Write Verification**: ALWAYS verify file integrity after atomic writes (corruption detection)

**HIGH (Forbidden)**:
- **Shotgun Debugging**: ALWAYS use systematic-debugging skill. Read errors fully before editing. Triggered when attempt_number >= 3 on same file (packages/opencode-learning-engine/src/orchestration-advisor.js:441)

**SQL**:
- **ON CONFLICT DO NOTHING**: Intentional for idempotent logging (packages/opencode-model-manager/src/lifecycle/audit-logger.js:295). Do NOT change to UPDATE.

**WARNINGS**:
- **Context Budget**: 80% = CRITICAL, 75% = WARNING (packages/opencode-context-governor/src/index.js:86,90)
- **Crash Frequency**: >N crashes/hour triggers WARNING (packages/opencode-crash-guard/src/crash-recovery.js:153)

## UNIQUE STYLES
- **Wave-Based Development**: Features organized by "Wave" (Wave 8.1, 8.2, etc.)
- **Governance-Heavy CI**: 32 validation/governance scripts (learning-gate.mjs, deployment-state.mjs, health-check.mjs)
- **Immutable Audit Logs**: Hash chain integrity (packages/opencode-model-manager/src/lifecycle/audit-logger.js)
- **Risk-Based Auto-Approval**: Model approval thresholds (0-50 auto, 50-80 manual, >80 block)
- **Rollback System**: Timestamp/hash-based recovery (scripts/model-rollback.mjs)
- **Monitoring Metrics**: Discovery success rate, cache hit/miss L1/L2, state transitions, PR creation rate

## COMMANDS
| Command | Purpose |
|---------|---------|
| bun test | Run all tests (253 tests, 1,676 assertions, Bun test framework) |
| bun run build | Build dashboard (Next.js only package with build step) |
| bun run setup | 6-step setup (install, config, validation, health, learning, state) |
| bun run governance:check | Run governance gates (learning-gate.mjs, deployment-state.mjs) |
| bun run models:sync | Weekly model catalog synchronization |
| bun run state:deploy | Deployment state management |
| scripts/model-rollback.mjs | Rollback model catalog (--to-last-good, --to-timestamp, --dry-run) |
| scripts/validate-models.mjs | Validate model catalog (12 checks, 5-min timeout) |
| scripts/health-check.mjs | Comprehensive system health check (11KB script) |
