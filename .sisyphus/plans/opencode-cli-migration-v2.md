# OpenCode CLI Migration Plan v2 - Kernel-First Strangler

## TL;DR

**Objective:** Create new CLI-first architecture using kernel-first strangler pattern, achieving 95% backward compatibility, strict mode by default, with SWE-agent-inspired UI.

**Approach:** 
- **Kernel-First:** Build new composition root before any packages
- **Strangler Pattern:** New kernel + adapters → old packages → gradual replacement
- **In-Repo:** Build insulated within existing monorepo, extract later
- **Strict Mode:** Fail fast on missing integrations (not fail-open)
- **95% Compatibility:** Document 5% breaking changes

**Timeline:** 40-50 weeks (realistic estimate)
**Critical Path:** Kernel → Adapters → CLI → Packages → Plugins
**Dashboard:** De-prioritized (can integrate later)

---

## Decisions Confirmed

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Compatibility** | 95% | Acceptable losses, realistic timeline |
| **Pattern** | Strangler | Incremental delivery, testable |
| **Mode** | Strict | Fail fast, testable, no silent failures |
| **Location** | In-repo first | Reuse build/test infra, extract later |
| **Dashboard** | Low priority | CLI-first, web UI later |
| **Plugins** | All 12 | Required for feature parity |
| **UI Target** | SWE-agent | Gold standard for agent CLI |

---

## Core Architecture: The Kernel

### The Problem
The existing system has a hidden kernel (`opencode-integration-layer`) that couples 15+ packages. We can't migrate packages without first extracting the kernel.

### The Solution
Build a NEW kernel with clean ports/adapters, then gradually migrate old packages behind adapters.

```
NEW ARCHITECTURE (Strangler)
============================

┌────────────────────────────────────────────────────────────┐
│                      NEW KERNEL                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │   CLI    │ │  Config  │ │  State   │ │  Plugin  │       │
│  │  Layer   │ │  Mgr     │ │  Mgr     │ │  Mgr     │       │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘       │
│       │            │            │            │             │
│       └────────────┴────────────┴────────────┘           │
│                        │                                    │
│  ┌─────────────────────▼──────────────────────┐             │
│  │              ADAPTER LAYER                │             │
│  │  ┌──────────┬──────────┬──────────┐      │             │
│  │  │ OldPkg1  │ OldPkg2  │ OldPkg3  │      │             │
│  │  │ Adapter  │ Adapter  │ Adapter  │      │             │
│  │  └──────────┴──────────┴──────────┘      │             │
│  └────────────────────────────────────────────┘             │
│                        │                                    │
│       ┌────────────────┼────────────────┐                  │
│       │                │                │                   │
│  ┌────▼────┐    ┌─────▼─────┐    ┌──────▼──────┐          │
│  │ Old Pkg │    │ Old Pkg   │    │ Old Pkg     │          │
│  │ (still  │    │ (still    │    │ (still      │          │
│  │ works)  │    │ works)    │    │ works)      │          │
│  └─────────┘    └───────────┘    └─────────────┘          │
└────────────────────────────────────────────────────────────┘
```

### Key Principle
**Adapters make old packages look like new interfaces.** We don't rewrite packages immediately. We write adapters that let the new kernel use old packages.

---

## New Directory Structure (Within Existing Repo)

