# OpenCode v3: Master Migration & Enhancement Plan

## Executive Summary

**Project**: Build a bleeding-edge, fully autonomous AI coding platform with kernel-first architecture, verifiable memory, provable actions, and predictable costs.

**Timeline**: 50 weeks (10 months)
**Scope**: Complete rewrite with 95% backward compatibility
**Philosophy**: Full creative control, zero external service dependencies

**Core Differentiators**:
1. **Verified Memory Graph** (VMG) - Facts with evidence, not just text
2. **Execution Ledger** - Provable, replayable actions
3. **Cost Governance** - Predictable budgets with SLOs
4. **Kernel-First** - Clean architecture from day one
5. **Full Autonomy** - Self-evolving with safety guardrails

---

## Strategic Architecture

### System Layers

```
┌─────────────────────────────────────────────────────────────────────────┐
│ LAYER 6: AUTONOMY & LEARNING                                            │
│ ┌──────────────┬──────────────┬──────────────┬──────────────┐            │
│ │Self-Evolve   │Trajectory    │Pattern       │Meta-         │            │
│ │Loop          │Learning      │Extraction    │Cognition     │            │
│ └──────────────┴──────────────┴──────────────┴──────────────┘            │
├─────────────────────────────────────────────────────────────────────────┤
│ LAYER 5: MEMORY & KNOWLEDGE (VMG)                                       │
│ ┌──────────────┬──────────────┬──────────────┬──────────────┐            │
│ │Tier 1        │Tier 2        │Tier 3        │Memory        │            │
│ │(SQLite)      │(Neo4j)       │(Object       │Governance    │            │
│ │Working       │Semantic      │Storage)      │(Quality)     │            │
│ │Memory        │Memory        │Archival      │              │            │
│ └──────────────┴──────────────┴──────────────┴──────────────┘            │
├─────────────────────────────────────────────────────────────────────────┤
│ LAYER 4: VERIFICATION & AUDIT                                           │
│ ┌──────────────┬──────────────┬──────────────┬──────────────┐            │
│ │Execution     │Cryptographic │Deterministic│Audit         │            │
│ │Ledger        │Signing       │Replay        │Dashboard     │            │
│ └──────────────┴──────────────┴──────────────┴──────────────┘            │
├─────────────────────────────────────────────────────────────────────────┤
│ LAYER 3: COST & SLO GOVERNANCE                                          │
│ ┌──────────────┬──────────────┬──────────────┬──────────────┐            │
│ │Budget        │Model         │SLO           │Policy        │            │
│ │Manager       │Router        │Monitor       │Engine        │            │
│ └──────────────┴──────────────┴──────────────┴──────────────┘            │
├─────────────────────────────────────────────────────────────────────────┤
│ LAYER 2: ORCHESTRATION & AGENTS                                         │
│ ┌──────────────┬──────────────┬──────────────┬──────────────┐            │
│ │Task          │Agent         │Workflow      │Parallel      │            │
│ │Scheduler     │Lifecycle     │Engine        │Execution     │            │
│ └──────────────┴──────────────┴──────────────┴──────────────┘            │
├─────────────────────────────────────────────────────────────────────────┤
│ LAYER 1: KERNEL & ADAPTERS (Strangler)                                  │
│ ┌──────────────┬──────────────┬──────────────┬──────────────┐            │
│ │Strict-Mode   │Capability    │Port          │Adapter       │            │
│ │Bootstrap     │Registry      │Interfaces    │Layer         │            │
│ └──────────────┴──────────────┴──────────────┴──────────────┘            │
├─────────────────────────────────────────────────────────────────────────┤
│ LAYER 0: INFRASTRUCTURE                                                 │
│ ┌──────────────┬──────────────┬──────────────┬──────────────┐            │
│ │SQLite        │Neo4j         │MCP           │Plugin        │            │
│ │(Local)       │(Graph DB)    │(Tool Bridge) │(Extensions)  │            │
│ └──────────────┴──────────────┴──────────────┴──────────────┘            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Master Timeline

```
Phase 1: Bootstrap (Weeks 1-6)
├── Week 1-2: Workspace Setup
├── Week 3-4: Strict-Mode Kernel
└── Week 5-6: Port Interfaces

