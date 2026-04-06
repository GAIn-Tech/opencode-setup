# Cascading Catalyzation Implementation Plan

**Date**: 2026-04-05  
**Source**: Frontier Validation Audit (March 2026)  
**Ordering Principle**: Items ordered by cascading catalytic impact — each wave unlocks the maximum number of subsequent items  

---

## Wave 1: Foundation (Highest Catalytic Impact)

> These three items unlock ~70% of all subsequent work. Do these first.

### 1. Make PEV Explicit with Contracted Roles

**Catalytic Impact**: Unlocks items 7, 8, 9, 12, 13-16, 17, 18  
**Why First**: Without explicit PEV contracts, verifier agents, workflow definitions, outer-loop automation, and critic models have no architectural home.

**Implementation**:

```
Task 1.1: Define PEV Contract Interface
  File: packages/opencode-pev-contract/src/index.js
  - Define Planner interface: { decompose(task) => Plan, validate(plan) => boolean }
  - Define Executor interface: { execute(plan, context) => Result }
  - Define Verifier interface: { verify(result, plan) => Verification }
  - Define Critic interface (optional): { evaluate(results[]) => BestResult }
  - Export contract types and validation utilities

Task 1.2: Wrap OrchestrationAdvisor as Planner
  File: packages/opencode-learning-engine/src/orchestration-advisor.js
  - Add implementsPlanner() method
  - Ensure advise() returns Plan object matching contract
  - Add plan validation against contract

Task 1.3: Wrap WorkflowExecutor as Executor
  File: packages/opencode-sisyphus-state/src/executor.js
  - Add implementsExecutor() method
  - Ensure execute() accepts Plan object from contract
  - Add execution result formatting to match contract

Task 1.4: Create Verifier Base Class
  File: packages/opencode-verifier-agent/src/index.js
  - Base verifier with verification interface
  - Support multiple verification methods (test execution, static analysis, LLM-as-judge)
  - Return Verification object matching contract

Task 1.5: Wire PEV into Integration Layer
  File: packages/opencode-integration-layer/src/index.js
  - Replace direct OrchestrationAdvisor/WorkflowExecutor calls with PEV contract
  - Add PEV validation at integration boundaries
  - Emit PEV lifecycle events (plan_created, executed, verified)

Acceptance Criteria:
  - PEV contract package exists with TypeScript-style JSDoc types
  - OrchestrationAdvisor implements Planner interface
  - WorkflowExecutor implements Executor interface
  - Verifier base class exists with at least one concrete implementation
  - Integration layer uses PEV contract, not direct component calls
  - PEV lifecycle events emitted and observable in dashboard
```

### 2. Context Budget Enforcement (Binding)

**Catalytic Impact**: Unlocks items 10, 11, 18  
**Why Second**: Advisory-only budget checks undermine all governance. Making them binding enables learning-outcome governance, structured memory, and dashboard-driven runtime control.

**Implementation**:

```
Task 2.1: Define Budget Enforcement Modes
  File: packages/opencode-context-governor/src/index.js
  - Add mode: 'advisory' (current behavior) | 'enforce-critical' (new)
  - In 'enforce-critical' mode: budget >= 80% throws BUDGET_EXHAUSTED
  - In 'advisory' mode: current behavior (log only)
  - Mode configurable via env var: OPENCODE_BUDGET_MODE

Task 2.2: Wire Binding Enforcement into Integration Layer
  File: packages/opencode-integration-layer/src/index.js:1633-1647
  - Replace advisory-only check with mode-aware check
  - If mode === 'enforce-critical' && budget.status === 'error':
      throw new Error('Context budget exhausted')
  - If mode === 'enforce-critical' && budget.status === 'warn':
      emit BUDGET_WARNING event, continue with compression
  - Keep advisory mode as default for backward compatibility

Task 2.3: Add Compression Trigger on Warning
  File: packages/opencode-integration-layer/src/index.js
  - On BUDGET_WARNING in enforce-critical mode:
      1. Trigger Distill/DCP compression automatically
      2. If compression insufficient, trigger Context7 JIT lookup for critical docs only
      3. If still over budget, throw BUDGET_EXHAUSTED

Task 2.4: Add Budget Enforcement Tests
  File: packages/opencode-context-governor/test/enforcement.test.js
  - Test advisory mode (current behavior preserved)
  - Test enforce-critical mode at 75%, 80%, 95%
  - Test compression trigger on warning
  - Test BUDGET_EXHAUSTED error propagation

Acceptance Criteria:
  - Budget enforcement mode configurable via env var
  - enforce-critical mode throws at 80%+ budget
  - Advisory mode preserves current behavior
  - Compression triggered automatically on warning in enforce-critical mode
  - All tests pass (advisory + enforce-critical modes)
```

