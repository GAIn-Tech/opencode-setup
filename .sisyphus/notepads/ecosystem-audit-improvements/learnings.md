# Ecosystem Plan Learnings

## 2026-04-04 Task 1: Runtime Authority Contract

### Problem Identified
Runtime authority was fragmented across multiple sources:
- `scripts/runtime-tool-telemetry.mjs` had hardcoded `CATEGORY_TO_MODEL` and `AGENT_TO_MODEL` maps
- `opencode-config/oh-my-opencode.json` was the canonical config
- `~/.config/opencode/oh-my-opencode.json` was the runtime config
- These could diverge, causing split-brain behavior

### Solution Implemented
Created `packages/opencode-runtime-authority/` with:
- Single resolver for agent and category model resolution
- Documented precedence chain (env > home > repo > defaults)
- Provenance tracking for every resolution
- Backwards-compatible telemetry maps

### Key Decisions
1. **New package vs existing**: Created new package for clean separation of concerns
2. **Fail-open import**: runtime-tool-telemetry.mjs gracefully falls back to hardcoded defaults if authority resolver is unavailable
3. **CJS module**: Used CommonJS for compatibility with existing runtime-tool-telemetry.mjs

### Patterns to Follow
- Always include provenance in resolution results
- Use fail-open imports with fallbacks for runtime hooks
- Test precedence chain explicitly

### Gotchas
- The `opencode-config-loader` package is for performance/feature config, NOT agent/category resolution
- Environment variable names use underscores and uppercase: `OPENCODE_AGENT_ATLAS_MODEL`
- Hyphenated names like `multimodal-looker` become `MULTIMODAL_LOOKER` in env vars
