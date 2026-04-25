# Cost/SLO Governor Implementation Plan

## TL;DR

**Objective**: Implement real-time budget envelopes with hard stop-loss and quality/latency tradeoffs to make AI coding costs predictable.

**Core Innovation**: Token budgets with automatic model fallback and per-task SLO enforcement. Never get surprised by usage again.

**Timeline**: 4 weeks (can run parallel with other work)
**Dependencies**: opencode-cli-v2 bootstrap
**Deliverable**: Budget tracking, SLO enforcement, model routing

---

## Context

### The Problem
AI coding tools have **unpredictable costs**:
- One "exploration" session = $50+ surprise
- No visibility into spend until after
- Rate limits break workflows unpredictably
- No quality/cost tradeoff controls

**Cost Governor fixes this** with proactive budgeting.

### User Pain Points (from research)
1. "I ran one command and it cost $30"
2. "Rate limited in the middle of refactoring"
3. "No idea which tasks are expensive"
4. "Can't set spending limits per project"
5. "Emergency: stop everything NOW"

---

## Work Objectives

### Core Objective
Make every token predictable with:
- **Per-session budgets**: Hard caps
- **Per-task policies**: Model selection based on risk
- **Real-time tracking**: Know cost before spending
- **Automatic fallback**: Cheap model if expensive fails
- **SLO enforcement**: Time + quality guarantees

### Concrete Deliverables
1. **Budget Manager**: Track per-session/per-model tokens
2. **Policy Engine**: Rules for model selection
3. **SLO Monitor**: Time/quality thresholds
4. **Fallback Controller**: Automatic model switching
5. **Dashboard**: Real-time visibility
6. **Alerts**: Proactive notifications

### Definition of Done
```bash
# Budget tracking works
bun run cost:check --session=abc123
# Output: $12.40 / $50.00 (24.8%)

# Policy enforcement works
bun run task --budget=10 --policy=frugal
# Output: Using kimi-k2.5-free (est. $0.50)

# SLO monitoring works
bun run slo:status
# Output: 95% tasks within 30s SLO

# Fallback triggers
bun run task --model=claude-opus --budget=5
# Output: Budget exceeded, falling back to sonnet-4-5

# All tests pass
bun test packages/opencode-cost-governor
```

### Must Have
- [ ] Per-session budget caps
- [ ] Per-task model policies
- [ ] Real-time cost estimation
- [ ] Automatic fallback
- [ ] SLO monitoring
- [ ] Alert thresholds

### Must NOT Have
- NO unlimited budgets
- NO post-hoc billing only
- NO surprise charges
- NO blocking without alternatives

---

## Verification Strategy

### Agent-Executed QA Scenarios

**Scenario: Budget Cap Enforcement**
```
Tool: Bun test
Preconditions: Session with $10 budget
Steps:
1. Task A: estimated $3, actual $2.50 → Execute ✓
2. Task B: estimated $5, actual $4.80 → Execute ✓
3. Task C: estimated $5, remaining $2.70 → BLOCK
4. Assert task C blocked with clear message
5. Assert fallback options presented
Expected: Hard stop at budget cap
Evidence: test-budget-cap.json
```

**Scenario: Model Fallback Chain**
```
Tool: Bun test
Preconditions: Policy: cheap → mid → expensive
Steps:
1. Request task with expensive model
2. Check budget: insufficient
3. Fall back to mid-tier model
4. Check budget: sufficient
5. Execute with mid-tier
6. Assert completion within budget
Expected: Automatic fallback to affordable model
Evidence: test-fallback-chain.json
```

**Scenario: SLO Breach**
```
Tool: Bun test
Preconditions: 30s SLO set, task taking 60s
Steps:
1. Start task with 30s SLO
2. Monitor elapsed time
3. At 30s, trigger SLO breach
4. Cancel or checkpoint task
5. Alert user with options
6. Assert graceful degradation
Expected: SLO enforced, user notified
Evidence: test-slo-breach.json
```

---

## Architecture

### Budget Model

