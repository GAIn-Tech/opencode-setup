# Prompt 5 Audit - Full Observability Check (Wave 11)

Date: 2026-03-19
Scope: `packages/opencode-model-manager/src/monitoring/*`, `packages/opencode-dashboard/src/app/observability/page.tsx`, monitoring API routes, IntegrationLayer metric emission wiring, Context Governor MCP budget status.

## Executive verdict

Observability foundations exist (metrics collector, alert manager, dashboard, API surface), but critical runtime instrumentation gaps remain for core pipeline metrics (discovery/cache/transitions/PR), and key signals (alerts + transitions) are not surfaced in the dashboard. Compression and Context7 have partial runtime emission and persisted event history fallback.

---

## 1) Metrics Collector status

Source: `packages/opencode-model-manager/src/monitoring/metrics-collector.js`

Tracked metric families:

1. Discovery metrics per provider (`recordDiscovery`, `getDiscoveryRates`)
2. Cache metrics L1/L2 hit/miss (`recordCacheAccess`, `getCacheRates`)
3. Lifecycle transitions (`recordTransition`, `getTransitionCounts`)
4. PR creation metrics (`recordPRCreation`, `getPRRates`)
5. Time-to-approval (`getTimeToApproval` using detected->selectable transitions)
6. Catalog freshness (`markCatalogUpdated`, `getCatalogFreshness`)
7. Compression metrics (`recordCompression`, `getCompressionStats`, by pipeline)
8. Context7 lookup metrics (`recordContext7Lookup`, `getContext7Stats`)
9. Error trend analysis from `~/.opencode/tool-usage/invocations.json` (`getErrorTrends`)
10. Skill selection metrics (`recordSkillSelection`, `getSkillSelectionStats`)

Persistence behavior:

- Daily summaries: SQLite table `daily_metrics` (if DB available)
- Compression + Context7: SQLite tables (`compression_history`, `context7_lookups`) plus file fallback `~/.opencode/metrics-history.db.events.json`
- Discovery/cache/transitions/PR/time-to-approval: in-memory only (except daily summary rollup when explicitly flushed)

Observed collection recency (local environment):

- Context Governor MCP budget sessions: present (`ses_init`, model `anthropic/claude-sonnet-4-6`, status `ok`)
- Event history file `~/.opencode/metrics-history.db.events.json`: 5 events total, all `context7`; latest `2026-03-19T06:39:29.632Z`
- SQLite metrics DB file exists (`~/.opencode/metrics-history.db`) but no metric tables populated in current local state

Assessment:

- Collector implementation is broad and sound.
- Runtime feed coverage is uneven; several defined metrics have no direct production emitters in this repo path.

---

## 2) AlertManager state

Source: `packages/opencode-model-manager/src/monitoring/alert-manager.js`

Alert types and threshold logic:

- `provider_failure`: warning at >= configured consecutive failure threshold (default 3), critical at 2x threshold
- `stale_catalog`: warning when stale (>24h), critical when >48h or never updated
- `pr_failures`: warning at >=2 failures/window, critical at 2x threshold
- `budget_threshold`:
  - warn at >=75%
  - warning at >=80%
  - critical at >=95%

State model:

- Active alerts in-memory map
- Bounded history in-memory FIFO (`maxHistorySize`, default 1000)
- Suppression support by alert type

Resolve behavior verification:

- Auto-resolve implemented when condition drops below threshold for provider/stale/pr/budget alerts
- Manual resolve supported via `resolveAlert(alertId)`

Gaps:

- Alert state/history are process-memory only (no durable persistence)
- Dashboard UI does not render active alerts/history despite API support

---

## 3) Dashboard observability panels

Source: `packages/opencode-dashboard/src/app/observability/page.tsx`

Present widgets/panels:

- Top status cards: Meta-KB Health, Catalog Freshness, PR Creation
- Context Budget panel with color-coded bars (`>=80 red`, `>=75 amber`, else green)
- Distill Compression card (events/tokens saved/avg ratio)
- Context7 Lookups card (total/resolved/rate)
- Discovery Rates by provider
- Cache Performance (L1/L2)
- Tool Usage / Delegation / Error Trends / Model Selection / Package Execution

Missing vs available backend data:

- No dashboard rendering for transition counts (`monitoring.transitions`)
- No dashboard rendering for time-to-approval (`monitoring.timeToApproval`)
- No dashboard rendering for alert state (`alerts.active`, `alerts.summary`, `alerts.history`)

Data freshness behavior:

- Client polling every 30s; header shows client-side "Last refresh" only
- Most cards do not show source timestamps; stale-source detection is weak except catalog freshness

---

## 4) Model monitoring coverage (discovery/cache/transitions)

Required Wave 11 signals exist in collector API, but emission verification shows gaps:

- `recordDiscovery`: no production callsite found outside tests/type defs and monitoring ingestion route
- `recordCacheAccess`: no production callsite found outside tests/type defs and monitoring ingestion route
- `recordTransition`: no production callsite found outside tests/type defs and monitoring ingestion route
- `recordPRCreation`: emitted via monitoring ingestion route (`POST /api/monitoring`), but no direct instrumentation in model-manager discovery/lifecycle/PR flow found in scan

Interpretation:

- Discovery/cache/transition/PR signals are currently dependent on external ingestion into `/api/monitoring`, not directly wired from model-manager runtime paths in this repo.

---

## 5) PR creation rate tracking

Status:

