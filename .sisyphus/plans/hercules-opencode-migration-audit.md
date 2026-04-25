# Hercules: OpenCode Feature Migration Audit

## Executive Summary

**Audit Goal**: Identify which OpenCode features should be migrated to Hercules, ensuring we keep valuable functionality without duplication or crowding.

**Audit Criteria**:
1. ✅ **Value**: Does it solve a real problem?
2. ✅ **Compatibility**: Does it fit Hercules' architecture?
3. ✅ **Uniqueness**: Does Hercules lack this?
4. ❌ **Duplication**: Does Hercules do this better already?
5. ❌ **Tech Debt**: Is this part of OpenCode's problems?

**Overall Strategy**: **Cherry-pick, don't port wholesale**. Take patterns and lessons, not code.

---

## Package-by-Package Analysis

### Tier 1: MUST PORT (High Value, Compatible)

#### 1. **opencode-codebase-memory** ⭐ HIGHEST PRIORITY
**What it does**: Indexes codebase symbols into SQLite (AST parsing, call graphs, FTS5 search)

**Current Status**: Orphaned but production-ready (3,595 lines, score: 7.5/10)

**Value Assessment**:
- ✅ Solves "what's in this codebase?" problem
- ✅ Fast symbol lookup (< 10ms)
- ✅ Graph queries (callers/callees)
- ✅ Impact analysis ("what breaks if I change X?")
- ✅ Incremental indexing (SHA256 content hashes)

**Hercules Integration**:
- **Port to**: `hercules/memory/tier1/` (SQLite working memory)
- **Enhance with**: Provenance, confidence, TTL (VMG features)
- **Keep**: AST parsing, graph schema, incremental updates
- **Modify**: Add crypto signing, add VMG metadata fields

**Porting Effort**: Medium (2-3 weeks)
- Core logic: Reuse 80%
- VMG integration: Add 20%
- Language support: Expand beyond TS/JS

**Decision**: ✅ **PORT** - This is our Tier 1 memory foundation

---

#### 2. **opencode-learning-engine** ⭐ HIGH PRIORITY
**What it does**: Pattern learning from sessions (anti-patterns, positive-patterns, advice generation)

**Current Status**: Extensive implementation with hyperparameter adaptation

**Value Assessment**:
- ✅ Learns from failures/successes
- ✅ Generates advice for task types
- ✅ Anti-pattern detection
- ✅ Meta-awareness tracking

**Hercules Integration**:
- **Port to**: `hercules/learning/`
- **Integrate with**: VMG (facts about patterns)
- **Keep**: Pattern extraction, advice generation
- **Enhance**: Causal learning ("why did this fail?")

**Porting Effort**: Medium-High (4-6 weeks)
- Pattern extraction: Reuse 60%
- VMG integration: New
- Causal reasoning: New

**Decision**: ✅ **PORT** - Learning is core to self-improvement

---

#### 3. **opencode-model-router-x** ⭐ HIGH PRIORITY
**What it does**: Intelligent model selection based on task type, budget, past performance

**Current Status**: Complex routing with skill RL integration

**Value Assessment**:
- ✅ Routes to appropriate model
- ✅ Considers cost/quality tradeoffs
- ✅ Skill-based routing
- ✅ Sticky sessions

**Hercules Integration**:
- **Port to**: `hercules/cost/router.py`
- **Integrate with**: Cost Governor (budget-aware)
- **Keep**: Routing logic, performance tracking
- **Enhance**: Budget constraints, SLO requirements

**Porting Effort**: Low-Medium (2-3 weeks)
- Routing logic: Reuse 70%
- Cost integration: New

**Decision**: ✅ **PORT** - Model routing is essential

---

#### 4. **opencode-context-governor** ⭐ HIGH PRIORITY
**What it does**: Token budget tracking per session, compression advisories

**Current Status**: Real implementation with MCP interface

**Value Assessment**:
- ✅ Prevents context overflow
- ✅ Tracks per-model usage
- ✅ Triggers compression
- ✅ Alert thresholds (75%, 80%, 95%)

**Hercules Integration**:
- **Port to**: `hercules/cost/context.py`
- **Integrate with**: Cost Governor (unified budgeting)
- **Keep**: Budget tracking, threshold alerts
- **Enhance**: Unified with dollar budgeting

**Porting Effort**: Low (1-2 weeks)
- Core tracking: Reuse 90%
- Integration: Minor

**Decision**: ✅ **PORT** - Context budgeting essential

---

### Tier 2: SHOULD PORT (Medium Value, Needs Adaptation)