### 3. Eval-Driven Tool Optimization

**Catalytic Impact**: Unlocks items 4, 6, 7  
**Why Third**: Tool description quality, namespacing, and token efficiency all depend on having an eval framework to measure and optimize against.

**Implementation**:

```
Task 3.1: Extend Eval Harness for Tool Evaluation
  File: packages/opencode-eval-harness/src/index.js
  - Add evaluateTool(toolName, testSuite) method
  - Metrics: success_rate, avg_tokens, avg_latency, error_rate, confusion_rate
  - confusion_rate: how often agent misuses the tool (wrong params, wrong context)
  - Store results in eval database with tool version tracking

Task 3.2: Create Tool Eval Test Suites
  File: packages/opencode-eval-harness/test-suites/tools/
  - For each MCP tool: create standardized test suite
  - Tests: correct usage, edge cases, error handling, token efficiency
  - Include real task scenarios (not just synthetic)

Task 3.3: Add Tool Quality Dashboard API
  File: packages/opencode-dashboard/src/app/api/tool-quality/route.js
  - GET /api/tool-quality: returns tool eval results
  - Include success_rate, avg_tokens, confusion_rate per tool
  - Highlight tools below quality thresholds

Task 3.4: Wire Tool Eval into Optimization Loop
  File: packages/opencode-skill-rl-manager/src/index.js
  - On recordOutcome(), also update tool quality metrics
  - If tool confusion_rate > threshold, flag for description review
  - If tool avg_tokens > threshold, flag for truncation/pagination review

Acceptance Criteria:
  - Eval harness can evaluate individual tools
  - Tool eval test suites exist for all MCP tools
  - Tool quality dashboard API returns eval results
  - Tool quality metrics feed into skill RL optimization loop
  - Low-quality tools flagged for review
```

---

## Wave 2: Leverage (High Catalytic Impact)

> These three items build on Wave 1 and unlock the next layer of capability.

### 4. Wire Thompson Sampling into Routing Path

**Catalytic Impact**: Unlocks items 9, 12  
**Why Here**: Depends on nothing from Wave 1, but enables best-of-N selection and static constraint removal.

**Implementation**:

```
Task 4.1: Audit Thompson Sampling Router
  File: packages/opencode-model-router-x/src/thompson-sampling-router.js
  - Verify Thompson Sampling implementation is complete
  - Check cold-start handling (UCB1 → Gaussian Thompson)
  - Verify reward signal integration

Task 4.2: Wire Thompson Sampling into ModelRouter.route()
  File: packages/opencode-model-router-x/src/index.js
  - Add routing strategy: 'thompson-sampling' | 'scoring' | 'category'
  - Default to 'scoring' for backward compatibility
  - When strategy === 'thompson-sampling':
      1. Call thompsonSamplingRouter.selectModel(context)
      2. Return selected model with provenance: 'thompson-sampling'
  - Add fallback to scoring if Thompson Sampling fails

Task 4.3: Add Thompson Sampling to Category Routing
  File: opencode-config/oh-my-opencode.json
  - Add per-category routing strategy config:
      "categories": {
        "deep": { "model": "glm-5", "routing": "thompson-sampling" },
        "quick": { "model": "gemini-2.5-flash", "routing": "scoring" }
      }

Task 4.4: Add Thompson Sampling Telemetry
  File: packages/opencode-model-router-x/src/index.js
  - Emit THOMPSON_SELECTION event with selected model, confidence, exploration flag
  - Track exploration vs exploitation ratio
  - Dashboard: /api/routing-strategy returns active strategy per category

Acceptance Criteria:
  - Thompson Sampling wired into ModelRouter.route()
  - Per-category routing strategy configurable
  - THOMPSON_SELECTION events emitted and observable
  - Fallback to scoring on Thompson Sampling failure
  - Exploration vs exploitation ratio tracked
```

### 5. Make Learning Outcomes Govern Routing

**Catalytic Impact**: Unlocks items 11, 18  
**Why Here**: Depends on Wave 1's binding enforcement. Without binding, learning outcomes are advisory only.

**Implementation**:

```
Task 5.1: Add Learning Outcome → Routing Bridge
  File: packages/opencode-learning-engine/src/orchestration-advisor.js
  - Add applyLearningToRouting(advice, routingContext) method
  - If anti-pattern risk_score > threshold:
      Override routing to safer agent/skill combination
  - If positive pattern success_rate > threshold:
      Boost routing confidence for recommended agent/skill

Task 5.2: Wire Learning Bridge into Integration Layer
  File: packages/opencode-integration-layer/src/index.js
  - After advise() returns, call applyLearningToRouting()
  - If learning overrides routing, emit LEARNING_OVERRIDE event
  - Log override reason for audit trail

Task 5.3: Add Learning Governance Thresholds
  File: packages/opencode-learning-engine/src/orchestration-advisor.js
  - Configurable thresholds:
      anti_pattern_override_risk: 20 (default)
      positive_pattern_boost_success: 0.8 (default)
  - Thresholds via env var or config file

Task 5.4: Add Learning Governance Tests
  File: packages/opencode-learning-engine/test/governance.test.js
  - Test anti-pattern override at various risk scores
  - Test positive pattern boost at various success rates
  - Test threshold configuration
  - Test LEARNING_OVERRIDE event emission

Acceptance Criteria:
  - Learning outcomes can override routing decisions
  - Anti-pattern high risk forces safer routing
  - Positive pattern high success boosts routing confidence
  - LEARNING_OVERRIDE events emitted and observable
  - Thresholds configurable
```

### 6. Data-Driven Workflow Definitions

**Catalytic Impact**: Unlocks items 13-16  
**Why Here**: Depends on Wave 1's PEV contract. Workflows need PEV roles to reference.

**Implementation**:

```
Task 6.1: Define Workflow Schema
  File: packages/opencode-sisyphus-state/src/schema/workflow.json
  - JSON Schema for workflow definitions
  - Fields: name, version, steps[], pe_roles[], policy{}
  - Steps: id, type, pe_role, retries, backoff, timeout, inputs, outputs
  - PE roles: planner, executor, verifier, critic

Task 6.2: Add Workflow Definition Loader
  File: packages/opencode-sisyphus-state/src/workflow-loader.js
  - Load workflow from JSON/YAML file
  - Validate against schema
  - Resolve PEV role references to actual implementations
  - Return validated workflow definition

Task 6.3: Convert Existing Workflows to Data
  File: packages/opencode-sisyphus-state/src/workflows/
  - Convert hardcoded workflow definitions to JSON/YAML
  - Example: outer-loop-pr-review.yaml, outer-loop-vuln-fix.yaml
  - Each workflow references PEV roles

Task 6.4: Add Workflow Versioning
  File: packages/opencode-sisyphus-state/src/workflow-registry.js
  - Registry of workflow definitions with versions
  - Load workflow by name + version
  - Backward compatibility for older versions

Acceptance Criteria:
  - Workflow JSON Schema defined and validated
  - Workflow loader parses JSON/YAML definitions
  - At least one existing workflow converted to data-driven format
  - Workflow registry supports versioning
```

---

## Wave 3: Capability (Medium Catalytic Impact)

> These five items build on Waves 1-2 and enable outer-loop productization.

### 7. Dedicated Verifier Agent for Code

**Catalytic Impact**: Unlocks items 9, 17  
**Depends on**: Wave 1 (PEV contract)

```
Task 7.1: Create Verifier Agent Package
  File: packages/opencode-verifier-agent/src/index.js
  - Implements Verifier interface from PEV contract
  - Verification methods:
      verifyTests(result) — run test suite, assert pass
      verifyStatic(result) — lint, type check, AST analysis
      verifyLLM(result, plan) — LLM-as-judge verification
  - Return Verification: { passed, failures, confidence }

Task 7.2: Wire Verifier into Integration Layer
  File: packages/opencode-integration-layer/src/index.js
  - After executor completes, call verifier.verify()
  - If verification fails:
      Emit VERIFICATION_FAILED event
      Trigger retry or escalation based on policy
  - If verification passes:
      Emit VERIFICATION_PASSED event
      Proceed to next step

Task 7.3: Add Verification Policy
  File: packages/opencode-verifier-agent/src/policy.js
  - Configurable verification policy:
      when: always | on-failure | on-high-impact
      methods: [tests, static, llm]
      max_retries: 3
      escalation: human | auto-fix
  - Policy via config file

Task 7.4: Add Verifier Tests
  File: packages/opencode-verifier-agent/test/verifier.test.js
  - Test each verification method
  - Test verification policy
  - Test retry and escalation logic

Acceptance Criteria:
  - Verifier agent implements PEV Verifier interface
  - Three verification methods: tests, static, LLM-as-judge
  - Verification policy configurable
  - Verifier wired into integration layer
  - VERIFICATION_FAILED/PASSED events emitted
```

