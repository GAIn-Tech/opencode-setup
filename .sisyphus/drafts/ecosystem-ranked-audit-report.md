# Ranked Audit Report: OpenCode Ecosystem

## Scope
- Subagents and delegation behavior
- `oh-my-opencode` runtime authority and external plugin surfaces
- Orchestration, learning, routing, alerting, and context-budget control loops
- Tool/package/skill utilization, resilience, and stalled-work detection

## Ranking Method
Primary ordering is by **operational severity** using:
1. Blast radius
2. Detection lag
3. Recovery determinism
4. User trust / operator explainability impact

## Executive Summary
The strongest current pattern is **control-plane fragmentation under fail-open behavior**. The ecosystem has many good parts, but critical runtime truth is split across config, plugin hooks, mirrored telemetry logic, fallback imports, and multi-package threshold logic. That combination creates a high-risk mode where the system can look healthy while routing, delegating, or learning from degraded assumptions.

## Ranked Findings

### 1. Split control plane for agent/model/runtime authority
**Severity:** Critical

**Why it ranks first**
- High blast radius: affects routing, delegation explainability, telemetry correctness, and operator trust.
- Long detection lag: drift can persist without obvious hard failures.
- Poor recovery determinism: operators may not know which surface is authoritative.

**Evidence**
- `opencode-config/oh-my-opencode.json` is treated as a primary config surface for named agents, categories, and model overrides.
- `agents-list.md:25` says named agents are plugin-managed through `~/.config/opencode/oh-my-opencode.json`.
- `README.md:132` also calls `oh-my-opencode.json` the canonical named-agent registry.
- `scripts/runtime-tool-telemetry.mjs:102-127` mirrors category→model and agent→model assignments inline instead of resolving one authority at runtime.
- `opencode-config/docs/agent-integration-summary.md:75-79,143-147` documents an external-agent auditability gap.

**Failure mode**
- Configured truth, runtime truth, and observed truth can diverge while appearing nominal.

**Improvement direction**
- Establish one testable runtime contract for agent/category/model resolution and make every downstream surface consume it rather than mirror it.

### 2. Silent degradation in orchestration and routing seams
**Severity:** Critical

**Why it ranks second**
- High blast radius across orchestration advice, model selection, learning inputs, and resilience behavior.
- Fail-open fallbacks reduce visibility into degraded execution.

**Evidence**
- `packages/opencode-learning-engine/src/orchestration-advisor.js:24-42` falls back from shared orchestration utils to inline stubs with only a console warning.
- `packages/opencode-integration-layer/src/orchestration-policy.js:163-189` returns `failOpen: true` and `allowFailOpen: true` fallback metadata.
- `packages/opencode-model-router-x/src/index.js:52-67` and many surrounding imports show a large optional dependency surface with fallback loading.

**Failure mode**
- The system can continue operating with incomplete logic, stale helpers, or downgraded routing behavior without a hard degraded-state contract.

**Improvement direction**
- Replace silent fallback semantics with explicit degraded-mode state, telemetry, and learning/decision gating for critical paths.

### 3. Threshold and policy split-brain across Governor, ContextBridge, and AlertManager
**Severity:** High

**Why it ranks third**
- Cross-component drift can produce inconsistent compression, blocking, alerting, and dashboard interpretations.
- This directly harms “proper dynamic model routing at all times.”

**Evidence**
- `packages/opencode-integration-layer/src/context-bridge.js:11-15,28-31,133-160` uses warn=65%, urgent=80%, block=85%.
- `packages/opencode-context-governor/src/index.js:86-119` uses model-budget warn/error/exceeded semantics, with default thresholds sourced from `packages/opencode-context-governor/src/budgets.json` at 75% / 80%.
- `packages/opencode-model-manager/src/monitoring/alert-manager.js:95-160` fires budget alerts at 75% warning, 80% critical, 95% critical escalation.
- `packages/opencode-integration-layer/src/orchestration-policy.js:53-64` converts combined budget score into `healthy / medium / high / critical` bands with separate scaling logic.

