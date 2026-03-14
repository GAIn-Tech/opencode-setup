# Agent Surface Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make plugin-managed agent surfaces and host-facing MCP surfaces durable by fixing runtime config sync, removing stale on-disk agent mirrors, and adding regression coverage so phantom agent options cannot silently return.

**Architecture:** Treat `opencode-config/oh-my-opencode.json` as the only canonical source for named agents and `opencode-config/opencode.json` as the canonical source for host-facing MCPs. Stop mirroring repo `agents/` into `~/.config/opencode`, explicitly purge deprecated repo-managed agent prompt files from runtime config, then align tests and docs with that architecture before moving on to MCP boundary refinements.

**Tech Stack:** Bun, ESM infrastructure scripts, governed config + learning updates, runtime user config under `~/.config/opencode`.

---

## Phase 1: Plugin-Managed Agent Source of Truth

### Task 1: Remove stale repo-managed agent prompt remnants

**Files:**
- Delete: `opencode-config/agents/librarian.md`
- Modify: `scripts/tests/mcp-inventory-regression.test.js`
- Modify: `scripts/check-agents-drift.mjs`

**Intent:**
- Make `opencode-config/agents/` truly empty except `.gitkeep`
- Stop tests and drift tooling from asserting file-based agent prompts still exist

**Validation:**
- `opencode-config/agents/` contains only `.gitkeep`
- regression test expects skill files only, not agent markdown files
- drift checker distinguishes plugin-managed named agents from on-disk prompt files

### Task 2: Harden runtime config sync against phantom agent reintroduction

**Files:**
- Modify: `scripts/copy-config.mjs`
- Modify: `scripts/tests/copy-config.test.js`

**Intent:**
- Remove `agents` from wholesale config mirroring
- Add targeted cleanup of deprecated repo-managed agent prompt files in `~/.config/opencode/agents`
- Preserve user-installed custom skills and avoid broad destructive cleanup of unknown custom agent files

**Validation:**
- sync no longer copies repo `agents/` into runtime config
- deprecated prompt names are removed from target runtime config during sync
- custom user MCP/plugin config remains preserved

### Task 3: Align public docs with plugin-managed agent reality

**Files:**
- Modify: `README.md`
- Modify: `agents-list.md`

**Intent:**
- Remove stale claims about `agents/*.md` being the canonical agent source
- Document `oh-my-opencode.json` as the canonical named-agent registry
- Keep user-facing guidance consistent with actual runtime behavior

**Validation:**
- no remaining doc claim says `~/.config/opencode/agents/*.md` contains the canonical 29-agent runtime list
- docs point readers to `oh-my-opencode.json` and `opencode.json`

---

## Phase 2: MCP Boundary Cleanup

### Task 4: Reconcile MCP boundary docs/tests with current wrapper reality

**Files:**
- Review/modify as needed: `mcp-servers/opencode-mcp-config.json`
- Review/modify as needed: `mcp-servers/server-list.md`
- Review/modify as needed: `docs/architecture/cli-mcp-surface-policy.md`

**Intent:**
- clarify which files are active config vs reference/template
- ensure wrapped internal MCPs and dormant internal surfaces match the actual policy

**Validation:**
- docs/config no longer imply dormant/internal packages are host-facing by default
- template/reference files are clearly labeled if retained

### Task 5: Verify actual host runtime startup for wrapped internal MCPs

**Files:**
- Reuse existing wrappers/tests and host config

**Intent:**
- validate runtime startup/status of `opencode-context-governor`, `opencode-runbooks`, and `opencode-memory-graph` in the actual host-facing MCP layer

**Validation:**
- wrapper startup checks pass
- failures, if any, are isolated to real runtime integration rather than config drift

---

## Phase 3: Hardening Backlog Follow-Ons

### Task 6: Triage next major backlog wave after surface cleanup

**Candidate tracks:**
- `docs/model-management/HARDENING-BACKLOG.md` auth + boundary hardening
- repo-wide test health cleanup
- future adaptive model-learning work from `.sisyphus/plans/dynamic-model-learning-assessment-plan.md`

**Intent:**
- choose the next large execution batch only after agent/MCP surface drift is locked down

---

## First Execution Wave

Execute Phase 1 now:
1. delete final stale repo agent prompt (`opencode-config/agents/librarian.md`)
2. harden `scripts/copy-config.mjs`
3. add regression coverage in `scripts/tests/copy-config.test.js`
4. fix stale inventory/drift expectations
5. update `README.md` and `agents-list.md`
6. run targeted tests and diagnostics

## Verification Commands

Run in `C:\Users\jack\work\opencode-setup`:

```bash
bun test scripts/tests/copy-config.test.js scripts/tests/mcp-inventory-regression.test.js scripts/tests/mcp-audit-classification.test.js scripts/tests/skill-surface-regression.test.js
node scripts/check-agents-drift.mjs --json
```

If config sync behavior is exercised directly, also verify:

```bash
node scripts/copy-config.mjs
```

and confirm `~/.config/opencode/agents/` does not regain deprecated mirror files.