Phase 2: Adapters (Weeks 7-16)
├── Week 7-10: Core Package Adapters (5)
├── Week 11-13: Plugin Adapters (12)
└── Week 14-16: Script Migration (84)

Phase 3: VMG (Weeks 17-28) [PARALLEL]
├── Week 17-18: Neo4j Infrastructure
├── Week 19-22: Hybrid Memory Core
└── Week 23-28: Advanced Features

Phase 4: Execution Ledger (Weeks 29-36) [PARALLEL]
├── Week 29-30: Trace Capture
├── Week 31-32: Cryptography
└── Week 33-36: Replay Engine

Phase 5: Cost Governance (Weeks 37-40)
├── Week 37: Budget Manager
├── Week 38: Policy Engine
└── Week 39-40: SLO Monitoring

Phase 6: CLI & Integration (Weeks 41-46)
├── Week 41-42: SWE-Agent UI
├── Week 43-44: Command Structure
└── Week 45-46: E2E Integration

Phase 7: Hardening & Launch (Weeks 47-50)
├── Week 47-48: Performance
├── Week 49: Security Audit
└── Week 50: Release Candidate
```

**Critical Path**: Bootstrap → Adapters → CLI → Launch
**Parallel Tracks**: VMG, Execution Ledger, Cost Governance

---

## Detailed Phase Plans

### Phase 1: Bootstrap (Weeks 1-6)
**Source**: `.sisyphus/plans/opencode-cli-migration-v2.md` (excerpt)

**Deliverables**:
- Independent workspace at `opencode-cli-v2/`
- Strict-mode kernel with capability registry
- 7 port interfaces defined
- Bootstrap sequence with fail-fast checks

**Key Decisions**:
- ✅ Bun workspace (not Node.js)
- ✅ TypeScript strict mode
- ✅ Zero imports from `../packages/`
- ✅ Insulated, extractable later

**Acceptance Criteria**:
```bash
# Workspace builds
bun install && bun build

# Kernel boots
bun run bootstrap --strict
# Output: ✓ Kernel initialized (8 ports registered)

# Health check
bun run health
# Output: ✓ All systems operational
```

---

### Phase 2: Adapters (Weeks 7-16)
**Source**: `.sisyphus/plans/opencode-cli-migration-v2.md`

**Architecture**:
```
NEW KERNEL → PORT INTERFACE → ADAPTER → OLD PACKAGE
                 ↓                ↓
          OrchestrationPort    SisyphusAdapter → opencode-sisyphus-state
          RoutingPort          ModelRouterAdapter → opencode-model-router-x
          BudgetPort           ContextGovAdapter → opencode-context-governor
          SkillsPort           SkillsAdapter → opencode-skill-loader
          LearningPort         LearningAdapter → opencode-learning-engine
          PluginsPort          PluginAdapters (12)
          MCPPort              MCPBridgeAdapter
```

**Deliverables**:
- 5 core package adapters
- 12 plugin adapters
- 84 script → CLI command migrations
- Adapter test suite

**Acceptance Criteria**:
```bash
# All adapters pass
bun test adapters/
# Output: ✓ 47 adapters passing

# Sisyphus integration
bun run task --adapter=sisyphus "test"
# Output: ✓ Task completed via SisyphusAdapter