**Failure mode**
- Compression enforcement, routing policy, and alert state can disagree during stress or outages.

**Improvement direction**
- Define cross-module invariants and centralize threshold semantics so all participating packages interpret budget state consistently.

### 4. No strong evidence of per-delegation no-progress detection
**Severity:** High

**Why it ranks fourth**
- The user explicitly prioritized early detection of stalled delegations.
- Current evidence favors plugin health tracking over task/delegation liveness.

**Evidence**
- `packages/opencode-plugin-lifecycle/src/index.js:19-83` tracks plugin health via configured/discovered/heartbeat/dependency/policy/crash signals and can quarantine crash-looping plugins.
- `packages/opencode-dashboard/API.md:735-751` exposes plugin heartbeat summaries.
- Grep re-gathering found plugin-level heartbeat/quarantine signals but did not surface equivalent per-task `no-progress`, `time-to-first-progress`, or delegation-heartbeat mechanisms.
- `scripts/runtime-tool-telemetry.mjs` records tool usage and delegation-adjacent telemetry files, but that is not the same as a first-class stalled-delegation detector.

**Failure mode**
- A delegation can stall quietly while the surrounding plugin/runtime appears healthy.

**Improvement direction**
- Add task-level liveness signals and operator-visible no-progress detection separate from plugin heartbeat health.

### 5. Telemetry and learning depend on external-hook plumbing and mirrored assumptions
**Severity:** High

**Why it ranks fifth**
- Tool utilization and skill/package usage are strategic priorities, but the telemetry chain is partly external, mirrored, and fail-open.

**Evidence**
- `scripts/runtime-tool-telemetry.mjs:5-35` depends on external `PostToolUse` hook registration from the plugin pipeline.
- `opencode-config/AGENTS.md` documents that runtime telemetry depends on the plugin firing `tool.execute.after` and a user-level hook config in `~/.claude/settings.json`.
- `opencode-config/docs/agent-integration-summary.md:80-93` flags passive MCP underutilization and weak MCP↔skill integration.

**Failure mode**
- Utilization data can be incomplete or skewed, reducing the reliability of learning feedback and undercutting attempts to improve routing/tool usage.

**Improvement direction**
- Make runtime telemetry presence, completeness, and attribution observable; reduce reliance on mirrored lookup tables and hidden hook assumptions.

### 6. Metadata incompleteness still weakens delegation quality and explainability
**Severity:** Medium-High

**Evidence**
- `opencode-config/docs/agent-integration-summary.md:85-110` documents missing `recommended_agents`, `compatible_agents`, and broader `tool_affinities` coverage as a meaningful gap.
- Some skills now contain metadata, but the repo’s own audit summary shows the broader ecosystem remains uneven.

**Failure mode**
- Delegation and skill selection remain less intuitive, less explainable, and more fragile than they should be.

**Improvement direction**
- Normalize minimum capability metadata across skill↔agent↔tool surfaces and use it in routing/explainability paths.

## What Improved Confidence In This Ranking
- Repeated direct reads across runtime policy, context bridge, governor, alerting, plugin lifecycle, learning advisor, and telemetry surfaces.
- Historical audit documents agreeing with current direct evidence on auditability and metadata gaps.
- Oracle synthesis consistently pointing to cross-component control-loop failures as the highest hidden risk.

## What Is Still Unproven
- Exact real-world runtime flow during provider outage or catalog drift.
- Whether any package already implements hidden per-delegation no-progress detection not surfaced by current searches.
- Whether dashboard, alerting, and routing state are already reconciled elsewhere during failure.

## Recommended Next Step
Produce a **review report / critique pass** over this ranking that:
- challenges ordering 3-6,
- identifies evidence gaps for each ranked item,
- and converts the accepted findings into a single derived work plan afterward.
