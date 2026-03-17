# OpenCode Architecture: Quick Reference

**Last Updated**: 2026-03-16 | **Status**: 10/11 backlog items complete

---

## System at a Glance

| Aspect | Details |
|--------|---------|
| **Type** | Bun-native monorepo (33 packages) |
| **Runtime** | Bun 1.3.10 (NOT Node.js compatible) |
| **Delivery Model** | Wave-based (8 completed, Wave 12 in progress) |
| **Governance** | 46 validation scripts, learning gates, deployment state |
| **Scale** | 33 packages + 12 plugins + 46 skills + 8 agents + 9 MCPs |
| **Maturity** | Production-ready (10/11 backlog items complete) |

---

## Core Components (7 Major Systems)

### 1. Model Management (Wave 12 - IN PROGRESS)
- **Status**: Plan complete, implementation in progress
- **Effort**: 40-60 hours
- **Deliverables**: Provider adapters, discovery engine, state machine, PR automation
- **Impact**: Automated model discovery + continuous provider sync

### 2. Context Management (Wave 11 - COMPLETE)
- **Status**: Production-ready
- **Thresholds**: 65% compress, 75% WARNING, 80% CRITICAL, 95% emergency
- **Components**: Governor, ContextBridge, Distill, Context7, AlertManager
- **Impact**: Prevents context overflow, optimizes model selection

### 3. Learning Engine (Wave 9 - COMPLETE)
- **Status**: Production-ready
- **Features**: Anti-pattern detection, skill affinity scoring, orchestration advice
- **Integration**: Learning gate blocks commits with anti-patterns
- **Impact**: Prevents known failure modes, improves skill selection

### 4. Dashboard & Observability (Wave 8 - COMPLETE)
- **Status**: Working (missing 'chokidar' module)
- **Tech**: Next.js
- **Features**: Model matrix, context budget panel, lifecycle badges
- **Impact**: Real-time visibility into system state

### 5. State Machine & Persistence (Wave 8 - COMPLETE)
- **Status**: Production-ready
- **Tech**: SQLite event sourcing
- **Features**: Durable workflow execution, crash-resume, audit logs
- **Impact**: Recoverable from any state

### 6. Model Router & Fallback (Wave 7 - COMPLETE)
- **Status**: Production-ready
- **Features**: Policy-based selection, 16-model fallback chain, circuit breaker
- **Impact**: Resilient model selection with automatic fallback

### 7. Safety & Governance (Wave 6 - COMPLETE)
- **Status**: Production-ready
- **Features**: Deployment gate, automated runbooks, destructive command blocking
- **Impact**: Prevents regressions, maintains system coherence

---

## High-ROI Improvements (Ranked by Impact)

### TIER 1: CRITICAL (Blocks Completion)

| # | Item | Effort | Impact | Status |
|---|------|--------|--------|--------|
| 1 | Model Management Protocol (Wave 12) | 40-60h | Automated model discovery | In Progress |
| 2 | Dashboard File-Watcher Fix | 2-4h | Unblocks observability | Known Issue |

### TIER 2: HIGH (Improves Reliability)

| # | Item | Effort | Impact | Status |
|---|------|--------|--------|--------|
| 3 | Central Config Migration | 20-30h | Reduces fragmentation | In Progress |
| 4 | Plugin npm Publishing | 8-12h | Enables portability | Blocked |
| 5 | MCP Server Wiring | 6-10h | Unlocks web search, browser automation | Requires Setup |

### TIER 3: MEDIUM (Improves Observability)

| # | Item | Effort | Impact | Status |
|---|------|--------|--------|--------|
| 6 | Metrics Expansion | 15-20h | Real-time visibility | Partial |
| 7 | Integration Test Coverage | 20-30h | Regression prevention | Partial |
| 8 | Documentation Consolidation | 10-15h | Reduce onboarding friction | Needed |

---

## Critical Constraints (MUST KNOW)

### CRITICAL (System-Breaking)

1. **Bun v1.3.x ENOENT Segfault**
   - spawn operations crash on ENOENT
   - **Fix**: Always check command existence first

2. **Core Learning Decay**
   - If persistence === 'core', weight is ALWAYS 1.0 (never decays)
   - **Fix**: Use 'session' or 'project' persistence

3. **Atomic Write Verification**
   - File corruption after atomic writes
   - **Fix**: Always verify file integrity after writes

### HIGH (Forbidden)

4. **Shotgun Debugging**
   - Multiple failed attempts without systematic approach
   - **Trigger**: attempt_number >= 3 on same file
   - **Fix**: Use systematic-debugging skill

---

## Config Files (6 Total)

| File | Purpose | Sync Status |
|------|---------|-------------|
| `opencode.json` | Plugins + MCPs + models | Manual |
| `oh-my-opencode.json` | Agents + model overrides | Manual |
| `compound-engineering.json` | Skills + commands | Manual |
| `config.yaml` | Global rules | Manual |
| `central-config.json` | NEW (Wave 12) - unified | Planned |
| `.opencode.config.json` | Legacy | Deprecated |