# Plugin loading
bun run agent:list
# Output: 8 agents available (via adapters)
```

---

### Phase 3: Verified Memory Graph (Weeks 17-28)
**Source**: `.sisyphus/plans/verified-memory-graph-vmg.md`

**Core Innovation**: Every memory is a **fact** with:
- **Provenance**: Who/when/why learned
- **Confidence**: 0.0-1.0 score
- **TTL**: Expiration time
- **Cryptographic signature**: Immutable
- **Causal edges**: "X caused Y"

**Architecture**:
```
┌─────────────────────────────────────────────────────────────────┐
│ HYBRID MEMORY SYSTEM                                           │
├─────────────────────────────────────────────────────────────────┤
│ TIER 1: WORKING MEMORY (SQLite)                                 │
│ • Local repo symbols                                            │
│ • Fast queries (< 10ms)                                         │
│ • Offline-first                                                  │
│                                                                  │
│ TIER 2: SEMANTIC MEMORY (Neo4j)                                 │
│ • Cross-repo knowledge                                          │
│ • Causal reasoning                                               │
│ • Graph traversals                                               │
│                                                                  │
│ TIER 3: ARCHIVAL (Object Storage)                               │
│ • Historical facts                                               │
│ • Compliance archives                                            │
│                                                                  │
│ SYNC: Async SQLite ↔ Neo4j replication                          │
└─────────────────────────────────────────────────────────────────┘
```

**Fact Schema**:
```typescript
interface Fact {
  id: string;
  content: string;
  type: 'architectural' | 'operational' | 'convention' | 'historical';
  provenance: {
    source: string;      // PR, session, manual
    sessionId: string;
    timestamp: Date;
    agentId: string;
  };
  confidence: number;     // 0.0-1.0
  ttl: Duration;
  expiresAt: Date;
  signature: string;      // ed25519
  contradictions: string[]; // IDs of conflicting facts
  causalEdges: Array<{
    cause: string;
    effect: string;
    relationship: string;
  }>;
}
```

**Key Features**:
1. **Contradiction Detection**: Auto-flag stale facts
2. **Memory Quality Scoring**: Precision/recall metrics
3. **Causal Reasoning**: "Why did this break?"
4. **Cryptographic Verification**: Tamper-proof

**Acceptance Criteria**:
```bash
# Store fact
bun run memory:store --fact="auth uses bcrypt" --confidence=0.95

# Retrieve with provenance
bun run memory:query --q="auth" --include-provenance
# Output: auth uses bcrypt (from PR #123, confidence: 0.95)

# Detect contradiction
bun run memory:store --fact="auth uses argon2" --confidence=0.90
# Output: ⚠️ Contradiction detected! auth uses bcrypt (0.95) vs argon2 (0.90)

# Causal query
bun run memory:causal --event="build-failed"
# Output: build-failed → caused by → test-timeout → caused by → slow-db-query
```

**Competitive Advantage**:
- **Claude Code**: No fact verification
- **Cursor**: No causal reasoning
- **Codex CLI**: No memory persistence
- **OpenCode v3**: ✅ Verified, causal, expiring facts

---

### Phase 4: Execution Ledger (Weeks 29-36)
**Source**: `.sisyphus/plans/execution-ledger-replay.md`

**Core Innovation**: Every action is **cryptographically signed** and **deterministically replayable**

**Architecture**:
```typescript
interface ExecutionTrace {
  traceId: string;
  timestamp: Date;
  agentId: string;
  
  // Every action signed
  actions: Array<{
    actionId: string;
    tool: string;
    input: unknown;
    output: unknown;
    durationMs: number;
    result: 'success' | 'failure';
    signature: string;  // ed25519
    fileDiffs?: FileDiff[];
  }>;
  
  // Merkle tree of all actions
  merkleRoot: string;
  
  // Overall trace signature
  traceSignature: string;
}
```

**Capabilities**:
1. **Capture**: Record every tool call
2. **Sign**: ed25519 signatures per action
3. **Verify**: Cryptographic integrity check
4. **Replay**: Deterministic re-execution
5. **Diff**: Compare traces across runs

**Replay Modes**:
- **Dry-run**: Validate without executing
- **Replay**: Re-execute exactly
- **Branch**: Replay + add new actions

**Acceptance Criteria**:
```bash
# Capture trace
bun run task --ledger "refactor auth"
# Output: ✓ Trace saved: trace-abc123.json

# Verify signature
bun run ledger:verify abc123
# Output: ✓ Signature valid (ed25519)

# Replay
bun run ledger:replay abc123 --dry-run
# Output: ✓ 15/15 actions would execute identically

# Tamper detection
# (modify trace file)
bun run ledger:verify abc123
# Output: ✗ Signature invalid (tampered)
```

**Competitive Advantage**:
- **Claude Code**: No replay
- **Cursor**: No signing
- **Codex CLI**: Basic logs
- **OpenCode v3**: ✅ Provable, replayable actions

---

### Phase 5: Cost/SLO Governor (Weeks 37-40)
**Source**: `.sisyphus/plans/cost-slo-governor.md`

**Core Innovation**: **Predictable costs** with budget caps and automatic model fallback

**Budget Model**:
```typescript
interface BudgetEnvelope {
  sessionId: string;
  totalBudget: number;      // USD
  usedUSD: number;
  remaining: number;
  status: 'healthy' | 'warning' | 'critical' | 'exhausted';
  