```
opencode-setup/
├── packages/                          # EXISTING (36 packages)
│   ├── opencode-integration-layer/    # OLD kernel (keep)
│   ├── opencode-sisyphus-state/     # OLD (migrate via adapter)
│   └── ... (34 more packages)
│
├── opencode-cli-v2/                 # NEW CLI workspace
│   ├── README.md
│   ├── package.json
│   ├── bunfig.toml
│   ├── tsconfig.json
│   │
│   ├── src/
│   │   ├── kernel/                  # NEW KERNEL
│   │   │   ├── index.ts             # Composition root
│   │   │   ├── bootstrap.ts         # Strict-mode bootstrap
│   │   │   ├── registry.ts          # Capability registry
│   │   │   ├── state.ts             # Runtime state
│   │   │   └── strict-mode.ts       # Fail-fast checks
│   │   │
│   │   ├── cli/                     # CLI INTERFACE
│   │   │   ├── index.ts             # Entry point
│   │   │   ├── commands/            # Command definitions
│   │   │   │   ├── run.ts           # Main execution
│   │   │   │   ├── agent.ts         # Agent management
│   │   │   │   ├── task.ts          # Task operations
│   │   │   │   ├── skill.ts         # Skill operations
│   │   │   │   ├── config.ts        # Config management
│   │   │   │   ├── inspect.ts       # SWE-agent style inspector
│   │   │   │   └── trajectory.ts    # Trajectory replay
│   │   │   │
│   │   │   ├── ui/                  # SWE-agent INSPIRED UI
│   │   │   │   ├── inspector.ts     # Terminal-based inspector
│   │   │   │   ├── status.ts        # Live status display
│   │   │   │   ├── progress.ts      # Progress bars
│   │   │   │   ├── trajectory.ts    # Trajectory viewer
│   │   │   │   └── replay.ts        # Replay controls
│   │   │   │
│   │   │   └── prompts/             # Interactive prompts
│   │   │       ├── agent-select.ts
│   │   │       ├── task-input.ts
│   │   │       └── confirm.ts
│   │   │
│   │   ├── adapters/                # ADAPTER LAYER
│   │   │   ├── base.ts              # Adapter interface
│   │   │   ├── index.ts             # Adapter registry
│   │   │   ├── packages/            # Per-package adapters
│   │   │   │   ├── sisyphus.ts      # opencode-sisyphus-state
│   │   │   │   ├── model-router.ts  # opencode-model-router-x
│   │   │   │   ├── context-gov.ts   # opencode-context-governor
│   │   │   │   ├── learning.ts      # opencode-learning-engine
│   │   │   │   ├── skills.ts        # opencode-skill-loader
│   │   │   │   └── ... (30 more)
│   │   │   │
│   │   │   └── plugins/             # Per-plugin adapters
│   │   │       ├── oh-my-opencode.ts
│   │   │       ├── antigravity.ts
│   │   │       └── ... (10 more)
│   │   │
│   │   ├── ports/                   # PORT INTERFACES
│   │   │   ├── orchestration.ts     # Agent execution port
│   │   │   ├── routing.ts           # Model routing port
│   │   │   ├── budget.ts            # Context budget port
│   │   │   ├── skills.ts            # Skill system port
│   │   │   ├── learning.ts          # Learning engine port
│   │   │   ├── plugins.ts           # Plugin lifecycle port
│   │   │   └── mcp.ts               # MCP integration port
│   │   │
│   │   ├── plugins/                 # NEW PLUGIN SYSTEM
│   │   │   ├── sdk/                 # Plugin SDK
│   │   │   │   ├── index.ts
│   │   │   │   ├── base.ts
│   │   │   │   ├── hooks.ts
│   │   │   │   └── types.ts
│   │   │   │
│   │   │   └── registry.ts          # Plugin registry
│   │   │
│   │   ├── config/                  # UNIFIED CONFIG
│   │   │   ├── schema.ts            # Zod schemas
│   │   │   ├── loader.ts            # Config loading
│   │   │   ├── migration.ts         # Migration from old configs
│   │   │   └── adapters/            # Config format adapters
│   │   │       ├── opencode-json.ts
│   │   │       ├── antigravity.ts
│   │   │       └── ...
│   │   │
│   │   ├── mcp/                     # MCP INTEGRATION
│   │   │   ├── client.ts
│   │   │   ├── servers.ts
│   │   │   └── tools.ts
│   │   │
│   │   └── skills/                  # SKILL SYSTEM
│   │       ├── loader.ts
│   │       ├── registry.ts
│   │       └── execution.ts
│   │
│   ├── adapters-test/               # ADAPTER TESTS
│   │   ├── sisyphus.test.ts
│   │   ├── model-router.test.ts
│   │   └── ...
│   │
│   ├── e2e/                         # E2E TESTS
│   │   └── workflows/
│   │
│   └── docs/                        # DOCUMENTATION
│       ├── architecture.md
│       ├── migration-guide.md
│       └── breaking-changes.md
│
└── scripts/                         # MIGRATION SCRIPTS
    ├── migrate-to-v2.mjs
    ├── verify-adapter.mjs
    └── extract-repo.mjs            # For eventual extraction
```

**Key Insulation:**
- `opencode-cli-v2/` is a completely separate workspace
- Can build/test independently: `cd opencode-cli-v2 && bun test`
- No imports from `../packages/` (only through adapters)
- Eventually: `cp -r opencode-cli-v2 ../new-repo/`