**Problem**: 6 files, manual sync, drift detection needed  
**Solution**: Central Config migration (Wave 12)

---

## Key Commands

```bash
# Setup & Verification
bun run setup                    # 6-step setup
bun run verify:strict           # Strict verification
bun run governance:check        # Run governance gates

# Model Management
bun run models:sync             # Weekly sync
bun run models:validate         # Validate catalog

# Health & Integrity
bun run health                  # System health check
bun run integrity:check         # File/config validation

# Testing
bun test                        # Run all tests (253 tests)

# Dashboard
cd packages/opencode-dashboard && bun run dev
```

---

## Data Flows (3 Critical Paths)

### Model Selection
```
Task Context → Model Router → Context Governor → Budget Penalty → Fallback Chain → Selected Model
```

### Learning
```
Session Logs → Pattern Extractor → Anti-Pattern Catalog → Orchestration Advisor → Learning Gate
```

### Model Management (Wave 12)
```
Provider APIs → Adapters → Discovery → Cache → Diff → State Machine → PR Automation → Dashboard
```

---

## Disaster Recovery

**Location**: `~/.opencode-dr/`  
**Dependencies**: Python 3 stdlib + Bash only (zero external deps)

| Component | Purpose |
|-----------|---------|
| `backup.sh` | 7-rotation, tar+gzip, SHA256 |
| `validate.sh` | 5 Python health checks |
| `recover.sh` | Interactive menu (list/restore/emergency-reset) |
| `test-recovery.sh` | 5 integration tests |

---

## Plugin Status

### Working (12 plugins)
- oh-my-opencode, antigravity-auth, supermemory, dcp, safety-net, rate-limit-fallback, notifier, langfuse, preload-skills, envsitter-guard, antigravity-quota, pty

### Available but Not Loaded (8 plugins)
- model-router-x, plugin-healthd, eval-harness, context-governor, runbooks, proofcheck, memory-graph, fallback-doctor

**Problem**: Not published to npm  
**Solution**: Publish to npm (8-12 hours)

---

## MCP Server Status

### Enabled (6)
- context7, sequentialthinking, websearch, grep, distill-mcp, supermemory

### Disabled (3)
- tavily (needs TAVILY_API_KEY)
- playwright (heavy, browser automation)
- github (needs GITHUB_TOKEN)

**Problem**: 3 MCPs disabled  
**Solution**: Set up API keys + enable (6-10 hours)

---

## Backlog Progress

| Item | Status | Effort | Impact |
|------|--------|--------|--------|
| 1. Disaster Recovery | ✅ Complete | 30h | High |
| 2. Safety & Governance | ✅ Complete | 25h | High |
| 3. Model Router | ✅ Complete | 35h | High |
| 4. Dashboard & State Machine | ✅ Complete | 40h | High |
| 5. Learning Engine | ✅ Complete | 30h | High |
| 6. System Hardening | ✅ Complete | 20h | Medium |
| 7. Context Management | ✅ Complete | 35h | High |
| 8. Config Coherence | ✅ Complete | 25h | Medium |
| 9. Skill System Upgrade | ✅ Complete | 20h | Medium |
| 10. Integration Tests | ✅ Complete | 30h | Medium |
| 11. Model Management Protocol | 🔄 In Progress | 50h | Critical |

**Progress**: 10/11 items complete (91%)

---

## Next Steps (Priority Order)

### This Week
1. Fix Dashboard File-Watcher (2-4h) → Unblocks observability
2. Start Model Management Protocol (Wave 12) → Critical path

### This Month
3. Migrate to Central Config (20-30h) → Reduces fragmentation
4. Publish Custom Plugins (8-12h) → Enables portability
5. Enable Remaining MCPs (6-10h) → Completes ecosystem

### Next Quarter
6. Expand Metrics (15-20h) → Real-time visibility
7. Improve Test Coverage (20-30h) → Regression prevention
8. Consolidate Docs (10-15h) → Reduce onboarding friction

---

## Success Metrics

| Metric | Current | Target | Timeline |
|--------|---------|--------|----------|
| Config files | 6+ | 1 | Wave 12 |
| Plugin auto-load | 0% (custom) | 100% | This month |
| MCP coverage | 67% | 100% | This month |
| Backlog completion | 91% | 100% | Next month |
| Test coverage | Partial | >80% | Next quarter |

---

## Related Docs

- **CODEBASE-OVERVIEW.md**: Comprehensive architecture guide (this file)
- **ARCHITECTURE-INSIGHTS.md**: Strategic recommendations
- **AGENTS.md**: System overview, conventions, anti-patterns
- **COMPLETE-INVENTORY.md**: Detailed component inventory
- **STATUS.md**: Current status, plugin configuration
- **Model Management Plan**: `.sisyphus/plans/model-management-protocol.md` (957 lines)

---

**Total Estimated Effort for All Improvements**: 100-150 hours  
**Estimated ROI**: 3-5x (reduced manual work, improved reliability, faster iteration)  
**Timeline**: 2-3 months (with parallel execution)

---

**Generated**: 2026-03-16 | **Next Review**: 2026-04-16