```typescript
interface BudgetEnvelope {
  // Limits
  sessionId: string;
  totalBudget: number;      // USD
  tokenBudget: number;      // tokens
  
  // Current
  usedUSD: number;
  usedTokens: number;
  remaining: number;
  
  // Policy
  policy: BudgetPolicy;
  
  // State
  status: 'healthy' | 'warning' | 'critical' | 'exhausted';
  lastUpdated: Date;
}

interface BudgetPolicy {
  name: string;
  description: string;
  
  // Model preferences
  preferredModel: string;
  fallbackChain: string[];  // Ordered fallback
  
  // Thresholds
  warningThreshold: number;  // % of budget
  criticalThreshold: number;
  
  // SLOs
  maxLatency: number;       // seconds
  minQuality: number;       // 0-1
  
  // Behavior
  hardStop: boolean;        // Block or warn?
  autoFallback: boolean;    // Automatic?
  
  // Per-task
  taskOverrides: Map<TaskType, TaskPolicy>;
}

interface TaskPolicy {
  maxCost: number;
  preferredModel: string;
  timeout: number;
  retryCount: number;
}

// Predefined policies
const POLICIES = {
  minimal: {
    totalBudget: 5,
    fallbackChain: ['kimi-k2.5-free', 'gemini-2.5-flash'],
    hardStop: true,
  },
  standard: {
    totalBudget: 50,
    fallbackChain: ['antigravity-gemini-3-flash', 'claude-sonnet-4-5'],
    hardStop: false,
  },
  generous: {
    totalBudget: 200,
    fallbackChain: ['claude-sonnet-4-5', 'claude-opus-4-6'],
    hardStop: false,
  },
};
```

### Cost Estimation

```typescript
interface CostEstimator {
  // Before execution
  estimateTask(task: Task): Promise<CostEstimate>;
  
  // Real-time
  updateUsage(sessionId: string, tokens: number, cost: number): void;
  
  // Check
  canAfford(sessionId: string, estimate: CostEstimate): boolean;
  
  // Recommend
  recommendModel(
    task: Task,
    budget: BudgetEnvelope
  ): Promise<ModelRecommendation>;
}

interface CostEstimate {
  tokens: { min: number; expected: number; max: number };
  costUSD: { min: number; expected: number; max: number };
  confidence: number; // 0-1
}

interface ModelRecommendation {
  model: string;
  estimatedCost: number;
  probabilityOfSuccess: number;
  alternatives: Array<{
    model: string;
    cost: number;
    quality: number;
  }>;
}
```

### SLO Monitoring

```typescript
interface SLOMonitor {
  // Define SLOs
  defineSLO(name: string, threshold: SLOThreshold): void;
  
  // Track
  startTask(taskId: string, slo: string): void;
  endTask(taskId: string, outcome: TaskOutcome): void;
  
  // Check
  checkSLO(slo: string): SLOResult;
  
  // Alert
  onBreach(callback: (breach: SLOBreach) => void): void;
}

interface SLOThreshold {
  metric: 'latency' | 'quality' | 'cost';
  target: number;
  window: Duration;
}

interface SLOResult {
  compliant: boolean;
  current: number;
  target: number;
  trend: 'improving' | 'stable' | 'degrading';
}
```

### Storage

```
~/.opencode/cost/
├── budgets/
│   ├── session-abc123.json
│   └── session-def456.json
├── policies/
│   ├── default.json
│   ├── frugal.json
│   └── aggressive.json
├── usage/
│   ├── 2026-04/
│   │   ├── daily.json
│   │   └── hourly.json
└── slo/
    └── breaches.json
```

---

## Execution Strategy

### Wave 1: Budget Tracking (Week 1)

**Task 1: Budget Manager**
- Session tracking
- Model cost database
- Real-time updates
- Persistence

**Task 2: Cost Estimation**
- Token counting
- Model pricing lookup
- Confidence scoring

### Wave 2: Policy Engine (Week 2)

**Task 3: Policy Definition**
- Policy schema
- Predefined policies
- Custom policy builder
- Per-task overrides

**Task 4: Model Router**
- Select based on budget
- Fallback chain
- Quality/cost tradeoffs

### Wave 3: SLO Monitoring (Week 3)

**Task 5: SLO Framework**
- Metric collection
- Threshold checking
- Breach detection
- Alerting

**Task 6: Dashboard**
- Real-time view
- Historical trends
- Policy editor
- Alert configuration

### Wave 4: Integration (Week 4)

**Task 7: CLI Integration**
- `--budget` flag
- `--policy` flag
- Interactive prompts
- Emergency stop

**Task 8: Testing & Hardening**
- Edge cases
- Performance
- Documentation

---

## TODOs