---

## SWE-Agent UI Gold Standard

### What to Steal from SWE-Agent

#### 1. Terminal-Based Inspector
```typescript
// SWE-agent style: opencode inspect --trajectory traj.json
// Shows:
// ┌─────────────────────────────────────────┐
// │ Step 1: Initial thought                 │
// │ > Let me analyze the codebase...        │
// ├─────────────────────────────────────────┤
// │ Step 2: Tool call                       │
// │ > read_file({ path: "src/index.ts" }) │
// ├─────────────────────────────────────────┤
// │ Step 3: Observation                   │
// │ < File contents: export class...      │
// └─────────────────────────────────────────┘
```

#### 2. Live Status Display
```typescript
// SWE-agent style: opencode run --live
// Shows:
// ┌────────────────────────────────────┐
// │ Running: Create auth system        │
│ │                                    │
// │ Agent: prom (phase: planning)      │
// │ Step: 3 / ~15                      │
// │ Context: 45% (2345 / 8192 tokens)  │
// │ Time: 00:02:34                     │
// │                                    │
// │ [================>        ] 45%    │
// └────────────────────────────────────┘
```

#### 3. Trajectory Replay
```bash
# SWE-agent style commands:
opencode run --save-traj my-task.json    # Save trajectory
opencode replay my-task.json             # Replay
opencode replay my-task.json --step 5    # Jump to step 5
opencode replay my-task.json --diff      # Show changes
```

#### 4. Config-Driven Agents
```yaml
# .opencode/agents/prom.yaml
name: prom
type: planner
model: claude-3-5-sonnet
skills:
  - architecture-design
  - system-design
templates:
  system: "You are Prometheus, a strategic planner..."
  planning: |
    Create a work plan for: {{task}}
    
    Consider:
    - Dependencies
    - Risks
    - Acceptance criteria
```

#### 5. Batch Mode
```bash
# SWE-agent style:
opencode run-batch --config batch.yaml --tasks tasks.txt
opencode run-batch --config batch.yaml --dir ./tasks/
```

---

## Revised Phase Structure (6 Phases)

### Phase 1: Kernel Foundation (Weeks 1-6)
**Focus:** Build new kernel with strict mode, ports/adapters

**TODO 1.1: Create Insulated Workspace**
- Create `opencode-cli-v2/` directory
- Set up independent Bun workspace
- Configure TypeScript, ESLint, testing
- Add CI/CD for new workspace only

**TODO 1.2: Bootstrap Strict Mode Kernel**
- Create composition root (`src/kernel/index.ts`)
- Implement strict-mode bootstrap (fail fast)
- Build capability registry
- Add runtime state management
- Create health check system

**TODO 1.3: Define Port Interfaces**
- Define all 7 port interfaces:
  - OrchestrationPort
  - RoutingPort
  - BudgetPort
  - SkillsPort
  - LearningPort
  - PluginsPort
  - MCPPort

**TODO 1.4: Build Adapter Framework**
- Create base adapter class
- Build adapter registry
- Add adapter lifecycle (load, health check, graceful degradation)
- Create adapter testing utilities

---

### Phase 2: CLI Interface (Weeks 7-12)
**Focus:** Build SWE-agent-inspired CLI

**TODO 2.1: Core CLI Framework**
- Entry point with command routing
- Help system
- Config loading (unified)
- Error handling
- Progress indicators

**TODO 2.2: SWE-Agent Style Commands**
```
opencode run [--config] [--task] [--trajectory]
opencode run-batch [--config] [--tasks]
opencode replay <trajectory> [--step] [--diff]
opencode inspect [--trajectory] [--agent] [--live]
opencode agent [list|spawn|kill|logs]
opencode task [list|queue|cancel]
opencode skill [list|info|create]
opencode config [get|set|validate|migrate]
```

**TODO 2.3: Terminal UI Components**
- Inspector view (step-by-step)
- Live status display
- Progress bars
- Interactive prompts
- Trajectory viewer

**TODO 2.4: Config System**
- Unified config schema (Zod)
- Migration from old 6 configs
- Environment variable support
- Config validation

---

### Phase 3: Core Adapters (Weeks 13-24)
**Focus:** Build adapters for critical packages

**TODO 3.1: Orchestration Adapter**
- Adapter for `opencode-sisyphus-state`
- Map old state machine to new OrchestrationPort
- Trajectory recording
- Agent lifecycle management