- Metric defined and aggregatable (`recordPRCreation`, `getPRRates`)
- Exposed on dashboard status card (PR Creation % + total)
- Ingestion endpoint supports `type: 'pr'`

Gap:

- No confirmed first-party runtime emitter from PR generation workflow into collector in current code scan.

---

## 6) Compression metrics

Status:

- Collector supports event recording, aggregation by pipeline, token savings, avg ratio, avg duration
- IntegrationLayer records compression advisory events (`distill-advisory` / `distill-urgent`) when compression is active
- Dashboard has dedicated compression card

Observed local data:

- No compression events persisted in local metrics history snapshot reviewed

Nuance:

- IntegrationLayer records estimated token-after values (approximate), not measured post-compression token counts.

---

## 7) Context7 lookup stats

Status:

- Collector supports Context7 lookup recording and stats
- IntegrationLayer records Context7-related tool usage into metrics
- Dashboard has dedicated Context7 card

Observed local data:

- 5 persisted Context7 events in event history, latest `2026-03-19T06:39:29.632Z`

Quality note:

- Current emission records `resolved: true` for detected Context7 tool invocations in IntegrationLayer path; may overestimate true resolution quality unless upstream failures are also emitted.

---

## 8) Orphaned / partial observability signals

Orphaned (defined but effectively unsurfaced):

1. Skill selection stats:
   - Emitted (`recordSkillSelection`) in IntegrationLayer
   - Getter exists (`getSkillSelectionStats`)
   - Not included in `getSnapshot()`
   - No API route and no dashboard panel

2. Alert details:
   - Available via monitoring API section `alerts`
   - Not displayed in observability dashboard

3. Transition/time-to-approval:
   - Included in snapshot types and backend snapshot
   - Not rendered in dashboard UI

---

## 9) Severity-ranked findings

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| F1 | A | Critical pipeline metrics (discovery/cache/transitions/PR) are not directly emitted from core runtime paths; observability depends on external POST ingestion. | `packages/opencode-model-manager/src/monitoring/metrics-collector.js`, `packages/opencode-dashboard/src/app/api/monitoring/route.ts`, no runtime callsites found for `recordDiscovery/recordCacheAccess/recordTransition/recordPRCreation` beyond tests/types/ingest route. |
| F2 | A | State transition observability is effectively missing in UI despite being a core Wave 11 signal. | `packages/opencode-dashboard/src/app/observability/page.tsx` lacks rendering for `monitoring.transitions` and `monitoring.timeToApproval`. |
| F3 | B | Alert visibility gap: alert engine exists and evaluates, but active/history alerts are not surfaced in dashboard. | `packages/opencode-model-manager/src/monitoring/alert-manager.js` + monitoring API supports alerts; page has no alert panel. |
| F4 | B | Metrics durability is partial: many metrics are in-memory and may reset across process restarts; local SQLite tables currently unpopulated. | Collector persistence design in `metrics-collector.js`; local `~/.opencode/metrics-history.db` had no metric tables populated in observed environment. |
| F5 | C | Skill selection metric is orphaned (emitted + queryable in class, but absent from snapshot/API/UI). | `recordSkillSelection/getSkillSelectionStats` in collector + emission in IntegrationLayer; no route/UI usage found. |
| F6 | C | Data freshness UX is limited to client refresh time; most panels do not expose source-update timestamps. | `packages/opencode-dashboard/src/app/observability/page.tsx` shows `lastRefresh` only. |

---

## 10) Remediation steps (per issue)

### F1 (A) - Missing direct emission for core metrics
1. Add first-party instrumentation in model-manager and integration-layer runtime paths (discovery engine, cache layer, lifecycle transitions, PR generator) to call collector methods directly.
2. Keep `/api/monitoring` POST for external ingestion, but treat it as supplementary.
3. Add integration tests that execute real discovery/cache/transition/PR paths and assert non-zero snapshot counters.

### F2 (A) - Transition observability missing in dashboard
1. Add "Lifecycle Transitions" panel using `monitoring.transitions`.
2. Add "Time to Approval" panel using `monitoring.timeToApproval`.
3. Include threshold coloring and sparkline/trend if available.

### F3 (B) - Alerts not surfaced
1. Add "Active Alerts" panel (severity/type/message/firedAt).
2. Add "Recent Alert History" panel from `/api/monitoring?section=alerts`.
3. Display auto-resolve status transitions to validate alert lifecycle behavior.

### F4 (B) - Persistence/freshness robustness
1. Verify SQLite initialization and table creation during dashboard startup path.
2. Ensure periodic `flushDailySummary()` is actually invoked in production runtime.
3. Add health check endpoint asserting metrics store readiness (DB and/or fallback file).

### F5 (C) - Skill selection orphaned signal
1. Add `skillSelection` into `getSnapshot()` or provide dedicated API endpoint.
2. Add compact dashboard card (events, unique skills, avg skills/event, by task type).

### F6 (C) - Freshness metadata UX
1. Add per-panel `sourceTimestamp` / `age` rendering where available.
2. Expose collector `timestamp` and route read-time for each endpoint payload.

---

## Compliance checklist vs requested outcome

- [x] Metrics Collector status + tracked metrics + collection recency
- [x] AlertManager state + resolve behavior
- [x] Dashboard widget verification + freshness behavior
- [x] Model monitoring signal verification (discovery/cache/transitions)
- [x] PR creation rate tracking status
- [x] Compression metrics status
- [x] Context7 stats status
- [x] Observability gaps identified
- [x] Severity-ranked findings (A/B/C)
- [x] Remediation per issue