  policy: {
    preferredModel: string;
    fallbackChain: string[];  // cheap → mid → expensive
    hardStop: boolean;        // Block or warn?
    maxLatency: number;       // seconds
    minQuality: number;       // 0-1
  };
}
```

**Policies**:
- **minimal**: $5 budget, free models only
- **standard**: $50 budget, balanced models
- **generous**: $200 budget, best quality

**Fallback Chain**:
```
User requests: claude-opus-4-6
If budget insufficient:
  → Try: antigravity-gemini-3-flash
  → Try: claude-sonnet-4-5
  → Try: kimi-k2.5-free
  → Block: Budget exceeded
```

**SLO Enforcement**:
- Time: "Complete within 30s"
- Quality: "Minimum 0.8 confidence"
- Cost: "Under $10 per task"

**Acceptance Criteria**:
```bash
# Check budget
bun run cost:status
# Output: Session abc123: $12.40 / $50.00 (24.8%)

# Policy selection
bun run task --dry-run --budget=5
# Output: Would use: kimi-k2.5-free (est. $0.50)

# SLO enforcement
bun run slo:status
# Output: Latency SLO: 94% < 30s (target: 95%)

# Emergency stop
bun run cost:pause --all
# Output: Paused 3 sessions, total at-risk: $47.20
```

**Competitive Advantage**:
- **Claude Code**: No budget caps
- **Cursor**: Surprise billing
- **Codex CLI**: No SLOs
- **OpenCode v3**: ✅ Predictable costs + guarantees

---

### Phase 6: CLI & Integration (Weeks 41-46)
**Source**: `.sisyphus/plans/opencode-cli-migration-v2.md`

**SWE-Agent Inspired UI**:

```bash
# Inspector (step-by-step view)
opencode inspect --trajectory task-abc123.json
┌────────────────────────────────────────────────────┐
│ Step 1: Initial thought                             │
│ > Let me analyze the codebase...                   │
├────────────────────────────────────────────────────┤
│ Step 2: Tool call                                   │
│ > read_file({ path: "src/auth.ts" })               │
├────────────────────────────────────────────────────┤
│ Step 3: Observation                                 │
│ < File exports class AuthManager...                │
└────────────────────────────────────────────────────┘

# Live status
opencode run --live "refactor auth"
┌──────────────────────────────────────────────┐
│ Running: Create auth system                  │
│                                              │
│ Agent: prom (phase: executing)               │
│ Step: 8 / ~15                                │
│ Context: 45% (3,456 / 8,192 tokens)          │
│ Cost: $2.30 / $10.00 (23%)                   │
│ Time: 00:03:45                               │
│                                              │
│ [===============================>     ] 53%  │
└──────────────────────────────────────────────┘

# Trajectory replay
opencode replay task-abc123.json --step 5
opencode replay task-abc123.json --diff
```

**Command Structure**:
```bash
# Core commands
opencode run [task]              # Execute with agent
opencode run --agent [name]      # Specific agent
opencode run --budget [amount]   # With budget cap
opencode run --save-traj [file]  # Save trajectory

# Inspection
opencode inspect [trace]         # View trajectory
opencode replay [trace]          # Replay execution
opencode diff [trace1] [trace2]  # Compare traces

# Management
opencode agent:list              # List agents
opencode skill:list              # List skills
opencode config:get [key]        # Get config

# Memory
opencode memory:query [q]         # Query VMG
opencode memory:store [fact]      # Store fact
opencode memory:causal [event]    # Causal analysis

# Cost
opencode cost:status             # Check budget
opencode cost:pause              # Emergency stop
```

**Acceptance Criteria**:
```bash
# Basic execution
opencode run "fix login bug"
# Output: ✓ Task completed (15 steps, $2.30)

# With trajectory
opencode run --save-traj bugfix.json "fix login"
opencode replay bugfix.json
# Output: ✓ Replay successful, outcomes match

# Budget enforcement
opencode run --budget=1 "refactor entire app"
# Output: ⚠️ Budget insufficient, using: kimi-k2.5-free
```

---

### Phase 7: Hardening & Launch (Weeks 47-50)

**Performance Targets**:
- Cold start: < 500ms
- Task latency: P95 < 30s
- Memory usage: < 2GB
- Cost overhead: < 5% of token costs

**Security**:
- Cryptographic verification (all traces)
- Signed memory facts
- Budget hard stops
- Audit trails

**Launch Checklist**:
- [ ] All 47 adapters passing
- [ ] 264 tests green
- [ ] Performance benchmarks met
- [ ] Security audit passed
- [ ] Documentation complete
- [ ] Migration guide published

**Acceptance Criteria**:
```bash
# Final verification
bun test
# Output: 264 tests passing