**TODO 3.2: Model Router Adapter**
- Adapter for `opencode-model-router-x`
- Map to RoutingPort
- Budget-aware routing
- Fallback handling

**TODO 3.3: Context Governor Adapter**
- Adapter for `opencode-context-governor`
- Map to BudgetPort
- Token tracking
- Compression triggers

**TODO 3.4: Learning Engine Adapter**
- Adapter for `opencode-learning-engine`
- Map to LearningPort
- Pattern recognition
- Adaptive behavior

**TODO 3.5: Skill System Adapter**
- Adapter for `opencode-skill-loader`
- Map to SkillsPort
- Dynamic skill loading
- Contextual selection

**TODO 3.6: MCP Integration**
- MCP client implementation
- Tool discovery
- Tool execution
- Health checks

---

### Phase 4: Plugin Adapters (Weeks 25-36)
**Focus:** All 12 plugins via adapters

**TODO 4.1: Plugin SDK**
- Plugin interface definition
- Hook system
- Lifecycle management
- Plugin registry

**TODO 4.2-4.13: Per-Plugin Adapters**
- 4.2: oh-my-opencode (CRITICAL)
- 4.3: antigravity-auth (CRITICAL)
- 4.4: opencode-dcp (CRITICAL)
- 4.5: safety-net
- 4.6: rate-limit-fallback
- 4.7: notifier
- 4.8: langfuse
- 4.9: preload-skills (CRITICAL)
- 4.10: security-plugin (CRITICAL)
- 4.11: token-monitor
- 4.12: antigravity-quota
- 4.13: opencode-pty

---

### Phase 5: Testing & Validation (Weeks 37-44)
**Focus:** Comprehensive testing

**TODO 5.1: Unit Tests**
- Kernel tests
- Adapter tests
- CLI tests

**TODO 5.2: Integration Tests**
- Adapter integration tests
- Plugin integration tests
- End-to-end workflows

**TODO 5.3: Compatibility Testing**
- Compare old vs new behavior
- Document 5% differences
- Migration path validation

**TODO 5.4: Performance Testing**
- Benchmark vs old system
- Identify regressions
- Optimize critical paths

---

### Phase 6: Documentation & Extraction (Weeks 45-50)
**Focus:** Docs and repo extraction

**TODO 6.1: Documentation**
- Architecture documentation
- Migration guide
- Breaking changes list (the 5%)
- Plugin development guide
- API reference

**TODO 6.2: Migration Tools**
- Config migration script
- Verification tools
- Rollback scripts

**TODO 6.3: Repo Extraction**
- Copy `opencode-cli-v2/` to new repo
- Update paths
- Set up new CI/CD
- Publish to npm

---

## Key Technical Decisions

### 1. Strict Mode Implementation
```typescript
// src/kernel/strict-mode.ts
export class StrictModeKernel {
  private registry: CapabilityRegistry
  
  bootstrap() {
    // Fail fast on missing required capabilities
    const missing = this.registry.checkRequired()
    if (missing.length > 0) {
      throw new BootstrapError(
        `Missing required capabilities: ${missing.join(', ')}\n` +
        `Run with --degraded-mode to allow partial startup`
      )
    }
  }
}
```

### 2. Adapter Pattern
```typescript
// src/adapters/base.ts
export abstract class PackageAdapter<TPort> {
  abstract readonly name: string
  abstract readonly version: string
  abstract readonly port: TPort
  
  async load(): Promise<HealthStatus> {
    // Try to load old package
    // Return health status
  }
  
  async healthCheck(): Promise<HealthStatus> {
    // Check if adapter is healthy
  }
}

// Example: Sisyphus adapter
export class SisyphusAdapter extends PackageAdapter<OrchestrationPort> {
  private oldSisyphus: any
  
  async load() {
    this.oldSisyphus = await import('../../packages/opencode-sisyphus-state')
    return { status: 'healthy', version: this.oldSisyphus.VERSION }
  }
  
  get port(): OrchestrationPort {
    return {
      spawnAgent: (config) => this.adaptSpawn(config),
      getAgentStatus: (id) => this.adaptStatus(id),
      // ... map all methods
    }
  }
}
```

