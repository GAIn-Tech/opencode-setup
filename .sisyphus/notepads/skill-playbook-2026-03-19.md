# Skill Exercise + Real Work Playbook

**Created:** 2026-03-19
**Purpose:** Comprehensive skill system checkup while accomplishing real system improvement work. Each prompt exercises a distinct skill cluster and produces actionable output.

---

## PROMPT 1: Full Stack Health Audit

**What to say to the agent:**
```
Run a full stack health audit of this opencode-setup. Use code-doctor to perform fault localization across the packages/, opencode-config/, and scripts/ directories. Use incident-commander to triage findings by severity. Use grep to search for common failure patterns (ENOENT spawn crashes, empty catch blocks, as any suppressions, TODO comments, TODO markers). Use runbooks to match each issue against known remediation patterns. Use sequentialthinking to prioritize fixes: fix the 3 highest-impact issues you find, leave a clear TODO for the rest. Save findings to .sisyphus/notepads/health-audit-YYYY-MM-DD.md with severity, location, remediation, and status for each issue found.
```

**Real work:** 3+ issues fixed, actionable report produced
**Skills fired:** `code-doctor`, `incident-commander`, `grep`, `runbooks`, `sequentialthinking`
**Chain:** `runbooks` → `incident-commander` → back to `code-doctor` for fixes

---

## PROMPT 2: Skill System Coverage Audit

**What to say to the agent:**
```
Audit the skill system end-to-end. Read opencode-config/skills/registry.json and opencode-config/tool-tiers.json. Check every skill in the registry against: (1) does it have trigger keywords? (2) does it have a SKILL.md file at opencode-config/skills/{skill}/? (3) is it referenced in tool-tiers.json tier_1 or tier_2? (4) is the tier_1 category pattern still accurate for its domain? Use grep to verify each SKILL.md exists and contains actual content (not just placeholder text). Use codebase-auditor to find any skill-adjacent packages in packages/ that should be in the registry. For any gaps found, either fix them directly or write them to .sisyphus/notepads/skill-gaps-YYYY-MM-DD.md with severity and recommended fix.
```

**Real work:** Registry→filesystem consistency verified, gaps documented or fixed
**Skills fired:** `codebase-auditor`, `grep`, `skill-orchestrator-runtime`
**Chain:** `codebase-auditor` → `skill-orchestrator-runtime` → `grep` for verification

---

## PROMPT 3: Context Budget Deep Dive

**What to say to the agent:**
```
Analyze the context management system. Use context-governor to check current budget status and list all tracked sessions. Use token-reporter to identify which skills and agents consume the most tokens. Use dcp to evaluate the current session context — if any segment is stale or irrelevant, compress it. Use distill to run AST-aware compression on the largest package files you interacted with this session (packages/*/src/index.js). Use sequentialthinking to identify 3 patterns in recent context bloat: what triggers it, which skills/tools cause it, and what the threshold was. Output a Context Budget Report at .sisyphus/notepads/context-report-YYYY-MM-DD.md with findings and recommended guardrails.
```

**Real work:** Token savings quantified, compression applied, guardrails documented
**Skills fired:** `context-governor`, `token-reporter`, `dcp`, `distill`, `sequentialthinking`
**Chain:** `context-governor` → `token-reporter` → `dcp`/`distill` → `sequentialthinking`

---

## PROMPT 4: Model Tier RL Audit

**What to say to the agent:**
```
Audit the RL-driven skill promotion system. Read opencode-config/tool-tiers.json and check: (1) rl_overrides — are the last_updated timestamps stale (>7 days)? (2) tier_1 → tier_0 promotion candidates — are any skills with 0 failure rate over many sessions that should be promoted? (3) tier_0 → tier_1 demotion candidates — any tier_0 skills that consistently fail or mismatch? Use evaluation-harness-builder to design a micro-benchmark: 3 test prompts that should trigger each tier_1 category, verify the right skills load. Check packages/opencode-skill-rl-manager/ for actual RL outcome data. Use grep to find all rl_overrides entries in the codebase. Output a Tier Audit Report at .sisyphus/notepads/tier-audit-YYYY-MM-DD.md with promotion/demotion candidates and your confidence score for each.
```

**Real work:** RL thresholds tuned, promotion/demotion recommendations with evidence
**Skills fired:** `skill-rl-manager` (via package), `evaluation-harness-builder`, `grep`, `sequentialthinking`, `code-doctor`
**Chain:** `grep` → `evaluation-harness-builder` → `sequentialthinking` → apply or flag

---

## PROMPT 5: Context Observability Report

**What to say to the agent:**
```
Build a comprehensive context observability report. Read packages/opencode-context-governor/src/index.js and packages/opencode-model-manager/src/monitoring/. For each metric tracked (compression events, budget alerts at 75%/80%/95%, Context7 lookups, discovery success rate), find the actual data source and report its current state. Use context-governor to get any live session budget data. Use runbooks to check if any alert patterns have fired recently. Use innovation-migration-planner to identify 2-3 observability improvements that would have high impact (e.g., adding a compression savings metric, a skill coverage heatmap). Output the report at .sisyphus/notepads/observability-report-YYYY-MM-DD.md.
```