### 8. Systematic Tool Namespacing

**Catalytic Impact**: Unlocks item 9  
**Depends on**: Wave 1 (Eval-driven tool optimization)

```
Task 8.1: Define Namespacing Convention
  File: opencode-config/tool-namespacing.json
  - Convention: {service}_{resource}_{action}
  - Examples: github_issue_create, github_pr_review, postgres_query_execute
  - Document convention in AGENTS.md

Task 8.2: Migrate Existing Tools to Namespaced Names
  File: packages/opencode-mcp-bridge/src/
  - Update all MCP tool names to follow convention
  - Update skill definitions to reference namespaced tools
  - Update tool affinity mappings

Task 8.3: Add Namespacing Validation
  File: packages/opencode-mcp-bridge/src/namespace-validator.js
  - Validate tool names against convention
  - Warn on non-compliant names
  - CI check for namespacing compliance

Acceptance Criteria:
  - Namespacing convention defined and documented
  - All MCP tools follow convention
  - Skill definitions reference namespaced tools
  - CI check enforces namespacing
```

### 9. Token-Efficient Tool Responses

**Catalytic Impact**: Unlocks items 11, 18  
**Depends on**: Wave 1 (Eval-driven tool optimization), Wave 3 (Namespacing)

```
Task 9.1: Add Response Truncation
  File: packages/opencode-mcp-bridge/src/response-truncator.js
  - Truncate tool responses to configurable max tokens
  - Default: 25,000 tokens (Anthropic Claude Code default)
  - Preserve beginning and end of response
  - Add truncation marker: "... [truncated, N tokens omitted] ..."

Task 9.2: Add Response Pagination
  File: packages/opencode-mcp-bridge/src/response-paginator.js
  - For tools that return lists: paginate results
  - Default page size: 50 items
  - Support page_token for continuation
  - Tool schema includes pagination params

Task 9.3: Add Response Filtering
  File: packages/opencode-mcp-bridge/src/response-filter.js
  - Allow tools to declare filterable fields
  - Agent can request filtered responses
  - Reduces token consumption for large datasets

Task 9.4: Wire Token Efficiency into Tool Pipeline
  File: packages/opencode-mcp-bridge/src/index.js
  - Apply truncation, pagination, filtering in tool response pipeline
  - Track token savings per tool
  - Emit TOKEN_EFFICIENCY event with savings data

Acceptance Criteria:
  - Tool responses truncated to max tokens
  - List-returning tools support pagination
  - Tools support field filtering
  - Token savings tracked and observable
```

### 10. Remove Static Constraint Filters

**Catalytic Impact**: Enables dynamic intelligence to dominate  
**Depends on**: Wave 2 (Thompson Sampling wiring)

```
Task 10.1: Audit Static Constraints
  File: packages/opencode-model-router-x/src/index.js:1301-1331
  - Identify all static constraint filters
  - Document rationale for each
  - Determine which can be removed vs converted to soft penalties

Task 10.2: Convert Hard Filters to Soft Penalties
  File: packages/opencode-model-router-x/src/index.js
  - Replace _filterByConstraints() with _applyConstraintPenalties()
  - Instead of filtering out Anthropic: apply penalty score
  - Thompson Sampling can still select penalized models if confidence is high
  - Log when constraint penalty is applied

Task 10.3: Add Constraint Override Config
  File: opencode-config/oh-my-opencode.json
  - Allow per-category constraint overrides:
      "categories": {
        "deep": {
          "constraints": { "allow_anthropic": true }
        }
      }

Task 10.4: Add Constraint Penalty Tests
  File: packages/opencode-model-router-x/test/constraints.test.js
  - Test soft penalty application
  - Test constraint override config
  - Test Thompson Sampling selection with penalties

Acceptance Criteria:
  - No hard filters in routing path
  - Static constraints converted to soft penalties
  - Constraint override config works
  - Thompson Sampling can select penalized models when appropriate
```

### 11. Structured Note-Taking in Memory Graph

**Catalytic Impact**: Enables long-horizon context management  
**Depends on**: Wave 1 (Binding enforcement), Wave 2 (Learning governance)

