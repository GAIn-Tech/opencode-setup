# Task 4 — Sticky session cleanup + configuration

## Summary

- Added routing configuration in `opencode-config/opencode.json`:
  - `routing.stickySessions: true`
  - `routing.stickySessionTTL: 24`
- Updated `packages/opencode-model-router-x/src/index.js` to:
  - read sticky-session enable/disable and TTL from `this.config.routing`
  - schedule sticky-session cleanup every hour (`setInterval`, unref'd)
  - skip sticky persistence/lookup logic when `stickySessions` is disabled
  - expose manual cleanup method: `cleanupStickySessions(ttlHours)`
  - expose cleanup interval shutdown: `shutdown()`
- Updated `packages/opencode-model-router-x/src/session-model-registry.js` cleanup return handling to normalize `result.changes` via `Number(...)` before returning deleted count.

## Behavior changes

1. **Config defaults are enforced in router**
   - Sticky enabled unless `routing.stickySessions === false`
   - Sticky TTL defaults to `24` hours when config is missing/invalid

2. **Scheduled cleanup added**
   - Router starts an hourly cleanup interval on construction
   - Interval exits early if sticky sessions are disabled
   - Cleanup errors are fail-open and logged via `_logWarn`

3. **Sticky logic now respects configuration**
   - `route()` computes `stickyEnabled` once
   - Sticky read path and sticky persistence helper are both gated by `stickyEnabled`

4. **Manual cleanup exposed**
   - `cleanupStickySessions(ttlHours)` returns deleted-row count
   - Uses provided TTL or configured/default TTL
   - Returns `0` when sticky is disabled, registry unavailable, or cleanup throws

## Verification snapshot

- `lsp_diagnostics` for `packages/opencode-model-router-x/src/index.js`:
  - Failed in environment: `typescript-language-server` not found.
- `lsp_diagnostics` for `opencode-config/opencode.json`:
  - Failed in environment: Bun/LSP metadata startup issue (`could not find bin metadata file`).
- `bun test packages/opencode-model-router-x/`:
  - Suite is currently red due to existing unrelated failure:
    - `critical-fixes.test.js` Test 7: duplicate `learnFromOutcome` definitions (2 found, expected 1).
  - No new sticky-session specific test failure surfaced from this task's changes.
