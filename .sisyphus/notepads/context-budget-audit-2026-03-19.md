# Context Budget Audit - 2026-03-19 (Wave 11 / Prompt 3)

## Scope
- Audit-only pass over Wave 11 context budget architecture: Context Governor -> ContextBridge -> Distill telemetry -> AlertManager -> Dashboard.
- Runtime checks used: memory-graph activation MCP, context-governor MCP (`listBudgetSessions`, `getModelBudgets`, `getContextBudgetStatus`), distill tool inventory.
- Evidence sources: `packages/opencode-context-governor/`, `packages/opencode-integration-layer/src/context-bridge.js`, `packages/opencode-model-manager/src/monitoring/`, `packages/opencode-dashboard/src/app/observability/page.tsx`, and runtime artifacts under `C:\Users\jack\.opencode`.

## 1) Governor State Check
- Memory graph activation status (required check):
  - `active: true`
  - `sessions_tracked: 24`
  - `last_backfill: 2026-03-16T16:49:12.593Z`
  - Source: `opencode-memory-graph_getMemoryGraphActivationStatus`.
- Context governor runtime MCP state:
  - Sessions returned by `listBudgetSessions`: `ses_init`, `ses_urgency_test`
  - Both currently `status: ok` in MCP runtime state.

## 2) Budget Session Inventory (Tracked Sessions + Per-Model Usage)

### A. Context Governor MCP Inventory (in-memory)

| Session | Model | Used | Max | Pct | Status |
|---|---|---:|---:|---:|---|
| `ses_init` | `anthropic/claude-sonnet-4-6` | 1 | 100000 | 0.00% | ok |
| `ses_urgency_test` | `anthropic/claude-opus-4-6` | 0 | 180000 | 0.00% | ok |

Notes:
- `anthropic/claude-sonnet-4-6` is not in `budgets.json`, so default max (`100000`) is used.
- Evidence: `packages/opencode-context-governor/src/budgets.json`, `packages/opencode-context-governor/src/session-tracker.js`.

### B. File-Backed Session Budget Inventory (`~/.opencode/tool-usage/sessions/*-budget.json`)

- Total budget files: **935**
- Status distribution (derived from `estimated_tokens / model_limit`):
  - `ok`: 754
  - `warn` (>=75% <80%): 12
  - `error` (>=80% <100%): 25
  - `exceeded` (>=100%): 144
- Threshold crossing counts:
  - >=65%: 200
  - >=75%: 181
  - >=80%: 169
  - >=95%: 147
- Model metadata quality:
  - `model_id = unknown`: 933/935
  - `provider = unknown`: 935/935
  - `model_limit = 200000`: 935/935

Interpretation:
- Runtime MCP inventory and file-backed inventory are materially divergent (2 sessions vs 935 session files).

## 3) Threshold Verification (75% WARNING, 80% CRITICAL, 95% Emergency)

### Verified in code
- Governor warn/error thresholds are model-configured at 0.75 / 0.80:
  - `packages/opencode-context-governor/src/budgets.json`
  - `packages/opencode-context-governor/src/index.js`
- ContextBridge proactive compression threshold at 0.65 and urgent at 0.80:
  - `packages/opencode-integration-layer/src/context-bridge.js`
- AlertManager budget thresholds:
  - >=0.75 -> WARN
  - >=0.80 -> WARNING
  - >=0.95 -> CRITICAL
  - `packages/opencode-model-manager/src/monitoring/alert-manager.js`

### Result
- **75/80/95 constants exist and are implemented.**
- **Semantic mismatch**: docs and Governor treat 80% as critical/error, but AlertManager keeps 80% budget alerts at `warning` severity until 95%.

## 4) ContextBridge Advice Cache Status
- `ContextBridge` itself has **no advice cache**; it computes advisory actions from current budget and returns `none` / `compress` / `compress_urgent`.
  - Source: `packages/opencode-integration-layer/src/context-bridge.js`
- Wave 11 advice cache exists in `LearningEngine`:
  - `_adviceCache` with TTL 300000 ms (5 min), max 500 entries
  - Source: `packages/opencode-learning-engine/src/index.js`
- No dedicated observability endpoint currently exposes advice-cache occupancy/hit-rate.

## 5) Distill Compression Event History
- Distill MCP availability verified:
  - Categories present: `compress`, `analyze`, `logs`, `code`, `pipeline`
  - No built-in distill MCP tool discovered for global compression stats export.
- File-backed budget history (`*-budget.json`):
  - Sessions with distill events: 8
  - Total distill events: 252
  - Event metric quality: 252/252 have `tokens_before = null`, `tokens_after = null`, `ratio = null`
  - Example: `C:\Users\jack\.opencode\tool-usage\sessions\ses_3067b41a8ffevZ6ZasdbPikI7e-budget.json`
- Metrics collector history file (`C:\Users\jack\.opencode\metrics-history.db.events.json`) currently contains only `context7` events, no `compression` entries.

## 6) AlertManager Alert History for `BUDGET_THRESHOLD`
- `AlertManager` supports `evaluateBudget()` and in-memory `getAlertHistory()`.
  - Source: `packages/opencode-model-manager/src/monitoring/alert-manager.js`
- No durable persisted budget alert history was found in `~/.opencode` artifacts.
- Dashboard monitoring route can return alert history, but current route usage evaluates generic pipeline alerts (`evaluate`) and does not directly feed budget statuses through `evaluateBudget`.
  - Source: `packages/opencode-dashboard/src/app/api/monitoring/route.ts`