#### 5. **opencode-memory-graph**
**What it does**: Session↔error graphing, error frequency tracking

**Current Status**: Graph-based error analysis

**Value Assessment**:
- ✅ Tracks error patterns
- ✅ Session-to-error mapping
- ✅ Memory graph activation

**Hercules Integration**:
- **Merge with**: VMG (Tier 2 - Neo4j)
- **Port concepts**: Error nodes, session edges
- **Don't port**: Duplicate graph implementation

**Porting Effort**: Low (1 week - concepts only)

**Decision**: ✅ **CONCEPTS ONLY** - Merge into VMG

---

#### 6. **opencode-tool-usage-tracker**
**What it does**: Tracks tool usage patterns, feeds into learning

**Current Status**: Tool invocation logging

**Value Assessment**:
- ✅ Tool affinity tracking
- ✅ Skill RL feedback
- ✅ Usage patterns

**Hercules Integration**:
- **Port to**: `hercules/ledger/tools.py`
- **Integrate with**: Execution Ledger
- **Keep**: Tool invocation tracking
- **Enhance**: Link to trajectories

**Porting Effort**: Low (1 week)

**Decision**: ✅ **PORT** - Integrate with Ledger

---

#### 7. **opencode-skill-rl-manager**
**What it does**: Reinforcement learning for skill routing

**Current Status**: RL-based skill affinity

**Value Assessment**:
- ✅ Learns skill effectiveness
- ✅ Updates affinities
- ✅ Tool preference learning

**Hercules Integration**:
- **Port to**: `hercules/learning/skills.py`
- **Integrate with**: Learning Engine
- **Keep**: RL loop, affinity updates

**Porting Effort**: Medium (2-3 weeks)

**Decision**: ✅ **PORT** - Keep skill learning

---

#### 8. **opencode-runbooks**
**What it does**: Error pattern matching and remediation

**Current Status**: Error-to-runbook mapping

**Value Assessment**:
- ✅ "I've seen this error before"
- ✅ Automated remediation suggestions
- ✅ Pattern matching

**Hercules Integration**:
- **Port to**: `hercules/learning/runbooks.py`
- **Integrate with**: VMG (causal edges)
- **Enhance**: Root cause analysis

**Porting Effort**: Low-Medium (2 weeks)

**Decision**: ✅ **PORT** - Error remediation valuable

---

### Tier 3: PARTIAL PORT (Selective Features)

#### 9. **opencode-mcp-utils**
**What it does**: MCP client/server utilities

**Current Status**: MCP integration helpers

**Value Assessment**:
- ✅ Simplifies MCP integration
- ✅ Tool discovery
- ⚠️ Hercules will implement dual MCP mode anyway

**Hercules Integration**:
- **Port approach**: Reference, not code
- **Use hermes pattern**: Dual MCP mode (client + server)
- **Take**: Connection pooling, error handling

**Decision**: ⚠️ **REFERENCE ONLY** - Use hermes pattern instead

---

#### 10. **opencode-safe-io**
**What it does**: Safe file operations, backup/restore

**Current Status**: File safety layer

**Value Assessment**:
- ✅ Prevents destructive operations
- ✅ Atomic writes
- ✅ Backup/restore

**Hercules Integration**:
- **Port to**: `hercules/utils/safe_io.py`
- **Take**: Atomic write patterns
- **Enhance**: Crypto verification

**Porting Effort**: Low (1 week)

**Decision**: ⚠️ **PARTIAL PORT** - Take patterns, adapt

---

#### 11. **opencode-circuit-breaker**
**What it does**: Circuit breaker pattern for resilience

**Current Status**: Failure detection and backoff

**Value Assessment**:
- ✅ Prevents cascade failures
- ✅ Adaptive backoff
- ⚠️ Standard pattern, many implementations

**Hercules Integration**:
- **Port approach**: Use existing library (e.g., opossum)
- **Don't port**: Custom implementation

**Decision**: ❌ **DON'T PORT** - Use standard library

---

#### 12. **opencode-config-loader**
**What it does**: Config loading with validation

**Current Status**: Multi-format config loading

**Value Assessment**:
- ✅ Config validation
- ✅ Environment interpolation
- ⚠️ Hercules needs hierarchical config (swe-agent style)

**Hercules Integration**:
- **Port approach**: Adapt to hierarchical YAML
- **Take**: Validation patterns
- **Don't take**: Old config structure

**Decision**: ⚠️ **PARTIAL PORT** - Validation logic only

---

