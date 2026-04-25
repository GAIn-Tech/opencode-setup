# P1 Critical Improvements Plan

## Overview
Address the 5 critical (P1) findings from the code review.

---

## P1.1: Wire Kernel to CLI Execution Path

### Problem
The `createKernel()` function exists but is never instantiated in CLI execution. Commands use script wrappers instead of kernel-backed operations.

### Solution
Create composition root that instantiates kernel + providers before command execution.

### Files to Modify
- `src/cli/index.ts` - Add kernel initialization
- `src/cli/commands/base.ts` - Add kernel access to commands
- `src/cli/commands/run.ts` - Use kernel instead of script wrapper

### Implementation Steps
1. Create `src/cli/bootstrap.ts` - CLI bootstrap with kernel initialization
2. Update `src/cli/index.ts` - Call bootstrap before command execution
3. Update command base class to receive kernel instance
4. Migrate run command to use kernel orchestration port

### Acceptance Criteria
- [ ] Kernel instantiated on CLI startup
- [ ] Commands can access kernel via context
- [ ] Run command uses kernel instead of script wrapper
- [ ] All tests pass

---

## P1.2: Replace Hardcoded Legacy Module Paths

### Problem
Adapters use hardcoded relative paths to old packages (e.g., `.../packages/opencode-model-router-x/...`). Breaks extraction portability.

### Solution
Introduce bridge manifest/locator with config-driven module resolution.

### Files to Modify
- `src/adapters/packages/model-router.ts`
- `src/adapters/packages/sisyphus.ts`
- `src/adapters/packages/skills.ts`
- `src/adapters/packages/context-governor.ts`
- `src/adapters/packages/learning.ts`

### Implementation Steps
1. Create `src/adapters/config.ts` - Bridge configuration schema
2. Create `src/adapters/locator.ts` - Module resolution logic
3. Update each adapter to use locator instead of hardcoded paths
4. Add config file: `config/bridge.json`

### Acceptance Criteria
- [ ] No hardcoded `../packages/` paths in adapters
- [ ] Module resolution is config-driven
- [ ] Can override paths via config
- [ ] All tests pass

---

## P1.3: Add Bootstrap Timeout/Cancellation Guards

### Problem
No timeout/cancellation around capability load/init. One hung provider can stall bootstrap indefinitely.

### Solution
Add optional per-capability load/init timeouts with cancellation.

### Files to Modify
- `src/kernel/bootstrap.ts` - Add timeout logic
- `src/kernel/types.ts` - Add timeout options

### Implementation Steps
1. Add `loadTimeoutMs` and `initTimeoutMs` options to BootstrapOptions
2. Wrap load/init in Promise.race with timeout
3. Add cancellation support via AbortController
4. Emit timeout errors with capability name

### Acceptance Criteria
- [ ] Timeouts configurable per capability
- [ ] Timeout errors include capability name
- [ ] Cancellation support for hung providers
- [ ] All tests pass

---

## P1.4: Replace z.any() with Strict PluginManifest Schema

### Problem
`manifest: z.any()` in all plugin validators - weak typing reduces safety.

### Solution
Define strict PluginManifest schema and use it in all adapters.

### Files to Modify
- `src/adapters/plugins/oh-my-opencode.ts`
- `src/adapters/plugins/security-plugin.ts`
- `src/adapters/plugins/token-monitor.ts`
- All other plugin adapters

### Implementation Steps
1. Define PluginManifestSchema in `src/adapters/plugins/types.ts`
2. Update all plugin adapters to use strict schema
3. Add validation tests
4. Update requirePlugin() implementations

### Acceptance Criteria
- [ ] No z.any() in plugin manifest parsing
- [ ] All plugin adapters use strict schema
- [ ] Validation errors are helpful
- [ ] All tests pass

---

## P1.5: Replace spawnSync with Async Process Execution

### Problem
`spawnSync` used inside async command handlers (blocking pattern).

### Solution
Create async process runner utility and use it in all commands.

### Files to Modify
- `src/cli/commands/run.ts`
- `src/cli/commands/mcp.ts`
- `src/cli/commands/validate.ts`
- All other script-wrapper commands

### Implementation Steps
1. Create `src/cli/utils/process.ts` - Async process runner
2. Create wrapper: `runScriptAsync(script, args, options)`
3. Update all commands to use async runner
4. Add error handling for process failures

### Acceptance Criteria
- [ ] No spawnSync in async handlers
- [ ] Process runner is reusable
- [ ] Error handling is consistent
- [ ] All tests pass

---

## Implementation Order

1. P1.5 (Async Process) - Foundational utility
2. P1.2 (Bridge Locator) - Config infrastructure
3. P1.4 (Plugin Schema) - Type safety
4. P1.3 (Bootstrap Timeouts) - Reliability
5. P1.1 (Kernel Wiring) - Major architecture change

## Estimated Effort
- Total: ~2-3 days
- P1.1: 1 day (largest change)
- P1.2: 4 hours
- P1.3: 3 hours
- P1.4: 4 hours
- P1.5: 3 hours
