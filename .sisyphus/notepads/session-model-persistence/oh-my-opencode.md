# oh-my-opencode model preference persistence

## What was implemented

- Added `src/shared/user-preference.ts` with `UserPreference.load()` and `UserPreference.save()`.
- Preference file path resolves from `getConfigDir()` in `src/cli/config-manager/config-context.ts`.
- Preference is stored as `model-preference.json` in the OpenCode config directory.
- File write is atomic (`.tmp` write then `rename`).
- Preference payload includes:
  - `modelId`
  - `timestamp` (ISO-8601)
  - `version` (`1.0`)
- Load/save failures fail open (no crash in resolution path).

## Pipeline integration

- Updated `src/shared/model-resolution-pipeline.ts`.
- Added priority **1.5** preference check after UI selection and before user config override.
- Resolution order is now:
  1. UI selected model
  2. Persisted user preference (**new**)
  3. User config override
  4. Category default
  5. User fallback models
  6. Hardcoded fallback chain
  7. System default
- On every successful resolution, resolved model is persisted via `UserPreference.save()`.
- Preference check uses availability/provider logic and falls through cleanly when stale.

## Additional updates

- Exported `user-preference` from `src/shared/index.ts`.
- Added test isolation mocks for `./user-preference` in:
  - `src/shared/model-resolution-pipeline.test.ts`
  - `src/shared/model-resolver.test.ts`

## Verification run

- `bun test src/shared/model-resolution-pipeline.test.ts src/shared/model-resolver.test.ts` ✅ (51 pass, 0 fail)
- `bun run typecheck` ✅
- `bun run build` ✅
- Cross-process persistence smoke test with isolated `XDG_CONFIG_HOME` ✅
  - First process resolved `openai/gpt-5.4` via UI selection
  - Second process (new shell session) resolved `openai/gpt-5.4` from persisted preference even when `userModel` was `anthropic/claude-opus-4-6`