### Task 1: Budget Manager
**What to do:**
```typescript
class BudgetManager {
  private budgets = new Map<string, BudgetEnvelope>();
  
  async createSession(policy: string): Promise<Session> {
    const budget = await this.calculateBudget(policy);
    return { sessionId: uuid(), budget };
  }
  
  async consume(sessionId: string, tokens: number, cost: number): Promise<Status> {
    const budget = this.budgets.get(sessionId);
    budget.usedUSD += cost;
    budget.usedTokens += tokens;
    
    if (budget.usedUSD > budget.totalBudget) {
      return { status: 'exhausted', remaining: 0 };
    }
    
    return { status: this.calculateStatus(budget), remaining: budget.remaining };
  }
}
```

**Acceptance Criteria:**
- [ ] Create session with budget
- [ ] Track usage accurately
- [ ] Persist across restarts
- [ ] Query status < 10ms

---

### Task 2: Policy Engine
**What to do:**
```typescript
class PolicyEngine {
  async selectModel(task: Task, budget: BudgetEnvelope): Promise<Model> {
    const estimate = await this.estimateCost(task);
    
    if (budget.canAfford(estimate)) {
      return budget.policy.preferredModel;
    }
    
    // Walk fallback chain
    for (const model of budget.policy.fallbackChain) {
      const cheapEstimate = await this.estimateCost(task, model);
      if (budget.canAfford(cheapEstimate)) {
        return model;
      }
    }
    
    throw new BudgetExceededError();
  }
}
```

**Acceptance Criteria:**
- [ ] Policy loads from config
- [ ] Model selected based on budget
- [ ] Fallback chain works
- [ ] Override for task types

---

### Task 3: SLO Monitor
**What to do:**
```typescript
class SLOMonitor {
  private slos = new Map<string, SLOThreshold>();
  private tasks = new Map<string, TaskTracker>();
  
  startTask(taskId: string, sloName: string) {
    const slo = this.slos.get(sloName);
    this.tasks.set(taskId, {
      startTime: Date.now(),
      slo,
      timeout: setTimeout(() => this.breach(taskId), slo.maxLatency * 1000)
    });
  }
  
  breach(taskId: string) {
    const task = this.tasks.get(taskId);
    this.emit('breach', { taskId, slo: task.slo });
  }
}
```

**Acceptance Criteria:**
- [ ] SLO defined in config
- [ ] Breach detected within 1s
- [ ] Alert fired
- [ ] Graceful degradation

---

### Task 4: CLI Integration
**What to do:**
```bash
# Usage examples
opencode --budget=10 --policy=minimal "refactor auth"
# → Selected: kimi-k2.5-free (est. $0.50)

opencode --budget=100 --policy=standard "architect new feature"
# → Selected: antigravity-gemini-3-flash (est. $15.00)

opencode --emergency-stop
# → All sessions paused, usage report generated
```

**Acceptance Criteria:**
- [ ] Flags parsed correctly
- [ ] Estimates shown before execution
- [ ] Interactive confirmation on high cost
- [ ] Emergency stop works

---

## Integration with VMG & Ledger

```
Cost Governor ←→ VMG
├── "Expensive tasks" learned as pattern
├── Model preferences stored as facts
└── Budget breaches trigger causal analysis

Cost Governor ←→ Ledger
├── Every cost decision logged
├── Budget history replayable
└── SLO breaches analyzed
```

---

## Success Criteria

```bash
# Budget tracking
bun run cost:status
# Output: Session abc123: $12.40 / $50.00 (24.8%)

# Policy selection
bun run task --dry-run --budget=5
# Output: Would use: kimi-k2.5-free (est. $0.50, 95% confidence)

# SLO check
bun run slo:status
# Output: Latency SLO: 94% < 30s (target: 95%)

# Emergency stop
bun run cost:pause --all
# Output: Paused 3 sessions, total at-risk: $47.20
```

---

## Competitive Position

| Feature | Claude | Cursor | Codex | Devin | **OpenCode v3** |
|---------|--------|--------|-------|-------|-----------------|
| Budget caps | ❌ No | ❌ No | ⚠️ Basic | ❌ No | ✅ Per-session |
| Cost estimation | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Before execution |
| Model fallback | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Automatic |
| SLO enforcement | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Time + quality |
| Spend alerts | ❌ No | ❌ No | ❌ No | ❌ No | ✅ Proactive |

**Position**: "Predictable costs, guaranteed SLOs"

---

**Plan Status**: Ready for review
**Next Action**: Approve → Begin Task 1 (Budget Manager)
