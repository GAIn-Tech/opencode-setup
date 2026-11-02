# Health Audit - 2026-03-19

Scope: `packages/`, `opencode-config/`, `scripts/`

Method:
- Code-doctor style fault localization (pattern-driven + targeted file RCA)
- Grep scans for ENOENT spawn risk, empty catch, type suppressions, TODO/FIXME
- Incident-commander severity triage (A/B/C)
- Runbooks pattern matching via `opencode-runbooks`
- Sequential prioritization for top 3 safe remediations
- Architecture sanity pass (surface inventory)

Inventory snapshot:
- `packages/`: 1134 files, 213 dirs
- `opencode-config/`: 557 files, 100 dirs
- `scripts/`: 136 files, 11 dirs

## Findings (triaged)

| Severity | Location | Issue | Remediation | Status |
|---|---|---|---|---|
| A | `scripts/run-package-smokes.mjs:55` | Bun ENOENT crash risk: `spawnSync('bun', ...)` executed without preflight existence check | Added `commandExists()` using `whichSync`; fail fast with explicit error payload when `bun` is missing | fixed |
| B | `scripts/skills-manage.mjs:164` | Forbidden empty catch anti-pattern (`catch (_) {}`) swallowed filesystem scan errors | Replaced with selective ignore for `ENOENT/EACCES/EPERM` and warning log for unexpected failures | fixed |
| C | `packages/opencode-dashboard/test/compression-route.test.ts:14` | Type suppression (`as any`) in route tests | Removed `as any`; pass `Request` directly to handlers | fixed |
| A | `scripts/ci-warning-budget.mjs:76` | `spawnSync('bun', ['test'])` still executes without preflight; handles ENOENT only after spawn attempt | Add shared preflight `commandExists('bun')` before spawn (same guard shape as smoke runner) | queued |
| C | `packages/opencode-skill-rl-manager/tests/sync-registry.test.js:100` | Multiple empty catches in cleanup paths (12 occurrences) | Replace with helper that ignores only ENOENT and rethrows/records others | todo |
| C | `scripts/skills-manage.mjs:275` | Template generator intentionally seeds `TODO` placeholders in new skill docs | Keep behavior (authoring scaffold), or gate with `--strict-template` to require non-placeholder content | todo |
| C | `opencode-config/opencode.json:694` | `TODO` token appears inside command-template content (`workflows:resolve-todos`) | Intentional instructional text; no code-path risk | queued |
| C | `opencode-config/opencode-clean.json:723` | Same as above in clean variant config | Intentional instructional text; no code-path risk | queued |

## Pattern scan summary

### ENOENT spawn crash risk
- Spawn callsites found in target scope: dashboard launcher, model assessor, runtime tool surface, smoke/governance scripts.
- Most high-risk runtime paths already include command checks (`commandExists`) or error handlers.
- One high-signal unguarded preflight path fixed (`scripts/run-package-smokes.mjs`).

### Empty catch blocks
- `scripts/`: 1 match (fixed)
- `packages/`: 12 matches in test cleanup (`opencode-skill-rl-manager` test file)
- `opencode-config/`: 0 matches

### Type suppressions
- `packages/`: 2 matches (both fixed in compression route tests)
- `scripts/`: 0
- `opencode-config/`: 0

### TODO/FIXME markers
- `scripts/`: template scaffolding TODOs (intentional, tracked)
- `opencode-config/`: TODO token in workflow template text (intentional)
- `packages/`: none in scanned code files

## Runbooks mapping (`packages/opencode-runbooks`)

Patterns currently available are operational incidents (MCP/auth/rate-limit/permissions/etc.).

Mapping result:
- Spawn ENOENT risk -> no precise rule (closest noisy match: `MCP_NOT_FOUND` due keyword overlap)
- Empty catch anti-pattern -> no match
- Type suppression anti-pattern -> no match

Recommendation:
- Add runbook patterns for static anti-pattern audits:
  - `BUN_ENOENT_SPAWN_GUARD_MISSING`
  - `EMPTY_CATCH_BLOCK`
  - `TYPE_SUPPRESSION_USAGE`

## Top 3 fixes applied

1. `scripts/run-package-smokes.mjs` (Severity A) - added `which`-based preflight guard.
2. `scripts/skills-manage.mjs` (Severity B) - removed silent catch, added selective handling + warning.
3. `packages/opencode-dashboard/test/compression-route.test.ts` (Severity C) - removed `as any` suppressions.

## Verification

- LSP diagnostics clean on changed files:
  - `scripts/run-package-smokes.mjs`
  - `scripts/skills-manage.mjs`
  - `packages/opencode-dashboard/test/compression-route.test.ts`
- Build/tests intentionally not run per audit-only constraint.
