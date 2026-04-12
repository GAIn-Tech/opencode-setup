# Learnings
## [TIMESTAMP] Initial Setup
- Plan initialized.
- Wave 1 focus: Unified Event Bus.
- Verification strategy: Shadow Mode.

## [2026-04-08T03:37:00Z] Wave 2 - Predictive Budgeting Repair
- Repaired `token-budget-manager.js` after malformed and duplicate method fragments from failed edits.
- Implemented stable predictive velocity tracking and shadow-mode prediction logging (`[PREDICTION]`).
- Added focused regression coverage: `test/token-budget-manager.test.js`.
- Verification passed with Bun test (4 passing assertions, no failures).

## [2026-04-08T04:05:00Z] Wave 2 - Predictive Systems Completed
- Retry Manager: added repeated-failure pattern prediction with advisory/block policy modes and shadow logs.
- Monitoring Collector: added discovery failure-trend prediction events, snapshot exposure (`predictions.discoveryAlerts`), and bounded retention/reset behavior.
- Lifecycle State Machine: added advisory predictive performance weighting metadata (`predictive_performance_v1`) in transition metadata.
- Pattern Extractor: added confidence scoring to anti/positive/cross-session patterns as additive metadata.
- Verification suite passed across router/model-manager/learning-engine predictive tests.

## [2026-04-08T04:25:00Z] Predictive Advisory End-to-End
- AlertManager now consumes `snapshot.predictions.discoveryAlerts` and emits advisory `predicted_provider_failure` alerts.
- Dashboard observability page now renders a new "Predictive Discovery Alerts" section with provider-level trend signals.
- Fixed unrelated dashboard build blockers encountered during verification:
  - duplicate `const op` declaration in orchestration API route,
  - fail-open fallback for missing `opencode-plugin-lifecycle` import,
  - corrected `meta-kb-reader` invalid top-level `static` declarations while preserving static API compatibility.
- Dashboard build now completes successfully; targeted dashboard + Meta-KB tests pass.

## [2026-04-08T05:15:00Z] Warning-Hardening Stabilization
- Converted optional workspace dependencies to resolvable local paths/fail-open loading where appropriate (`event-bus`, `plugin-lifecycle`, context utils).
- Simplified dashboard memory-graph route to use internal graph extraction only, eliminating transitive package-resolution warnings in dashboard builds.
- Updated metrics collector optional SQLite fallback loading to avoid static bundler dependency resolution while preserving runtime fallback chain.
- Result: dashboard build remains green with only pre-existing critical dependency expression warnings in orchestration/meta-awareness paths.