```
Task 11.1: Extend Memory Graph Schema
  File: packages/opencode-memory-graph/src/schema.js
  - Add Note node type: { id, content, tags, session_id, created_at }
  - Add Note→Session edge: created_in
  - Add Note→Note edge: relates_to, supersedes

Task 11.2: Add Note-Taking API
  File: packages/opencode-memory-graph/src/notes.js
  - createNote(content, tags, session_id)
  - queryNotes(tags, session_id, limit)
  - updateNote(id, content)
  - deleteNote(id)

Task 11.3: Wire Notes into PEV Planner
  File: packages/opencode-learning-engine/src/orchestration-advisor.js
  - Planner can create notes during decomposition
  - Notes persist across session boundaries
  - Executor can query notes for context
  - Verifier can add notes about verification results

Task 11.4: Add Note Retrieval to Context Bridge
  File: packages/opencode-integration-layer/src/context-bridge.js
  - On context budget warning, query relevant notes
  - Inject notes into context as structured memory
  - Track note injection in telemetry

Acceptance Criteria:
  - Memory graph supports Note nodes and edges
  - Note-taking API works (create, query, update, delete)
  - PEV Planner creates notes during decomposition
  - Context Bridge injects notes on budget warning
```

---

## Wave 4: Productization (Lower Catalytic Impact, High User Value)

> These items deliver direct user value but depend on all previous waves.

### 12. Best-of-N Selection for High-Value Tasks

**Depends on**: Wave 2 (Thompson Sampling), Wave 3 (Verifier Agent)

```
Task 12.1: Add BestOfN Selector
  File: packages/opencode-verifier-agent/src/best-of-n.js
  - Run executor N times with different seeds/temperatures
  - Use verifier to score each result
  - Return highest-scoring result
  - Configurable N (default: 3 for high-value tasks)

Task 12.2: Wire BestOfN into PEV Critic Role
  File: packages/opencode-pev-contract/src/index.js
  - Critic interface: evaluate(results[]) => BestResult
  - BestOfN implements Critic interface
  - Integrate with PEV lifecycle events

Task 12.3: Add BestOfN Policy
  File: packages/opencode-verifier-agent/src/best-of-n-policy.js
  - Trigger conditions:
      task complexity >= 'complex'
      OR anti_pattern risk_score > threshold
      OR user explicitly requests
  - Configurable N and timeout

Acceptance Criteria:
  - BestOfN selector runs executor N times
  - Verifier scores each result
  - Highest-scoring result returned
  - BestOfN policy triggers appropriately
```

### 13-16. Outer-Loop Automation (PR, Vuln, Migration, Incident)

**Depends on**: Wave 1 (PEV, Workflows), Wave 2 (Data-driven workflows), Wave 3 (Verifier)

```
Task 13: Outer-Loop PR Automation
  File: packages/opencode-sisyphus-state/src/workflows/outer-loop-pr-review.yaml
  - Workflow: PR review → analysis → suggestions → comment
  - PEV roles: Planner (analyze PR), Executor (generate suggestions), Verifier (validate suggestions)
  - Trigger: GitHub webhook on PR open
  - Output: PR comment with review

Task 14: Autonomous Vulnerability Remediation
  File: packages/opencode-sisyphus-state/src/workflows/outer-loop-vuln-fix.yaml
  - Workflow: vuln detection → analysis → fix → test → PR
  - PEV roles: Planner (analyze vuln), Executor (implement fix), Verifier (run tests)
  - Trigger: SAST scan result or dependency alert
  - Output: PR with fix

Task 15: Governed Code Migration
  File: packages/opencode-sisyphus-state/src/workflows/outer-loop-migration.yaml
  - Workflow: analysis → conversion → test → validation → PR
  - PEV roles: Planner (plan migration), Executor (convert code), Verifier (validate)
  - Trigger: Manual or scheduled
  - Output: PR with migrated code

Task 16: Autonomous Incident Triage
  File: packages/opencode-sisyphus-state/src/workflows/outer-loop-incident.yaml
  - Workflow: alert → investigation → root cause → fix suggestion → PR
  - PEV roles: Planner (investigate), Executor (implement fix), Verifier (validate)
  - Trigger: Monitoring alert
  - Output: Incident report + fix PR

Acceptance Criteria (all 4):
  - Workflow YAML defined and validated
  - PEV roles wired correctly
  - Trigger mechanism works (webhook, scheduled, manual)
  - Output produced (PR, report, comment)
  - Verifier validates output before submission
```

### 17. Trained Critic Model for Solution Selection

**Depends on**: Wave 3 (Verifier Agent), Wave 4 (Best-of-N)