## 7) Dashboard Widget Verification (Context Budget Panel)
- Context Budget panel exists and is wired in UI:
  - `packages/opencode-dashboard/src/app/observability/page.tsx`
  - Fetches `/api/budget`, `/api/compression`, `/api/context7-stats`
  - Renders session budget bars, compression stats, and Context7 lookup stats.
- Conditional rendering behavior:
  - Panel only renders when at least one of `budgets`, `compression`, or `context7Stats` is non-empty.

## 8) Budget Leaks / Anomalies Detected
1. **Session budget accumulation leak pattern** in file-backed budgets:
   - 144/935 sessions are already above 100% and remain in inventory.
   - Many sessions show extreme overages (multi-thousand percent), indicating no lifecycle reset/archival from this view.
2. **Runtime-vs-persisted governor divergence**:
   - `C:\Users\jack\.opencode\session-budgets.json` contains `ses_urgency_test` with 180000 tokens on Opus, but MCP runtime reports 0 used for that session/model.
3. **Model attribution leak in budget artifacts**:
   - 933/935 files have `model_id: unknown`; 935/935 have `provider: unknown`.
   - This blocks per-model policy accuracy and undermines budget-aware routing analytics.
4. **Threshold warning gaps in budget files**:
   - 11 sessions are >=75% but missing corresponding >=75 warning marker in `warnings_emitted`.

## 9) Severity-Ranked Findings (A/B/C)

| Severity | Finding | Evidence | Risk |
|---|---|---|---|
| **A** | File-backed budget sessions accumulate into permanent overflow without cleanup/rotation in observed inventory (144 exceeded; extreme overages) | `~/.opencode/tool-usage/sessions/*-budget.json` aggregate | High risk of stale/poisoned budget signals and ineffective guardrails |
| **A** | Governor runtime state diverges from persisted state (`session-budgets.json` not reflected in MCP runtime) | MCP `getContextBudgetStatus` vs `C:\Users\jack\.opencode\session-budgets.json` | High risk of false-safe budget checks after restart/runtime drift |
| **B** | 80% threshold semantics mismatch across components (Governor error/critical vs AlertManager warning until 95%) | `packages/opencode-context-governor/src/index.js`, `packages/opencode-model-manager/src/monitoring/alert-manager.js` | Alerting under-severity near critical budget windows |
| **B** | Budget artifact metadata mostly `unknown` model/provider (933/935, 935/935) | `~/.opencode/tool-usage/sessions/*-budget.json` | Distorts per-model governance and model-penalty accuracy |
| **C** | Distill events logged without before/after/ratio metrics (252/252 nulls) | Budget files with `distill_events` | Compression effectiveness cannot be audited quantitatively |
| **C** | Budget alert history not durably persisted and not directly surfaced as budget-specific stream in dashboard route | `packages/opencode-model-manager/src/monitoring/alert-manager.js`, `packages/opencode-dashboard/src/app/api/monitoring/route.ts` | Reduced post-incident traceability |
| **C** | ContextBridge has no internal advice-cache observability; LearningEngine cache exists but no exposure endpoint | `packages/opencode-integration-layer/src/context-bridge.js`, `packages/opencode-learning-engine/src/index.js` | Limited diagnosis of cache effectiveness / staleness |

## 10) Remediation Steps Per Issue

### A1 - Session overflow accumulation in file-backed budget inventory
1. Add retention/archival policy for `*-budget.json` (time-based + terminal-state pruning).
2. Add periodic cleanup task aligned with governor stale-session cleanup cadence.
3. Add dashboard/API filter for active vs archived sessions to prevent stale signal dominance.

### A2 - Governor runtime vs persisted-state divergence
1. Add startup self-check in governor MCP: load persisted file, then emit loaded session/model counts.
2. Add integrity assertion endpoint: compare in-memory sessions against `session-budgets.json` hash + count.
3. Add fail-open warning log when persisted state exists but hydration yields empty/partial sessions.

### B1 - 80% semantics mismatch
1. Standardize budget severity contract across Governor, AlertManager, and docs.
2. If 80% is intended critical, raise AlertManager 80% alerts to CRITICAL severity (or explicitly document dual-level behavior).
3. Add unit test to enforce threshold/severity parity across components.

### B2 - Unknown model/provider attribution
1. Ensure budget writer always persists canonical `model_id` and `provider` from runtime context.
2. Reject writes with missing model/provider unless explicit fallback reason is stored.
3. Backfill recent sessions where model/provider can be derived from invocation context.

### C1 - Distill metric null fields
1. Populate `tokens_before`, `tokens_after`, and `ratio` for each distill event.
2. Wire distill telemetry into `PipelineMetricsCollector.recordCompression()` with real values.
3. Add validation check: compression event with null token metrics triggers warning.

### C2 - Budget alert history persistence/observability
1. Persist `BUDGET_THRESHOLD` alerts to file or SQLite with retention window.
2. Add dedicated `/api/budget-alerts` endpoint (active + history + resolution timeline).
3. Include budget-alert trend card in observability page.

### C3 - Advice-cache status visibility
1. Add read-only metrics endpoint for LearningEngine advice cache (size, hit rate, evictions, TTL).
2. Surface cache stats in observability panel near Context Budget.
3. Add stale-cache alarm when hit-rate collapses and evictions spike.

---

## Audit Verdict
- Prompt 3 checks were executed and evidence collected.
- Wave 11 architecture is present, but budget-state coherence and observability integrity have high-signal gaps (especially A-tier drift/overflow patterns).
- No configuration files were modified (audit-only).