**Real work:** Observability gap analysis + 2-3 improvement proposals
**Skills fired:** `context-governor`, `runbooks`, `innovation-migration-planner`, `writing-plans`, `code-doctor`
**Chain:** `context-governor` → `runbooks` → `innovation-migration-planner` → `writing-plans`

---

## PROMPT 6: Registry Bridge Maintenance Pass

**What to say to the agent:**
```
Run the registry bridge maintenance cycle. First, run packages/opencode-registry-bridge/generate-entries.mjs to see if any new packages in packages/ need registry entries. Then run merge-to-registry.mjs --dry-run to check what would change. Apply any safe additions (new packages only, no modifications to existing entries). Next, audit all 107 registry entries: use grep to find entries where triggers.length === 0 or description is generic/placeholder. For any new SKILL.md files added this session, ensure they have quality content (not just the template). Use writing-skills to improve any weak SKILL.md files you find. Output a maintenance log at .sisyphus/notepads/registry-maintenance-YYYY-MM-DD.md.
```

**Real work:** Registry stays current, SKILL.md quality improved, maintenance documented
**Skills fired:** `grep`, `codebase-auditor`, `skill-orchestrator-runtime` (implicit)
**Chain:** `codebase-auditor` (package scan) → `grep` (quality check) → writing (fix SKILL.md)

---

## PROMPT 7: Meta-Super Lazy Workflow (The Master Loop)

**What to say to the agent:**
```
Design and implement a meta-super lazy workflow for continuous system improvement. This is a self-referential task: you are improving the system that improves itself. Use task-orchestrator to decide which of the other 6 health prompts (from the playbook) to run first based on current system state. Use sequentialthinking to analyze the output of each sub-task and identify cross-cutting patterns. Use writing-plans to create a single-file automation script (scripts/meta-super-cycle.mjs) that: (1) reads the last run timestamp for each audit type, (2) decides which audits are due based on staleness, (3) runs the appropriate audit, (4) auto-applies low-risk fixes (adding triggers, removing phantoms, syncing state), (5) queues high-risk changes for human review, (6) logs results. The script should be idempotent and safe to run daily. After creating the script, run it once to verify it works. Save the workflow design at .sisyphus/notepads/meta-super-design-YYYY-MM-DD.md.
```

**Real work:** `scripts/meta-super-cycle.mjs` created and smoke-tested, system gains self-improvement loop
**Skills fired:** `task-orchestrator`, `sequentialthinking`, `writing-plans`, `subagent-driven-development`, `code-doctor`
**Chain:** `task-orchestrator` → orchestrates all other prompts → `sequentialthinking` synthesizes → `writing-plans` documents

---

## EXECUTION CHAIN

```
Prompt 7 (Meta-Super) → decides which of 1-6 to run
    ├── Prompt 1 (Health) → fixes issues, feeds gaps
    ├── Prompt 2 (Skill Coverage) → feeds gaps to Prompt 6
    ├── Prompt 3 (Context Budget) → feeds thresholds to Prompt 5
    ├── Prompt 4 (RL Tier Audit) → feeds promotions to Prompt 6
    ├── Prompt 5 (Observability) → feeds improvements to Prompt 7
    └── Prompt 6 (Registry) → closes the loop, feeds Prompt 2
```

Each prompt can run standalone for a quick win. Run Prompt 7 last to create the automation that runs the others lazily.

---

## RUN ORDER RECOMMENDATION

1. **Start with Prompt 7** to create `scripts/meta-super-cycle.mjs` — this seeds the lazy workflow
2. **Run Prompt 1** early — health fixes give you immediate wins and surface real problems
3. **Alternate** Prompt 2/6 (registry) and Prompt 3/5 (context) on subsequent sessions
4. **Run Prompt 4** monthly — RL tier audit is low-frequency by nature

---

## OUTPUT FILES PRODUCED

| Prompt | Output File |
|--------|-------------|
| 1 | `.sisyphus/notepads/health-audit-YYYY-MM-DD.md` |
| 2 | `.sisyphus/notepads/skill-gaps-YYYY-MM-DD.md` |
| 3 | `.sisyphus/notepads/context-report-YYYY-MM-DD.md` |
| 4 | `.sisyphus/notepads/tier-audit-YYYY-MM-DD.md` |
| 5 | `.sisyphus/notepads/observability-report-YYYY-MM-DD.md` |
| 6 | `.sisyphus/notepads/registry-maintenance-YYYY-MM-DD.md` |
| 7 | `.sisyphus/notepads/meta-super-design-YYYY-MM-DD.md` + `scripts/meta-super-cycle.mjs` |