# Performance
bun run bench:startup
# Output: Cold start: 420ms ✓

# Security audit
bun run security:audit
# Output: ✓ No critical vulnerabilities

# Integration test
bun run test:e2e
# Output: ✓ End-to-end workflow passing
```

---

## Evidence & Acceptance Criteria Matrix

| Component | Evidence Type | Verification Command | Success Criteria |
|-----------|--------------|---------------------|------------------|
| **Kernel** | Unit tests | `bun test kernel/` | 100% tests pass |
| **Adapters** | Integration tests | `bun test adapters/` | 47/47 adapters pass |
| **VMG** | End-to-end | `bun test vmg/` | Sync < 5s, query < 100ms |
| **Ledger** | Crypto tests | `bun test ledger/` | Sign < 10ms, tamper detection 100% |
| **Cost** | Policy tests | `bun test cost/` | Budget enforcement 100% |
| **CLI** | E2E tests | `bun test e2e/` | Full workflow < 60s |

---

## Competitive Position Summary

| Feature | Claude | Cursor | Codex | Devin | **OpenCode v3** |
|---------|--------|--------|-------|-------|-----------------|
| **VMG** | ❌ | ❌ | ❌ | ❌ | ✅ Verified facts |
| **Execution Ledger** | ❌ | ❌ | ⚠️ | ❌ | ✅ Provable actions |
| **Cost Governor** | ❌ | ❌ | ❌ | ❌ | ✅ Predictable |
| **Replay** | ❌ | ❌ | ❌ | ❌ | ✅ Deterministic |
| **Causal Reasoning** | ❌ | ❌ | ❌ | ❌ | ✅ Root cause |
| **Strict Mode** | ❌ | ❌ | ✅ | ❌ | ✅ Fail fast |

**Position**: "The only AI coding system with verifiable memory, provable actions, and predictable costs"

---

## Resource Requirements

### Development
- **Team**: 2-3 senior engineers
- **Time**: 50 weeks
- **Complexity**: High (but tractable with phases)

### Infrastructure
- **SQLite**: Bundled (zero cost)
- **Neo4j**: Docker container (Community Edition)
- **Object Storage**: Optional (S3/MinIO)
- **CI/CD**: GitHub Actions

### Costs
- **Development**: ~$50K (personnel)
- **Infrastructure**: ~$100/month (Neo4j + storage)
- **LLM**: User-paid (via their keys)

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Neo4j integration complexity | Medium | Medium | Start with Community, add Enterprise later |
| Performance degradation | Low | High | Benchmarks, optimization phase |
| Cryptographic overhead | Low | Medium | ed25519 is fast, measure before shipping |
| Migration delays | Medium | High | Phased approach, parallel tracks |
| User adoption | Medium | High | 95% compat, migration guide |

---

## Next Actions

1. **Review**: Approve master plan
2. **Prioritize**: Which phase to start first?
3. **Resource**: Assign team members
4. **Execute**: Begin Phase 1 (Bootstrap)

**To begin**:
```bash
/start-work .sisyphus/plans/opencode-cli-migration-v2.md
/start-work .sisyphus/plans/verified-memory-graph-vmg.md
/start-work .sisyphus/plans/execution-ledger-replay.md
/start-work .sisyphus/plans/cost-slo-governor.md
```

---

## Files Referenced

| File | Purpose |
|------|---------|
| `.sisyphus/plans/opencode-cli-migration-v2.md` | Master migration plan |
| `.sisyphus/plans/codebase-memory-evaluation-and-graph-db-decision.md` | VMG evaluation |
| `.sisyphus/plans/verified-memory-graph-vmg.md` | Memory system |
| `.sisyphus/plans/execution-ledger-replay.md` | Provable actions |
| `.sisyphus/plans/cost-slo-governor.md` | Budget control |

---

**Plan Version**: 1.0
**Last Updated**: 2026-04-16
**Status**: Ready for review
**Confidence**: High (architecture validated, research complete)
