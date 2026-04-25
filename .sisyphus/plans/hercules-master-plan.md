# Hercules: The Standalone AI Coding System

## Executive Manifesto

**We are building Hercules** - a fully autonomous, self-improving AI coding system that combines the best of swe-agent's research-backed design and hermes-agent's practical architecture, while remaining completely independent.

**Core Philosophy**:
- **Zero external dependencies** (own the entire stack)
- **Research-backed design** (swe-agent's ACI-first approach)
- **Production pragmatism** (hermes-agent's operational features)
- **Provable correctness** (VMG + Execution Ledger)
- **Predictable costs** (SLO Governor)

**Why "Hercules"**:
- **H**ybrid memory (SQLite + Neo4j)
- **E**xecution ledger (provable actions)
- **R**easoning-first architecture
- **C**ost governance (SLO + budgets)
- **U**nified agent system
- **L**earning loop (self-improving)
- **E**xtensible plugins
- **S**tandalone (zero dependencies)

---

## Synthesis: What We Learned

### From SWE-Agent (Princeton/NYU Research)

**Key Patterns**:
1. **Trajectory-Centric Design**: Everything is a trajectory
2. **ACI-First**: Interface design > prompt engineering
3. **Config Composability**: Hierarchical YAML + CLI overrides
4. **Dual Inspectors**: Terminal TUI + Web UI
5. **Deterministic Replay**: Debug via re-execution
6. **Benchmark-Native**: Built for SWE-bench evaluation
7. **Tool Bundles**: Modular tool distribution

**Command Structure**:
```bash
sweagent run                    # Single task
sweagent run-batch              # Batch evaluation
sweagent run-replay             # Replay trajectory
sweagent inspect                # Terminal TUI
sweagent inspector              # Web inspector
```

**Config Model**:
```yaml
# default.yaml
agent:
  model:
    name: claude-3-5-sonnet
  templates:
    system: "..."
    instance: "..."
  tools:
    bundles: [bash, git, edit]
  history_processors:
    - cache_control

env:
  repo:
    github_url: "..."
  deployment:
    type: docker
```

### From Hermes-Agent (NousResearch)

**Key Patterns**:
1. **Dual MCP Mode**: Client + Server
2. **Subagent Delegation**: First-class child agents
3. **Multi-Surface**: CLI + Gateway (Telegram/Discord/etc.)
4. **Session Continuity**: SQLite + JSON persistence
5. **Profile-Aware**: Multi-tenant configuration
6. **Toolset Governance**: Per-platform filtering
7. **Self-Improving**: Agent-created skills

**Command Structure**:
```bash
hermes                          # Default to chat
hermes chat                     # Interactive session
hermes -q "task"                # One-shot
hermes model                    # Model management
hermes gateway                  # Multi-platform
hermes mcp serve                # Act as MCP server
hermes skills                   # Skill management
hermes sessions                 # Session management
```

**Agent Architecture**:
```python
class AIAgent:
    def __init__(
        model: str,
        max_iterations: int = 90,
        enabled_toolsets: List[str],
        session_db,  # SQLite persistence
        ...
    )
```

**Subagent Delegation**:
```python
# delegate_task tool spawns isolated children
with ThreadPoolExecutor(max_workers=N) as executor:
    futures = [
        executor.submit(run_child_agent, task)
        for task in subtasks
    ]
```

---

## Hercules Architecture

### Command Structure (Synthesized)

```bash
# Core execution (inspired by both)
hercules run [task]                    # swe: run
hercules run-batch [config]            # swe: run-batch
hercules chat                          # hermes: chat mode
hercules -q [query]                    # hermes: one-shot

# Inspection & replay (swe-agent style)
hercules inspect [trace]               # swe: inspect
hercules replay [trace]                # swe: run-replay
hercules diff [trace1] [trace2]        # NEW: compare runs

# Memory (VMG - unique to Hercules)
hercules memory query [q]              # Query verified facts
hercules memory store [fact]           # Store with provenance
hercules memory causal [event]         # Root cause analysis

# Cost governance (unique to Hercules)
hercules cost status                   # Check budget
hercules cost pause                    # Emergency stop
hercules policy set [name]             # Budget policy

# Agent management (hermes style)
hercules agent list                    # List agents
hercules agent create [name]           # Create agent
hercules agent skills [name]           # View skills

# MCP (hermes dual-mode)
hercules mcp serve                     # Act as MCP server
hercules mcp add [server]              # Add MCP client
hercules mcp tools                     # List MCP tools

# Sessions (hermes style)
hercules sessions list                 # List sessions
hercules sessions resume [id]          # Resume session
hercules sessions export [id]          # Export trajectory

# Skills (hermes style)
hercules skills list                   # List skills
hercules skills create [name]          # Create skill
hercules skills audit [name]           # Verify skill

# Gateway (hermes style)
hercules gateway start                 # Start Telegram/Discord
hercules gateway status                # Gateway health
```

### Config Model (Synthesized)

```yaml
# hercules.yaml
# Inspired by swe-agent's hierarchy + hermes's pragmatism

version: "1.0"

# Identity (hermes: profiles)
profile:
  name: default
  hercules_home: ~/.hercules

# Agent (swe: agent + hermes: ai_agent)
agent:
  model:
    name: claude-3-5-sonnet
    provider: anthropic
    api_key: ${ANTHROPIC_API_KEY}
  
  # Limits (hercules: unique)
  limits:
    max_iterations: 100
    max_cost_usd: 50
    max_latency_sec: 300
  
  # Delegation (hermes: subagents)
  delegation:
    enabled: true
    max_parallel: 4
    isolation: strict
  
  # Memory (hercules: VMG)
  memory:
    enabled: true
    provenance: strict
    confidence_threshold: 0.8
    ttl_days: 30
  
  # Ledger (hercules: unique)
  ledger:
    enabled: true
    signing: ed25519
    compression: gzip

# Tools (swe: tool bundles)
tools:
  bundles:
    - core        # bash, git, file ops
    - code        # edit, search, lint
    - git         # PR, commit, branch
    - mcp         # MCP client tools
  
  # MCP client config (hermes: mcp_config)
  mcp:
    servers:
      supermemory:
        command: npx
        args: [-y, @supermemory/mcp-server]
        env:
          API_KEY: ${SUPERMEMORY_KEY}
  
  # Per-tool settings
  filters:
    destructive:
      require_confirmation: true
    expensive:
      cost_threshold_usd: 1.0

# Environment (swe: env + hermes: deployment)
env:
  type: local          # local, docker, modal, k8s
  working_dir: .
  repo:
    type: git
    url: https://github.com/...
  
  # State command (swe: returns JSON state)
  state_command: hercules state

# UI (swe: inspectors)
ui:
  terminal:
    theme: dark
    multiline: true
    streaming: true
  
  web:
    enabled: true
    port: 8000
  
  # Hercules: unique live display
  status_bar:
    show_cost: true
    show_context: true
    show_time: true

# Persistence (hermes: state)
persistence:
  sessions:
    backend: sqlite
    path: ~/.hercules/sessions.db
  
  trajectories:
    path: ~/.hercules/trajectories/
    compression: gzip
  
  # VMG (hercules: unique)
  memory_graph:
    tier1:
      type: sqlite
      path: ~/.hercules/memory-tier1.db
    tier2:
      type: neo4j
      url: bolt://localhost:7687
      # Optional - falls back to sqlite
    tier3:
      type: s3
      bucket: hercules-archives

# Ledger (hercules: unique)
ledger:
  append_only: true
  signing_key: ~/.hercules/ledger.key
  verification: strict

# Policies (hercules: unique)
policies:
  minimal:
    budget_usd: 5
    models: [kimi-k2.5-free, gemini-flash]
    hard_stop: true
  
  standard:
    budget_usd: 50
    models: [claude-sonnet, gemini-pro]
    slo_latency_sec: 60
  
  generous:
    budget_usd: 200
    models: [claude-opus, gpt-4-turbo]
    slo_quality: 0.95
```

---

## Core Components

### 1. Kernel (Hercules Core)

**Inspired by**: swe-agent's clean architecture + hermes's pragmatism

```typescript
// HerculesKernel.ts
interface HerculesKernel {
  // Bootstrap
  bootstrap(config: Config): Promise<Runtime>;
  
  // Agent lifecycle
  createAgent(config: AgentConfig): Promise<Agent>;
  destroyAgent(id: string): Promise<void>;
  
  // Task execution
  execute(task: Task): Promise<Execution>;
  
  // Memory
  memory: VMG;           // Tiered memory system
  ledger: Ledger;        // Execution ledger
  
  // Governance
  cost: CostGovernor;    // Budget + SLO
  policy: PolicyEngine; // Rules
}
```

### 2. Agent (HerculesAgent)

**Inspired by**: swe-agent's loop + hermes's delegation

```typescript
class HerculesAgent {
  // Core loop (swe-agent style)
  async run(task: Task): Promise<Execution> {
    while (!this.isComplete()) {
      // 1. Build context (swe: history processors)
      const context = await this.buildContext();
      
      // 2. Query model
      const response = await this.model.query(context);
      
      // 3. Parse action (swe: parse_function)
      const action = this.parseAction(response);
      
      // 4. Execute (hermes: tool registry)
      const observation = await this.executeAction(action);
      
      // 5. Record to ledger (hercules: unique)
      await this.ledger.record(action, observation);
      
      // 6. Update VMG (hercules: unique)
      await this.memory.learn(action, observation);
      
      // 7. Check SLO (hercules: unique)
      if (this.sloBreached()) {
        await this.handleSLOBreach();
      }
    }
  }
  
  // Subagent delegation (hermes: delegate_task)
  async delegate(subtasks: Task[]): Promise<Execution[]> {
    return Promise.all(
      subtasks.map(t => this.spawnChild(t))
    );
  }
}
```

### 3. VMG (Verified Memory Graph)

**Unique to Hercules**

```typescript
interface VMG {
  // Tier 1: Working memory (SQLite)
  working: SQLiteStore;
  
  // Tier 2: Semantic memory (Neo4j)
  semantic: Neo4jStore;
  
  // Tier 3: Archival (Object Storage)
  archival: ArchiveStore;
  
  // Core operations
  async store(fact: Fact): Promise<void>;
  async query(pattern: string): Promise<Fact[]>;
  async detectContradictions(fact: Fact): Promise<Fact[]>;
  async causalAnalysis(event: string): Promise<CausalChain>;
  
  // Sync
  async sync(): Promise<void>;
}

interface Fact {
  id: string;
  content: string;
  type: FactType;
  provenance: Provenance;
  confidence: number;      // 0-1
  ttl: Duration;
  signature: string;       // ed25519
  contradictions: string[];
  causalEdges: CausalEdge[];
}
```

### 4. Execution Ledger

**Unique to Hercules**

```typescript
interface Ledger {
  // Capture
  async capture(action: Action): Promise<TraceEntry>;
  
  // Cryptography
  async sign(entry: TraceEntry): Promise<SignedEntry>;
  async verify(entry: SignedEntry): Promise<boolean>;
  
  // Replay
  async replay(traceId: string): Promise<ReplayResult>;
  
  // Storage (append-only)
  storage: AppendOnlyLog;
}

interface ExecutionTrace {
  traceId: string;
  merkleRoot: string;
  entries: SignedEntry[];
  signature: string;  // Of entire trace
}
```

### 5. Cost Governor

**Unique to Hercules**

```typescript
interface CostGovernor {
  // Budget tracking
  async checkBudget(task: Task): Promise<BudgetStatus>;
  async consume(cost: Cost): Promise<void>;
  
  // Model routing
  selectModel(task: Task, budget: Budget): Model;
  
  // SLO monitoring
  async checkSLO(task: Task): Promise<SLOStatus>;
  async enforceSLO(slo: SLO): Promise<void>;
  
  // Fallback
  async fallback(current: Model): Promise<Model>;
}
```

---

## Workflow Examples

### Example 1: Single Task Execution

```bash
$ hercules run "fix the auth bug"

[hercules] Task: fix the auth bug
[hercules] Estimated cost: $3.50 (claude-sonnet)
[hercules] Budget: $10.00 remaining ✓
[hercules] 
[hercules] Executing...
[hercules] Step 1/15: Read auth.ts ✓
[hercules] Step 2/15: Identify bcrypt issue ✓
[hercules] Step 3/15: Search for password usage ✓
[hercules] ...
[hercules] 
[hercules] ✓ Task completed (15 steps, $3.20, 45s)
[hercules] Trace saved: ~/.hercules/trajectories/fix-auth-bug-2026-04-17.json
```

### Example 2: Memory Query

```bash
$ hercules memory query "auth implementation"

[hercules] Query: auth implementation
[hercules] 
[hercules] Facts found (3):
[hercules] 
[hercules] 1. "auth uses bcrypt" 
[hercules]    Confidence: 0.95
[hercules]    Source: PR #123 (2026-04-10)
[hercules]    Status: Current
[hercules] 
[hercules] 2. "auth previously used argon2"
[hercules]    Confidence: 0.90
[hercules]    Source: PR #89 (2026-03-15)
[hercules]    Status: Superseded by #123
[hercules]    Contradiction detected ✓
[hercules] 
[hercules] 3. "JWT tokens expire in 24h"
[hercules]    Confidence: 1.00
[hercules]    Source: Manual (2026-04-01)
[hercules]    Status: Current
```

### Example 3: Budget Enforcement

```bash
$ hercules run --budget=1 "refactor entire codebase"

[hercules] Task: refactor entire codebase
[hercules] Estimated cost: $25.00 (claude-opus)
[hercules] Budget: $1.00
[hercules] 
[hercules] ⚠️ Budget insufficient
[hercules] Falling back to: kimi-k2.5-free (est. $0.80)
[hercules] 
[hercules] Continue? [Y/n]: y
[hercules] 
[hercules] Executing with kimi-k2.5-free...
```

### Example 4: Replay with Verification

```bash
$ hercules replay fix-auth-bug-2026-04-17.json --verify

[hercules] Loading trace...
[hercules] ✓ Signature valid (ed25519)
[hercules] ✓ Merkle root verified
[hercules] ✓ 15 actions verified
[hercules] 
[hercules] Replaying...
[hercules] Step 1/15: Read auth.ts ✓ (matches)
[hercules] Step 2/15: Identify bcrypt issue ✓ (matches)
[hercules] Step 3/15: Search for password usage ⚠️ (diverged)
[hercules] 
[hercules] Divergence detected at step 3:
[hercules]   Expected: 5 usages
[hercules]   Actual: 7 usages
[hercules]   Cause: Codebase changed since original run
```

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-6)
- Bootstrap kernel
- CLI framework
- Config system
- Basic agent loop

### Phase 2: Core + OpenCode Migration (Weeks 7-18)
- Tool system
- MCP integration
- Session persistence
- Basic memory
- **OpenCode Feature Migration (Weeks 7-18)**
  - Port codebase-memory → Tier 1 VMG
  - Port context-governor → Cost Governor
  - Port learning-engine → Learning system
  - Port model-router-x → Model routing

### Phase 3: VMG + Additional Migrations (Weeks 15-26)
- SQLite tier
- Neo4j tier
- Fact schema
- Contradiction detection
- **Additional OpenCode Migrations (Weeks 19-26)**
  - Port skill-rl-manager → Skill learning
  - Port tool-usage-tracker → Ledger integration
  - Port runbooks → Error remediation
  - Port memory-graph → VMG integration

### Phase 4: Ledger (Weeks 27-34)
- Trace capture
- Cryptographic signing
- Replay engine
- Verification

### Phase 5: Governance (Weeks 35-42)
- Budget tracking
- SLO monitoring
- Model routing
- Fallback chains

### Phase 6: Polish (Weeks 43-50)
- SWE-agent style inspector
- Replay TUI
- Web UI
- Documentation

---

## File Structure

```
hercules/
├── hercules/                      # Main package
│   ├── __init__.py
│   ├── __main__.py                # Entry point
│   ├── cli/                       # CLI commands
│   │   ├── main.py                # Entry + subcommands
│   │   ├── run.py                 # Task execution
│   │   ├── inspect.py             # TUI inspector
│   │   ├── replay.py              # Replay command
│   │   ├── memory.py              # Memory commands
│   │   ├── cost.py                # Cost commands
│   │   └── ...
│   ├── core/                      # Core components
│   │   ├── kernel.py              # HerculesKernel
│   │   ├── agent.py               # HerculesAgent
│   │   ├── config.py              # Config loading
│   │   └── runtime.py             # Runtime state
│   ├── memory/                    # VMG
│   │   ├── vmg.py                 # Main VMG class
│   │   ├── tier1.py               # SQLite
│   │   ├── tier2.py               # Neo4j
│   │   ├── tier3.py               # Archival
│   │   ├── fact.py                # Fact schema
│   │   └── sync.py                # Tier sync
│   ├── ledger/                    # Execution ledger
│   │   ├── ledger.py              # Main ledger
│   │   ├── crypto.py              # Signing
│   │   ├── replay.py              # Replay engine
│   │   └── storage.py             # Append-only log
│   ├── cost/                      # Cost governor
│   │   ├── governor.py            # Main governor
│   │   ├── budget.py              # Budget tracking
│   │   ├── slo.py                 # SLO monitoring
│   │   └── router.py              # Model routing
│   ├── tools/                     # Tool system
│   │   ├── registry.py            # Tool registry
│   │   ├── bundles/               # Tool bundles
│   │   └── mcp.py                 # MCP integration
│   └── utils/                     # Utilities
├── tests/                         # Test suite
├── docs/                          # Documentation
├── examples/                      # Example configs
└── pyproject.toml                 # Package config
```

---

## Differentiation Summary

| Feature | SWE-Agent | Hermes | **Hercules** |
|---------|-----------|--------|--------------|
| Trajectory-centric | ✅ | ⚠️ | ✅ |
| Dual Inspectors | ✅ | ❌ | ✅ |
| Replay | ✅ | ❌ | ✅ ✨ Crypto-signed |
| VMG | ❌ | ⚠️ | ✅ ✨ Verified facts |
| Cost Governor | ❌ | ❌ | ✅ ✨ Budgets + SLO |
| Subagent Delegation | ⚠️ | ✅ | ✅ |
| Dual MCP | ❌ | ✅ | ✅ |
| Multi-surface | ❌ | ✅ | ✅ |
| Standalone | ⚠️ | ⚠️ | ✅ ✨ Zero deps |
| Self-improving | ❌ | ✅ | ✅ |

**Key**: ✅ Inherited, ✅ ✨ Unique to Hercules

---

## Success Criteria

```bash
# End-to-end test
hercules run -q "create hello world in python" \
  --budget=1 \
  --save-trace \
  --policy=minimal

# Expected output:
# ✓ Task completed (3 steps, $0.15, 8s)
# ✓ Trace saved + signed
# ✓ Budget under cap
# ✓ Output: hello.py created

# Replay verification
hercules replay last --verify --dry-run
# ✓ Signature valid
# ✓ 3 actions would execute identically

# Memory query
hercules memory query "python file created"
# ✓ Found fact with provenance
```

---

## Migration from OpenCode

**Critical**: Hercules is **greenfield** - no migration of old code.

**What we extract**:
- ✅ Patterns from old codebase
- ✅ Best practices
- ✅ Understanding of failures

**What we DON'T take**:
- ❌ Old code
- ❌ Old dependencies
- ❌ Old architecture
- ❌ Old bugs

**Extraction strategy**:
1. Build Hercules in parallel
2. Test against same benchmarks
3. Achieve feature parity
4. Switch over

---

## Plan Files

| Plan | File | Status | Purpose |
|------|------|--------|---------|
| **Master Plan** | `.sisyphus/plans/hercules-master-plan.md` | ✅ Ready | Complete architecture + roadmap |
| **Migration Audit** | `.sisyphus/plans/hercules-opencode-migration-audit.md` | ✅ Ready | What to port from OpenCode |
| **VMG** | `.sisyphus/plans/verified-memory-graph-vmg.md` | ✅ Ready | Hybrid memory system |
| **Ledger** | `.sisyphus/plans/execution-ledger-replay.md` | ✅ Ready | Provable actions |
| **Cost Governor** | `.sisyphus/plans/cost-slo-governor.md` | ✅ Ready | Budget control |
| **Architecture Decision** | `.sisyphus/plans/codebase-memory-evaluation-and-graph-db-decision.md` | ✅ Ready | Neo4j + SQLite decision |

---

## Migration Summary

### What's Ported from OpenCode (Cherry-Picked)

| OpenCode Package | Hercules Destination | Effort | Priority |
|------------------|---------------------|--------|----------|
| **codebase-memory** | `memory/tier1/` | Medium | P0 |
| **context-governor** | `cost/context.py` | Low | P0 |
| **learning-engine** | `learning/` | High | P0 |
| **model-router-x** | `cost/router.py` | Medium | P0 |
| **skill-rl-manager** | `learning/skills.py` | Medium | P1 |
| **tool-usage-tracker** | `ledger/tools.py` | Low | P1 |
| **runbooks** | `learning/runbooks.py` | Medium | P1 |
| **memory-graph** | Merge into VMG | Low | P2 |

### What's NOT Ported (Left Behind)

| OpenCode Package | Reason |
|------------------|--------|
| **integration-layer** | "God package" - tight coupling, tech debt |
| **sisyphus-state** | Monolithic - replaced with clean agent loop |
| **dashboard** | Defer to Phase 6 |
| **plugin-lifecycle** | Security concerns - redesign needed |
| **circuit-breaker** | Use standard library |
| **Most utilities** | Use standard libraries |

### Porting Timeline

- **Phase 2 (Weeks 7-18)**: Core migrations (codebase-memory, context-governor, learning-engine, model-router-x)
- **Phase 3 (Weeks 19-26)**: Additional migrations (skill-rl-manager, tool-usage-tracker, runbooks, memory-graph)
- **Total Porting Effort**: 14-22 weeks across 8 packages

---

**Version**: 1.0
**Date**: 2026-04-17
**Status**: Ready for execution
**Dependencies**: None (100% standalone)