### Tier 4: DON'T PORT (Redundant or Problematic)

#### 13. **opencode-integration-layer** ❌ SKIP
**What it does**: The "god package" - couples everything

**Current Status**: 3,595 lines of tight coupling

**Problems**:
- ❌ Hidden dependencies
- ❌ Tight coupling
- ❌ Hard to test
- ❌ Part of tech debt

**Hercules Alternative**: Clean kernel with ports/adapters

**Decision**: ❌ **DO NOT PORT** - This is the problem we're solving

---

#### 14. **opencode-sisyphus-state** ❌ SKIP (Core)
**What it does**: Old agent orchestration

**Problems**:
- ❌ Monolithic
- ❌ State machine complexity
- ❌ Hard to extend

**Hercules Alternative**: Clean agent loop (swe-agent style)

**Decision**: ❌ **DO NOT PORT** - Replace with HerculesAgent

---

#### 15. **opencode-dashboard** ❌ SKIP (For Now)
**What it does**: Web UI (Next.js)

**Current Status**: Complex, requires build step

**Decision**: ❌ **SKIP FOR NOW** - CLI-first, web UI later (Phase 6)

---

#### 16. **opencode-plugin-lifecycle** ❌ SKIP
**What it does**: Plugin loading/management

**Current Status**: Plugin system

**Problems**:
- ⚠️ Plugin system needs redesign
- ⚠️ Security concerns

**Hercules Alternative**: Hermes-style tool bundles

**Decision**: ❌ **SKIP** - Redesign plugin system

---

#### 17. **opencode-model-manager** ⚠️ DEFER
**What it does**: Model catalog management

**Current Status**: Complex model registry

**Decision**: ⚠️ **DEFER** - Basic model config sufficient for v1

---

#### 18. **opencode-graphdb-bridge** ⚠️ DEFER
**What it does**: Neo4j integration

**Current Status**: GraphDB connection

**Decision**: ⚠️ **DEFER** - Build fresh for VMG needs

---

### Tier 5: UTILITY PACKAGES (Selectively Reference)

#### 19-36. **Utility packages** (eval, harness, test-utils, logger, errors, etc.)

**Decision**: ❌ **DON'T PORT WHOLESALE**

**Approach**:
- Take useful patterns
- Use standard libraries where possible
- Don't recreate infrastructure

---

## Migration Priority Matrix

| Package | Priority | Effort | Action | Hercules Destination |
|---------|----------|--------|--------|---------------------|
| **codebase-memory** | P0 | Medium | ✅ Port | `memory/tier1/` |
| **learning-engine** | P0 | High | ✅ Port | `learning/` |
| **model-router-x** | P0 | Medium | ✅ Port | `cost/router.py` |
| **context-governor** | P0 | Low | ✅ Port | `cost/context.py` |
| **tool-usage-tracker** | P1 | Low | ✅ Port | `ledger/tools.py` |
| **skill-rl-manager** | P1 | Medium | ✅ Port | `learning/skills.py` |
| **runbooks** | P1 | Medium | ✅ Port | `learning/runbooks.py` |
| **memory-graph** | P2 | Low | ⚠️ Merge | Into VMG |
| **safe-io** | P2 | Low | ⚠️ Partial | `utils/safe_io.py` |
| **config-loader** | P2 | Low | ⚠️ Partial | Validation logic |
| **mcp-utils** | P2 | Low | ⚠️ Reference | Use hermes pattern |
| **integration-layer** | - | - | ❌ Skip | Replace |
| **sisyphus-state** | - | - | ❌ Skip | Replace |
| **dashboard** | - | - | ❌ Skip | Phase 6 |
| **plugin-lifecycle** | - | - | ❌ Skip | Redesign |

---

## What Hercules Already Has (No Porting Needed)

| Feature | Hercules Implementation | OpenCode Equivalent |
|---------|------------------------|---------------------|
| **Agent Loop** | HerculesAgent (swe-agent style) | sisyphus-state |
| **Task Execution** | Built-in | task orchestration |
| **Memory (Semantic)** | VMG (Tier 2 - Neo4j) | memory-graph |
| **Memory (Archival)** | VMG (Tier 3 - Object) | (none) |
| **Budgeting** | Cost Governor | context-governor + new |
| **Cryptography** | Ledger signing | (none) |
| **Replay** | Ledger replay | (limited) |
| **Subagents** | Built-in delegation | (none) |
| **MCP Server** | Dual mode | (client only) |
| **Multi-surface** | Planned | gateway (optional) |
| **Session Continuity** | SQLite + VMG | hermes-style |

