# Orchestration Intelligence Design

## Goal

Build a comprehensive orchestration observability and learning-signal system that measures behavior quality across delegation, tooling, verification, phase adherence, todo management, communication quality, task decomposition quality, skill-loading appropriateness, and failure recovery quality.

The system must:
- Provide complete visibility in dashboard UX with drill-down forensics
- Feed into RL loops as a bounded soft signal
- Prevent learning explosion/collapse with explicit stability controls
- Scale efficiently with append-only event logging and pre-aggregated rollups

## Domains

1. Delegation compliance
2. Tool selection quality
3. Verification discipline
4. Phase adherence
5. Todo management quality
6. Communication style adherence
7. Task decomposition quality
8. Skill-loading appropriateness
9. Failure recovery quality

Each domain has sub-metrics, domain score (0-100), and uncertainty metadata.

## Event Model

Primary storage: `~/.opencode/telemetry/orchestration-intel.jsonl`.

Event types:
- `orchestration.phase_entered`
- `orchestration.delegation_decision`
- `orchestration.skill_loaded`
- `orchestration.tool_invoked`
- `orchestration.verification_executed`
- `orchestration.todo_state_changed`
- `orchestration.assumption_challenged`
- `orchestration.context_gap_detected`
- `orchestration.failure_recovery_step`
- `orchestration.completion_claimed`

Core fields:
- `timestamp`, `session_id`, `task_id`, `agent`
- `task_type`, `complexity`, `intent`
- `event_type`, `outcome`, `evidence_refs`, `metadata`

## Scoring Model

- Atomic checks produce bounded signed deltas
- Sub-metrics aggregate checks with per-check caps
- Domain scores aggregate sub-metrics with configurable weights
- Composite score uses impact-weighted + task-relevance weighting

Context-adaptive scoring:
- Trivial tasks: reduced orchestration overhead expectation
- Complex tasks: strict orchestration expectations

Uncertainty fields:
- `score_mean`, `score_ci_low`, `score_ci_high`, `sample_count`

## RL Stability Controls

1. Bounded updates (`max_update_delta`)
2. Anomaly detection (z-score + rate-of-change)
3. Confidence gating
4. Selective reassessment on context drift (not blanket time decay)
5. Anti-collapse exploration floor + baseline priors
6. Anti-explosion single-signal dominance cap

## Storage and Retention

- Raw events: `~/.opencode/telemetry/orchestration-intel.jsonl` (30 days)
- Rollups: `~/.opencode/telemetry/orchestration-intel-rollups.json`
  - hourly: 180 days
  - daily: 2 years

Summary endpoints must read rollups first; forensics can read raw events.

## API Endpoints

- `GET /api/orchestration/meta-awareness`
- `GET /api/orchestration/meta-awareness/timeline?sinceDays=30`
- `GET /api/orchestration/correlation?sinceDays=30`
- `GET /api/orchestration/stability`
- `GET /api/orchestration/forensics?sessionId=...`

## Dashboard UX

Add `Orchestration Intelligence` tabs:
1. Executive
2. Domain Scores
3. Correlation
4. Learning Stability
5. Forensics

Visuals:
- score trends with confidence shading
- task-type heatmaps
- task -> agent/category -> skills/tools -> outcomes flow
- token-cost vs orchestration-quality scatter
- decomposition-quality radar

## Config Surface

Add `meta_awareness` section in central config:
- domain weights
- min samples
- confidence thresholds
- anomaly thresholds
- max update delta
- max RL influence
- exploration floor

## Implementation Phases

### Phase A - Tracker core
- `meta-awareness-tracker.js`
- `meta-awareness-rules.js`
- `meta-awareness-stability.js`
- `meta-awareness-rollups.js`

### Phase B - Event instrumentation
Emit events from orchestration/router/tool paths.

### Phase C - API
Add orchestration intelligence endpoints.

### Phase D - UI
Add dashboard components and forensics drill-down.

### Phase E - RL integration
Inject bounded meta-awareness soft signal.

### Phase F - Config + docs
Add central-config knobs and docs updates.

## Verification Requirements

1. Unit tests: rules, bounded updates, anomaly detection, rollups
2. API contract tests
3. Dashboard smoke checks
4. End-to-end signal path validation
5. Performance checks for summary route scalability
