# Learnings - Model Management Protocol

## [2026-02-24T10:20:00Z] Session Start
### Context
- 23/45 tasks complete (51%)
- Waves 1-7 complete, Wave 8 partial
- 253 tests passing, 0 failures
- All commits include learning updates

### Key Patterns Established
1. **Provider Adapters**: Base adapter with retry/circuit-breaker, provider-specific implementations
2. **Normalization**: All providers → unified schema with capabilities object
3. **Caching**: L1 (5min in-memory) + L2 (1hr persistent) with stale-while-revalidate
4. **Lifecycle**: 5-state machine (detected → assessed → approved → selectable → default)
5. **Audit**: Hash chain with SHA-256 for tamper-evident logging
6. **Risk Scoring**: 0-50 auto-approve, 50-80 manual, >80 block

### Technical Decisions
- SQLite for persistence (snapshots, audit, assessments)
- Real benchmarks (HumanEval, MBPP, latency) - not simulated
- Validation gates: structure, schema, duplicates, required fields
- PR automation with risk assessment
- Weekly CI workflow with manual dispatch

### Antigravity Requirement
- **CRITICAL**: Subagents MUST use Antigravity provider for Gemini models
- Regular google/gemini-* models cause stalls due to account rotation
- Pattern: `antigravity-gemini-3-flash` not `gemini-3-flash`

## [2026-02-24] Wave 8.2: Rollback System

### Implementation
- Created `scripts/model-rollback.mjs` — standalone CLI for catalog rollback
- Three modes: `--to-last-good`, `--to-timestamp <ISO>`, `--dry-run`
- Integrates with real SnapshotStore (JSON file) and AuditLogger (SQLite) via `createRequire()`
- Uses `scripts/resolve-root.mjs` for portable root resolution (same as validate-models.mjs)
- Calls `scripts/validate-models.mjs` post-rollback via `execSync` with 5-min timeout

### Key Design Decisions
- **CJS from ESM**: Used `createRequire(import.meta.url)` to load CJS modules (audit-logger, snapshot-store) from ESM script
- **Numeric timestamps**: AuditLogger and SnapshotStore both use epoch-ms internally, not ISO strings. Conversion happens at the CLI boundary.
- **Provider-aware snapshots**: SnapshotStore.getByTimeRange requires a provider string. Script discovers providers from snapshots.json, queries each.
- **Catalog format preservation**: catalog-2026.json uses `{ "provider/id": {...} }` keyed object, not an array. Restore preserves this format.
- **Graceful degradation**: Script works even if SnapshotStore/AuditLogger fail to load — falls back to direct JSON file reading.
- **Exit codes**: 0=success, 1=fatal/argument error, 2=rollback succeeded but validation failed

### Gotchas Discovered
- SnapshotStore default `storagePath` is `./snapshots` relative to CWD, not the package dir. Must pass explicit path.
- AuditLogger default `dbPath` is `./audit.db` relative to CWD. Must pass explicit path.
- AuditLogger.log() requires all fields as non-empty strings (modelId, fromState, toState, actor, reason, diffHash). Used 'catalog-rollback' as synthetic modelId for whole-catalog rollback.
- Snapshot store saves ALL snapshots in single `snapshots.json` file with `{ snapshots: [...] }` wrapper

## [2026-02-24] Wave 8.1: Monitoring Dashboard

### Implementation
- Created `packages/opencode-model-manager/src/monitoring/metrics-collector.js` — PipelineMetricsCollector for operational health
- Created `packages/opencode-model-manager/src/monitoring/alert-manager.js` — AlertManager with threshold-based alerting
- Created `packages/opencode-dashboard/src/app/api/monitoring/route.ts` — GET/POST API endpoint

### Architecture: Two Distinct Metrics Systems
- **Existing** `src/metrics/metrics-collector.js`: 4-pillar model quality metrics (accuracy, latency, cost, robustness) — SQLite backed
- **New** `src/monitoring/metrics-collector.js`: Pipeline operational health metrics — in-memory, ephemeral
- Chose in-memory over SQLite for monitoring: operational metrics are ephemeral, low overhead, auto-cleanup. Model quality metrics need historical persistence; operational metrics need fast read/write with automatic expiry.

### Metrics Tracked
1. **Discovery success rate by provider**: per-provider total/success/failure/rate + consecutive failures
2. **Cache hit/miss rates**: L1 and L2 separately with hit rate calculation
3. **State transition counts**: aggregated by transition type (e.g. `detected->assessed`)
4. **PR creation rate**: success/failure counts and rate
5. **Time to approval**: avg/min/max milliseconds from `detected` to `selectable`
6. **Catalog freshness**: last update timestamp, age, stale boolean

### Alert Thresholds
- Provider failures: >3 consecutive → WARNING, >6 → CRITICAL (auto-resolves on success)
- Stale catalog: >24h since last update → WARNING, never updated or >48h → CRITICAL
- Failed PRs: >2 in 24h → WARNING, >4 → CRITICAL