---

## Migration Phases

### Phase 1: Foundation (Weeks 1-6)
**Ports**:
- ✅ codebase-memory → Tier 1 VMG
- ✅ context-governor → Cost Governor integration

### Phase 2: Learning (Weeks 7-14)
**Ports**:
- ✅ learning-engine → Learning system
- ✅ skill-rl-manager → Skill learning
- ✅ runbooks → Error remediation

### Phase 3: Intelligence (Weeks 15-26)
**Ports**:
- ✅ model-router-x → Model routing
- ✅ tool-usage-tracker → Ledger integration

### Phase 4: Polish (Weeks 27-50)
**Selective ports**:
- ⚠️ safe-io patterns
- ⚠️ config validation

---

## Technical Debt Avoidance

### What we're NOT taking:
- ❌ Integration-layer coupling
- ❌ Sisyphus state machine complexity
- ❌ Plugin system security issues
- ❌ Dashboard build complexity
- ❌ Circuit breaker (use standard)

### What we're replacing with better:
- ✅ Monolithic orchestration → Clean agent loop
- ✅ Single memory system → Tiered VMG
- ✅ Basic cost tracking → Unified Cost Governor
- ✅ No verification → Cryptographic Ledger
- ✅ No causality → Causal VMG

---

## File Mapping

```
OpenCode Package → Hercules Module
================================

opencode-codebase-memory/src/
├── indexer.js → hercules/memory/tier1/indexer.py
├── graph-store.js → hercules/memory/tier1/store.py
└── parser.js → hercules/memory/tier1/parser.py (expand languages)

opencode-learning-engine/src/
├── index.js → hercules/learning/engine.py
├── pattern-extractor.js → hercules/learning/patterns.py
├── orchestration-advisor.js → hercules/learning/advisor.py
└── ... → hercules/learning/

opencode-model-router-x/src/
├── index.js → hercules/cost/router.py
└── model-comprehension-memory.js → hercules/cost/performance.py

opencode-context-governor/src/
├── index.js → hercules/cost/context.py
└── session-tracker.js → hercules/cost/tracker.py

opencode-tool-usage-tracker/src/
└── index.js → hercules/ledger/tools.py

opencode-skill-rl-manager/src/
└── index.js → hercules/learning/skills.py

opencode-runbooks/src/
└── ... → hercules/learning/runbooks.py

opencode-memory-graph/src/
├── concepts → Merge into VMG
└── mcp-server.mjs → hercules/mcp/server.py (patterns)

opencode-safe-io/src/
└── patterns → hercules/utils/safe_io.py

opencode-config-loader/src/
└── validation → hercules/config/validation.py
```

---

## Evidence-Based Porting Decisions

### codebase-memory (MUST PORT)
**Evidence**:
- 7.5/10 design score
- Already implements VMG Tier 1
- Graph schema is solid
- Incremental indexing works

**Decision**: Port 80% of code, enhance with VMG metadata

### learning-engine (MUST PORT)
**Evidence**:
- Pattern learning is unique
- Anti-pattern detection valuable
- Meta-awareness useful

**Decision**: Port core logic, integrate with VMG

### integration-layer (SKIP)
**Evidence**:
- Couples 15+ packages
- 3,595 lines of tech debt
- Hard to test

**Decision**: Replace with clean architecture

### dashboard (DEFER)
**Evidence**:
- Next.js complexity
- Build step required
- Not essential for MVP

**Decision**: Phase 6, after CLI stable

---

## Summary

| Category | Count | Weeks |
|----------|-------|-------|
| **Must Port** | 4 | 8-12 |
| **Should Port** | 4 | 4-6 |
| **Partial Port** | 4 | 2-4 |
| **Skip** | 8+ | 0 |
| **TOTAL PORTING** | ~12 packages | 14-22 weeks |

**Porting Strategy**: Cherry-pick valuable features, leave tech debt behind.

**Hercules will have**:
- ✅ Clean architecture (no integration-layer coupling)
- ✅ Tiered memory (VMG)
- ✅ Provable actions (Ledger)
- ✅ Predictable costs (Governor)
- ✅ Smart learning (ported + enhanced)
- ✅ Fast code understanding (ported codebase-memory)

**Hercules will NOT have**:
- ❌ Monolithic orchestration
- ❌ Tight coupling
- ❌ Tech debt
- ❌ Build complexity (Phase 1)
- ❌ Plugin security issues

---

**Next Step**: Prioritize porting tasks and add to Hercules master plan
