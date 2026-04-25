# Code Review Summary: opencode-cli-v2

**Review Date:** 2026-04-16  
**Review Target:** opencode-cli-v2 workspace  
**Status:** Production-ready with improvement opportunities

---

## Executive Summary

**Overall Assessment:** Strong architectural foundation with excellent test coverage (264 tests), but several opportunities for elegance, reliability, and DX improvements.

**Test Status:** ✅ 264 tests passing, 0 failing  
**Files:** ~120 TypeScript source files, ~50 test files  
**Architecture:** Kernel-first with ports/adapters pattern - well designed but needs integration completion

---

## Critical Findings (P1 - Must Fix)

### 1. Kernel Not Wired to CLI Execution Path
**Location:** `src/kernel/index.ts:65-67`  
**Issue:** The `createKernel()` function exists but is never instantiated in the CLI execution path. Commands use script wrappers instead of kernel-backed operations.  
**Impact:** Architecture mismatch - kernel is designed but unused in runtime.  
**Recommendation:** Add composition root in CLI startup that instantiates kernel + providers before command execution.

### 2. Hardcoded Legacy Module Paths
**Location:** Multiple adapter files  
**Issue:** Adapters use hardcoded relative paths to old packages (e.g., `.../packages/opencode-model-router-x/...`). This breaks extraction portability.  
**Files Affected:**
- `src/adapters/packages/model-router.ts:33`
- `src/adapters/packages/sisyphus.ts:52`
- `src/adapters/packages/skills.ts:28`
- `src/adapters/packages/context-governor.ts:40`
**Recommendation:** Introduce bridge manifest/locator (config-driven module resolution).

### 3. Bootstrap Timeout/Cancellation Missing
**Location:** `src/kernel/bootstrap.ts:79-130`  
**Issue:** No timeout/cancellation boundary around capability load/init. One hung provider can stall bootstrap indefinitely.  
**Recommendation:** Add optional per-capability `loadTimeoutMs` / `initTimeoutMs` guards.

### 4. Plugin Manifest Uses Weak Schema
**Location:** All plugin adapters  
**Issue:** `manifest: z.any()` in all plugin validators - weak typing.  
**Files:** `oh-my-opencode.ts:187`, `security-plugin.ts:258`, `token-monitor.ts:342`, etc.  
**Recommendation:** Replace `z.any()` with concrete `PluginManifest` schema.

### 5. Synchronous Process Execution in Async Handlers
**Location:** Multiple CLI commands  
**Issue:** `spawnSync` used inside async command handlers (blocking pattern).  
**Files:** `run.ts:108`, `mcp.ts:88`, `validate.ts:156`, etc.  
**Recommendation:** Prefer async process API with shared runner abstraction.

---

## Important Findings (P2 - Should Fix)

### 6. Too Many Top-Level Commands
**Issue:** 34 root commands in `src/cli/commands/index.ts` - poor discoverability.  
**Recommendation:** Consolidate to ~8-12 top-level commands; move others under namespaces (e.g., `audit: verify|validate|check`).

### 7. Plugin Adapter Boilerplate Duplication
**Issue:** Each plugin adapter reimplements identical lifecycle/port/error handling.  
**Recommendation:** Extract `PluginAdapterBase` class for common plumbing.

### 8. Inconsistent Error Messages
**Issue:** Error messages vary in quality; many not actionable. No "did you mean" suggestions.  
**Recommendation:** Standardize error contract with fix suggestions and close-match detection.

### 9. Stringly-Typed Hook Names
**Issue:** Hook names validated at runtime, not compile-time.  
**Recommendation:** Move to typed hook registry (const enums / discriminated unions).

### 10. Inconsistent Flag Conventions
**Issue:** Many flags lack short equivalents; no shared conventions across commands.  
**Recommendation:** Standardize: `--json/-j`, `--output/-o`, `--verbose/-V`, etc.

### 11. Config Schema Too Permissive
**Issue:** `.passthrough()` everywhere reduces typo detection.  
**Recommendation:** Add strict mode validation: `opencode config validate --strict`

### 12. Help Text Lacks Examples
**Issue:** Most commands lack Examples sections; describe scripts not user tasks.  
**Recommendation:** Add examples for all commands; rewrite descriptions from script-backed to job-to-be-done.

---

## Nice-to-Have (P3 - Enhancements)

### 13. No Plugin Scaffold Path
**Issue:** Creating plugins requires multiple files and manual wiring.  
**Recommendation:** Add `opencode plugin create my-plugin --template basic` generator.

### 14. Coverage Artifact Misconfigured
**Issue:** `coverage/lcov.info` includes test files as sources.  
**Recommendation:** Fix coverage instrumentation to focus on `src/**` (exclude `tests/**`).

### 15. README Stale
**Issue:** README shows only kernel/test minimal structure, not current architecture.  
**Recommendation:** Update README to reflect actual module boundaries (adapters, CLI, MCP, etc.).

### 16. No Config Introspection
**Issue:** No way to see where config values come from.  
**Recommendation:** Add `opencode config explain <path>` and `opencode config schema` commands.

---

## Strengths

1. **Excellent Test Coverage** - 264 tests across 50+ files
2. **Strong Architecture Intent** - Kernel-first, ports/adapters pattern
3. **Strict Mode Design** - Thoughtful defensive bootstrap
4. **Comprehensive Migration** - All 84 scripts migrated to CLI
5. **Good Type Safety** - Strict TypeScript config overall
6. **Clean CLI Structure** - Consistent command class architecture
7. **Config Migration** - Seamless legacy config migration

---

## Recommendations Priority Matrix

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| P1 | Wire kernel to CLI | Medium | Critical |
| P1 | Replace hardcoded paths | Medium | Critical |
| P1 | Add bootstrap timeouts | Small | High |
| P1 | Fix plugin manifest schema | Medium | High |
| P1 | Async process execution | Medium | High |
| P2 | Consolidate commands | Large | High |
| P2 | Extract PluginAdapterBase | Medium | High |
| P2 | Standardize errors | Medium | Medium |
| P2 | Typed hook registry | Medium | Medium |
| P2 | Flag conventions | Small | Medium |
| P2 | Strict config mode | Small | Medium |
| P2 | Help examples | Medium | Medium |
| P3 | Plugin scaffold | Medium | Low |
| P3 | Coverage config | Small | Low |
| P3 | README update | Small | Low |

---

## Next Steps

1. **Address P1 items** before considering production-ready
2. **Implement P2 items** for improved DX and maintainability
3. **Consider P3 items** as future enhancements
4. **Update plan** with specific implementation tasks

---

**Reviewers:**
- Architecture Strategist (ses_269464365ffe0aGGylk2Uj6vE4)
- Code Quality Specialist (ses_2694626a5ffeAnLoz0Ci1F2XGZ)
- API Design Expert (ses_26945fd18ffevoALfSBpK6DY9q)