### Alert Features
- EventEmitter: `alert:fired` and `alert:resolved` events
- Auto-resolve: alerts clear when condition recovers (e.g. provider succeeds)
- Suppression: suppress/unsuppress by alert type
- Deduplication: same alert ID not fired twice while active

### Dashboard API
- `GET /api/monitoring` — JSON snapshot (default) or Prometheus text format (`?format=prometheus`)
- `GET /api/monitoring?section=discovery` — filter by section
- `POST /api/monitoring` — ingest metrics from external sources (CI, discovery runs)
- Singleton pattern for collector/alertManager across requests

### Key Design Decisions
- Prometheus format: text exposition format compatible with standard Prometheus scraping
- Cleanup timer with `unref()` to avoid blocking process exit
- PipelineMetricsCollector.toPrometheus() includes all 6 providers even with no events (Prometheus expects consistent label sets)
- AlertManager uses Map for active alerts keyed by composite ID (e.g. `provider_failure:openai`)

### Test Stats
- 67 new tests (pipeline-metrics-collector.test.ts + alert-manager.test.ts)
- 320 total tests passing across 22 files, 0 failures
- Tests use controlled `nowFn` for deterministic time-based assertions
- Alert tests must seed fresh catalog to isolate from stale_catalog alert cross-contamination


## [2026-02-24] Wave 8.3: Documentation

### Files Created
- docs/model-management/ARCHITECTURE.md - System architecture with Mermaid diagrams
- docs/model-management/API-REFERENCE.md - Complete API documentation
- docs/model-management/OPERATIONS.md - Operational procedures and runbooks
- docs/model-management/TROUBLESHOOTING.md - Common issues and solutions

### Content Coverage
**ARCHITECTURE.md:**
- System overview and capabilities
- Component diagrams (Mermaid)
- Data flow sequences (Mermaid)
- Lifecycle state machine (Mermaid)
- Risk scoring flowchart (Mermaid)
- Caching strategy diagram (Mermaid)
- Technology stack and storage strategy
- Performance characteristics
- Deployment architecture

**API-REFERENCE.md:**
- Provider adapter interface
- Discovery engine API
- Cache layer API
- Snapshot store API
- Diff engine API
- Model assessor API
- Lifecycle state machine API
- Audit logger API
- Auto-approval rules API
- PR generator API
- Catalog validator API
- Pipeline metrics collector API
- Alert manager API
- Monitoring API endpoints

**OPERATIONS.md:**
- Manual discovery procedures
- Model approval/rejection workflows
- Catalog rollback procedures
- Health check commands
- Monitoring queries
- CI/CD operations
- Emergency procedures
- Routine maintenance tasks
- Best practices

**TROUBLESHOOTING.md:**
- Discovery failures (auth, rate limits, timeouts, circuit breaker)
- Validation errors (schema, duplicates, forbidden patterns)
- State transition errors (invalid transitions, missing data)
- PR creation failures (auth, branch conflicts, merge conflicts)
- Cache issues (corruption, low hit rates)
- Database problems (locks, corruption)
- CI/CD issues (workflow failures, secrets)
- Performance problems (slow discovery, high memory)
- Diagnostic collection procedures



## [2026-02-24] Wave 6.2: Lifecycle UI Components

### Files Created
- packages/opencode-dashboard/src/components/lifecycle/LifecycleBadge.tsx - Color-coded state badges
- packages/opencode-dashboard/src/components/lifecycle/StateTransitionModal.tsx - State transition workflow
- packages/opencode-dashboard/src/components/lifecycle/AuditLogViewer.tsx - Timeline audit log viewer
- packages/opencode-dashboard/src/components/lifecycle/index.ts - Barrel export

### Integration
- Updated packages/opencode-dashboard/src/app/models/page.tsx:
  - Added lifecycle state fetching for all models
  - Integrated LifecycleBadge display in model list
  - Added 'Manage' and 'Audit' buttons for each model
  - Connected StateTransitionModal for state transitions
  - Connected AuditLogViewer for audit history
  - Auto-refresh data after successful transitions

### Component Features
**LifecycleBadge:**
- Color-coded by state (detected=gray, assessed=blue, approved=green, selectable=teal, default=purple)
- Animated pulse indicator
- Clickable with keyboard support
- Accessible ARIA labels

**StateTransitionModal:**
- Shows current state with badge
- Lists valid transitions based on state machine rules
- Visual transition preview (from → to badges)
- Actor and reason input fields
- Confirmation workflow
- Success/error feedback
- Auto-refresh on completion

**AuditLogViewer:**
- Timeline layout with visual line
- Timestamp (absolute + relative)
- Actor, reason, diff hash display
- Pagination (50/100/200 entries)
- Loading and error states
- Responsive design

### Design Patterns
- Dark theme consistent with dashboard
- Tailwind CSS for styling
- Lucide React icons
- Modal overlays with backdrop blur
- Hover states and transitions
- Keyboard navigation support
- Mobile-responsive layouts

