# User Preference Persistence Findings

- Added `UserPreference` service at `packages/opencode-model-router-x/src/user-preference.js`.
- Preference storage path: `~/.opencode/model-preference.json` via `os.homedir()`.
- Fail-open behavior implemented for both read and write paths:
  - Missing/corrupt JSON returns `null` from `load()`.
  - Save failures are logged and return `false` without throwing.
- Atomic write behavior implemented:
  - `mkdir(..., { recursive: true })` ensures `~/.opencode/` exists.
  - Writes JSON payload to temp file then `rename()` to final path.
  - Payload includes `modelId`, `timestamp`, and `version`.

## Router Integration

- `ModelRouter` now initializes `UserPreference` on startup and begins async preference load.
- Added user-preference fallback in `route()` after sticky session lookup:
  1. sticky session model
  2. user preference model (`reason: sticky:user-preference`)
  3. existing exploration/category/scoring paths
- User preference persistence now runs only on explicit selection paths (`persistModelSelection`), not sticky-session reuse.
- Writes are deduplicated in-memory (`_userPreferredModelId`) to avoid rewriting unchanged preferences each request.

## Orchestrator Integration

- `Orchestrator` constructor now accepts `userPreference`.
- Added fallback preference check before strategy loop (`sticky:user-preference`).
- Added non-blocking preference save after successful strategy selection.