```
Task 17.1: Collect Training Trajectories
  File: scripts/collect-critic-training-data.mjs
  - Export execution trajectories from session logs
  - Include: task, plan, execution steps, result, verification outcome
  - Label trajectories as success/failure based on verification

Task 17.2: Train Critic Model
  File: scripts/train-critic-model.mjs
  - Use Qwen 2.5 Coder 32B as base (per OpenHands approach)
  - Fine-tune on trajectory data with TD learning objective
  - Export critic model to packages/opencode-critic-model/

Task 17.3: Wire Critic Model into BestOfN
  File: packages/opencode-verifier-agent/src/critic-verifier.js
  - Implements Verifier interface
  - Uses trained critic model to score results
  - Fallback to LLM-as-judge if critic model unavailable

Acceptance Criteria:
  - Training data collected from session logs
  - Critic model trained and exported
  - Critic verifier implements Verifier interface
  - Fallback to LLM-as-judge works
```

### 18. Make Dashboard Metrics Govern Runtime

**Depends on**: Wave 1 (Binding enforcement), Wave 2 (Learning governance)

```
Task 18.1: Add Governance API Endpoints
  File: packages/opencode-dashboard/src/app/api/governance/route.js
  - POST /api/governance/update: update runtime governance settings
  - GET /api/governance/status: current governance state
  - Settings: budget mode, learning thresholds, verification policy

Task 18.2: Wire Governance into Runtime
  File: packages/opencode-integration-layer/src/index.js
  - Poll governance settings on startup
  - Apply settings to runtime configuration
  - Emit GOVERNANCE_UPDATED event on change

Task 18.3: Add Governance Dashboard UI
  File: packages/opencode-dashboard/src/app/governance/page.tsx
  - Budget mode toggle (advisory / enforce-critical)
  - Learning threshold sliders
  - Verification policy config
  - Real-time governance status

Acceptance Criteria:
  - Governance API endpoints work
  - Runtime applies governance settings
  - Dashboard UI allows configuration
  - GOVERNANCE_UPDATED events emitted
```

---

## Dependency Graph

```
Wave 1 (Foundation):
  1 ──┐
  2 ──┼──→ Wave 2 (Leverage):
  3 ──┘    4 ──┐
             5 ──┼──→ Wave 3 (Capability):
             6 ──┘    7 ──┐
                        8 ──┼──→ Wave 4 (Productization):
                        9 ──┼    12 ──┐
                       10 ──┼    13 ──┼
                       11 ──┘    14 ──┼
                                     15 ──┼
                                     16 ──┼
                                     17 ──┘
                                     18
```

## Execution Strategy

| Wave | Items | Estimated Effort | Parallel Execution |
|------|-------|-----------------|-------------------|
| 1 | 1, 2, 3 | Medium | YES (independent) |
| 2 | 4, 5, 6 | Medium | YES (independent) |
| 3 | 7, 8, 9, 10, 11 | Large | Partial (7,8 independent; 9 depends on 8; 10 depends on 4; 11 depends on 2,5) |
| 4 | 12, 13-16, 17, 18 | XL | Partial (12 independent; 13-16 parallel; 17 depends on 7,12; 18 depends on 2,5) |

## Critical Path

```
1 → 6 → 13-16 (Outer-loop automation)
2 → 5 → 11 → 18 (Dashboard governance)
3 → 8 → 9 (Token efficiency)
4 → 10 (Remove static constraints)
4 → 12 → 17 (Critic model)
```

**Longest path**: 1 → 6 → 13-16 (Foundation → Workflows → Outer-loop)

---

## Success Criteria

### Wave 1 Complete When:
- PEV contract defined and all components implement it
- Budget enforcement mode configurable and binding in enforce-critical mode
- Tool eval harness operational with quality metrics

### Wave 2 Complete When:
- Thompson Sampling selectable per category
- Learning outcomes can override routing decisions
- Workflows defined as data (JSON/YAML), not code

### Wave 3 Complete When:
- Verifier agent implements PEV Verifier interface
- All tools namespaced and token-efficient
- Static constraints converted to soft penalties
- Memory graph supports structured notes

### Wave 4 Complete When:
- Best-of-N selection operational for high-value tasks
- All 4 outer-loop workflows productized
- Critic model trained and wired into verification
- Dashboard metrics govern runtime behavior

---

*This plan is ordered by cascading catalytic impact. Each wave unlocks the maximum number of subsequent items. Do not skip waves — the catalytic dependencies are real.*
