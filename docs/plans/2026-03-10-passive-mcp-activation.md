# Passive MCP Activation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the remaining passive MCP integrations into live, discoverable workflows and clean up the surrounding skill-system audit gaps without waiting for repeated user nudges.

**Architecture:** Follow the same three-part live-MCP pattern already used by `distill` and `context7`: skill definition, agent prompt, and orchestrator/registry trigger path. Execute in phases so each phase leaves the repo in a verifiable, governed state before moving to the next one.

**Tech Stack:** Markdown skill/agent docs, JSON config (`registry.json`, `compound-engineering.json`), governance scripts, skill audit CLI, git governance workflow.

---

### Task 1: Persist the passive MCP skill and agent layer

**Files:**
- Create: `opencode-config/skills/supermemory/SKILL.md`
- Create: `opencode-config/skills/sequentialthinking/SKILL.md`
- Create: `opencode-config/skills/websearch/SKILL.md`
- Create: `opencode-config/skills/grep/SKILL.md`
- Create: `opencode-config/agents/memory-keeper.md`
- Create: `opencode-config/agents/thinker.md`
- Create: `opencode-config/agents/researcher.md`
- Create: `opencode-config/agents/code-searcher.md`

**Step 1: Verify real tool surfaces before documenting them**

Run: `supermemory { mode: "help" }` and inspect repo references for `sequentialthinking`, `websearch`, and `grep` tool names.

Expected: Concrete entrypoints instead of placeholder audit naming.

**Step 2: Write the skill files**

Mirror the `distill` / `context7` structure:
- Overview
- When to Use
- Workflow
- Must Do / Must Not Do
- Quick Start

**Step 3: Write the agent prompts**

Mirror `opencode-config/agents/librarian.md` with one agent per MCP domain.

**Step 4: Verify artifact presence**

Run: `node scripts/skills-manage.mjs audit`

Expected: No new missing-skill-file errors from the newly added MCP skills.

**Step 5: Commit**

Commit skill and agent docs in an atomic governed/non-governed split if needed.

### Task 2: Wire registry and orchestrator activation paths

**Files:**
- Modify: `opencode-config/skills/registry.json`
- Modify: `opencode-config/compound-engineering.json`
- Modify: `opencode-config/skills/skill-orchestrator-runtime/SKILL.md`

**Step 1: Add failing validation target**

Run: `node scripts/skills-manage.mjs audit`

Expected: Passive MCPs are absent from live skill wiring before the config update.

**Step 2: Add registry entries**

Register `supermemory`, `sequentialthinking`, `websearch`, and `grep` with:
- category
- triggers
- synergies
- source

**Step 3: Enable and categorize them in compound config**

Update enabled skills and category lists so runtime loading can select them.

**Step 4: Add orchestrator trigger sections**

Extend `skill-orchestrator-runtime` with detection rules for:
- memory recall/persistence
- explicit step-by-step reasoning
- live web research
- external code example lookup

**Step 5: Verify config integrity**

Run:
- `python -c "import json, pathlib; root=pathlib.Path(r'C:\\Users\\jack\\work\\opencode-setup'); json.load(open(root/'opencode-config'/'skills'/'registry.json', encoding='utf-8')); json.load(open(root/'opencode-config'/'compound-engineering.json', encoding='utf-8')); print('json-ok')"`
- `node scripts/skills-manage.mjs audit`

Expected: JSON parses successfully; no new audit regressions introduced by these additions.

### Task 3: Govern, commit, and push passive MCP activation

**Files:**
- Modify: `opencode-config/.governance-hashes.json`
- Create: `opencode-config/learning-updates/<phase-files>.json`
- Stage governed config/doc changes from Tasks 1-2

**Step 1: Create learning updates**

Write governed learning-update JSON artifacts summarizing:
- skill/agent activation docs
- registry/compound/orchestrator activation

**Step 2: Generate hashes**

Run: `node scripts/learning-gate.mjs --generate-hashes`

**Step 3: Stage by atomic concern**

Prefer at least:
- one docs/skills commit
- one config/orchestrator commit

**Step 4: Commit with governed trailers**

Include:
- `Learning-Update:`
- `Risk-Level:`
- `Co-authored-by:`

**Step 5: Push**

Run: `git push`

### Task 4: Close pre-existing skill audit gaps

**Files:**
- Modify: `opencode-config/compound-engineering.json`
- Create or modify: `opencode-config/skills/task-orchestrator/SKILL.md` if missing and still intended
- Optionally reconcile registry/compound mismatch for `dcp` and `agent-browser`

**Step 1: Reproduce the audit gaps**

Run: `node scripts/skills-manage.mjs audit`

Expected: existing issues for `dcp`, `agent-browser`, `task-orchestrator`.

**Step 2: Decide smallest safe fix per issue**

- `dcp`: enable or intentionally remove from registry/compound mismatch
- `agent-browser`: same
- `task-orchestrator`: add missing SKILL if still a valid custom skill

**Step 3: Implement minimally**

Do not broaden scope beyond satisfying the existing audit contract.

**Step 4: Verify**

Run: `node scripts/skills-manage.mjs audit`

Expected: zero audit issues.

### Task 5: Final verification and workspace cleanup

**Files:**
- Any generated governed files touched during prior tasks

**Step 1: Run fresh verification**

Run:
- `node scripts/skills-manage.mjs audit`
- `node scripts/learning-gate.mjs --generate-hashes`
- `git status --short`

**Step 2: Clean generated drift**

If `opencode-config/meta-knowledge-index.json` self-drifts again, either commit it intentionally or restore it before completion.

**Step 3: Push final commits**

Run: `git push`

**Step 4: Final report**

Summarize:
- which MCPs are now live
- what audit gaps remain, if any
- exact verification commands run