### 3. Port Interface Design
```typescript
// src/ports/orchestration.ts
export interface OrchestrationPort {
  spawnAgent(config: AgentConfig): Promise<AgentId>
  killAgent(id: AgentId): Promise<void>
  getAgentStatus(id: AgentId): Promise<AgentStatus>
  listAgents(): Promise<AgentInfo[]>
  executeTask(task: Task): Promise<TaskResult>
  getTrajectory(id: TaskId): Promise<Trajectory>
  replayTrajectory(id: TaskId, options: ReplayOptions): Promise<void>
}
```

### 4. Config Migration Strategy
```typescript
// src/config/migration.ts
export async function migrateConfig(oldPath: string): Promise<Config> {
  // Load old config (6 formats)
  const oldConfig = await loadOldConfig(oldPath)
  
  // Transform to new format
  const newConfig = {
    agents: oldConfig.agents,
    models: {
      default: oldConfig.model?.default,
      providers: oldConfig.providers,
    },
    // ... transform all fields
  }
  
  // Validate against new schema
  return ConfigSchema.parse(newConfig)
}
```

---

## 5% Breaking Changes (Documented)

### Breaking Changes We Accept
1. **Config Format**: New unified YAML, old JSON configs deprecated
   - Migration: `opencode config migrate` command
   - Impact: One-time migration

2. **Strict Mode Default**: Fail fast vs fail open
   - Impact: Scripts that relied on degraded mode will fail
   - Migration: Add `--degraded-mode` flag if needed

3. **Plugin API**: New SDK has different interface
   - Impact: Plugin authors must update
   - Migration: Adapter layer supports old plugins

4. **Dashboard Integration**: Deferred to later
   - Impact: No web UI initially
   - Migration: Use CLI inspector instead

5. **Script Paths**: New CLI has different path resolution
   - Impact: Scripts with hardcoded paths may break
   - Migration: Update paths or use adapter

---

## Testing Strategy

### Strict Mode Testing
```bash
# Should FAIL if any required capability missing
bun test --strict

# Should PASS with warnings if degraded mode
bun test --degraded-mode
```

### Adapter Testing
```typescript
// adapters-test/sisyphus.test.ts
describe('SisyphusAdapter', () => {
  test('maps spawnAgent correctly', async () => {
    const adapter = new SisyphusAdapter()
    await adapter.load()
    
    const result = await adapter.port.spawnAgent({
      type: 'prom',
      task: 'test'
    })
    
    expect(result).toBeAgentId()
  })
})
```

### Compatibility Testing
```bash
# Compare old vs new behavior
./scripts/compare-behaviors.mjs

# Should report:
# - 95% match
# - 5% differences (documented)
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| **Kernel too complex** | Start minimal, add capabilities incrementally |
| **Adapters fail** | Test each adapter thoroughly, fallback to degraded mode |
| **Timeline slips** | Ship incremental releases (Phase 2 = usable CLI) |
| **5% breaks critical feature** | Early compatibility testing, document all changes |
| **Extraction fails** | Build with extraction in mind (no relative paths) |
| **Plugin breakage** | Adapter layer supports old plugins, new SDK for new |

---

## Success Criteria

### Phase 1 (Week 6)
- [ ] Kernel boots in strict mode
- [ ] All 7 port interfaces defined
- [ ] Adapter framework working
- [ ] Tests pass

### Phase 2 (Week 12)
- [ ] CLI has all SWE-agent style commands
- [ ] Terminal UI functional
- [ ] Config system working
- [ ] Can spawn agents

### Phase 3 (Week 24)
- [ ] Core adapters working (orchestration, routing, budget, learning, skills)
- [ ] 80% feature parity
- [ ] Strict mode passes

### Phase 4 (Week 36)
- [ ] All 12 plugins working
- [ ] MCP integration complete
- [ ] 95% feature parity

### Phase 5 (Week 44)
- [ ] All tests pass
- [ ] Performance acceptable
- [ ] Breaking changes documented

### Phase 6 (Week 50)
- [ ] Documentation complete
- [ ] Migration tools working
- [ ] Extracted to new repo
- [ ] Published to npm

---

## Next Steps

1. **Create work plan file** ✅ (This is it)
2. **Start Phase 1.1** - Create insulated workspace
3. **Begin kernel development** - Bootstrap strict mode
4. **Start with adapters** - Sisyphus first (orchestration)

**Ready to start?** Run `/start-work` and Sisyphus will begin Phase 1.

**Plan Location:** `.sisyphus/plans/opencode-cli-migration-v2.md`
