# Draft: Fundamental Design Philosophy Audit

## User Request
- "Let's comprehensively assess the quality of our design philosophy and approaches from the most fundamental level."
- Investigate where the system is terribly inefficient, naive in its approaches, and behind in orchestration, tool usage, and adjacent strategies.
- Compare against the latest agentic and coding methods using live web research and strong external projects.
- Use exhaustive search: parallel explore/librarian agents plus direct repo search tools.

## Audit Scope
- OpenCode ecosystem design philosophy
- Orchestration and delegation strategy
- Tool / skill / package usage strategy
- Runtime authority, telemetry, feedback loops, and operator visibility
- Comparison with current state-of-the-art agentic coding systems and methods

## Repo Evidence Gathered So Far
- Existing internal audit already identified **advisory-only control plane** as a core architectural issue:
  - `packages/opencode-integration-layer/src/index.js:1629-1647` shows explicit fail-open behavior and advisory-only context budget checks.
- Existing internal audit on tool usage concluded sparse adoption is driven by **advisory wiring + weak enforcement + telemetry drift** rather than missing capabilities.
- Existing naive-assumptions audit identified deeper systemic issues including:
  - Dual database location mismatch
  - Silent snapshot corruption fallback
  - Learning gate bypasses
  - Config fragmentation without atomic sync
  - Deep dashboard/model-manager coupling
  - Cross-process race conditions

## Fresh Search Findings (current session)
- Broad grep for `fail-open|advisory|fallback|Never block` returned heavy signal across runtime code, tests, plans, and skills.
- Strong evidence that fail-open is not an edge case but a cross-cutting philosophy:
  - `packages/opencode-integration-layer/src/index.js:1629-1647` — telemetry and context budget checks explicitly never block execution.
  - `packages/opencode-integration-layer/tests/bootstrap.test.js` and multiple related tests assert fail-open wiring as a desired invariant.
  - `opencode-config/skills/context-governor/SKILL.md` explicitly says governor is advisory and must not block operations.
  - `scripts/runtime-skill-tracker.mjs` exits 0 on error (`main().catch(() => process.exit(0))`).
- Historical plans/docs indicate multiple waves intentionally adopted try/catch fail-open imports and null-return delegation methods as the standard integration pattern.
- Existing `parallel-agent-limits-delegation.md` draft suggests delegation diversity narrowed because categories map to one fixed model while more sophisticated routing (e.g. Thompson Sampling) exists but may not be integrated into category selection.

## Additional High-Signal Repo Findings
- `packages/opencode-integration-layer/src/context-bridge.js` presents itself as a **mandatory enforcement bridge** with fail-closed semantics and explicit veto logic.
- But `packages/opencode-integration-layer/src/index.js:1633-1647` still uses advisory-only budget checks and explicitly says execution should never block. This is a philosophy mismatch inside the same subsystem: enforcement exists, but runtime defaults still normalize advisory handling.
- `packages/opencode-model-manager/src/monitoring/alert-manager.js` still carries local threshold semantics (`0.75 / 0.80 / 0.95`) instead of obviously importing the shared invariant layer, which suggests partial rather than total unification of control-loop semantics.
- `packages/opencode-model-router-x/src/index.js:1301-1331` hard-filters Anthropic models in `_filterByConstraints()` while also operating a much richer scoring, exploration, and orchestration stack. This is a strong sign of static policy short-circuiting dynamic intelligence.
- `packages/opencode-model-router-x/src/index.js:548-585` initializes a large orchestration subsystem and then falls back to legacy scoring if initialization fails, reinforcing the “smart system available, simpler path actually trusted” pattern.
- `packages/opencode-plugin-preload-skills/README.md` explicitly says `selectTools()` only returns a selected surface and the external host is still responsible for actually applying it at runtime. That means the preload system optimizes recommendations, not guaranteed behavior.
- In `packages/opencode-plugin-preload-skills/src/index.js`, promotion/demotion behavior depends on plugin bookkeeping and host usage reporting; the strategy remains soft and host-mediated rather than truly end-to-end enforced.
- `opencode-config/oh-my-opencode.json` now includes per-category `fallbacks`, so the configuration surface is richer than older notes suggested, but the strategic question remains whether runtime routing actually honors that richness consistently versus short-circuiting on static constraints.
- `packages/opencode-runtime-authority/src/index.js` is a clean precedence-based authority resolver with provenance, but its defaults still only cover a single primary model per category/agent rather than richer policy semantics. This suggests authority unification is underway but still too narrow relative to the rest of the router stack.
- `packages/opencode-eval-harness/README.md` and `packages/opencode-model-benchmark/README.md` show that benchmarking/eval infrastructure exists in the repo, but current orchestration/tooling loops do not yet appear deeply governed by those eval systems.
- `packages/opencode-dashboard/API.md` exposes useful operator surfaces (frontier status, learning stats, memory graph, retrieval quality, plugin evaluation, model lifecycle), indicating the repo has more observability affordances than the orchestration philosophy currently exploits.
- `packages/opencode-plugin-lifecycle/src/index.js` shows useful health evaluation and quarantine logic for plugins, but persistence failures remain explicitly non-fatal and state-load failures degrade silently to empty state. Again: observability and supervision exist, but hard runtime consequences remain limited.
- `packages/opencode-integration-layer/tests/entourage-v2.test.js` demonstrates the repo already values quota-aware routing, uncertainty-triggered evidence capture, and verification-oriented skills in tests. This reinforces the audit theme that many frontier ideas are present in the system already, but not yet elevated into consistently binding production philosophy.

## External Frontier Signals (current session)
- Anthropic engineering guidance (Sep 2025) strongly emphasizes:
  - eval-driven tool development
  - designing tools for agents, not human API consumers
  - namespacing, token-efficient responses, and actionable tool errors
  - measuring tool performance with real task evaluations rather than intuition
- Anthropic context-engineering guidance (Sep 2025) emphasizes:
  - context as a scarce resource
  - just-in-time retrieval rather than over-eager preloading
  - compaction, structured note-taking, and sub-agent architectures for long-horizon tasks
  - hybrid context strategies over static "load everything" approaches
- GitHub’s 2025 Copilot workflow guidance frames reliable agentic systems as a three-layer stack:
  - structured prompts/Markdown
  - reusable agent primitives / workflow files
  - context engineering for reliability
  - plus explicit inner-loop vs outer-loop execution models
- OpenHands positioning stresses:
  - secure sandboxed runtime
  - autonomous outer-loop workflows (PR review, vuln fixing, migration, incident triage)
  - strong operator visibility, SDK/runtime separation, and large-scale remote delegation
- Anthropic's SWE-bench agent writeup (Jan 2025) emphasizes that benchmark performance depends on the whole agent scaffold, not just the model; it used a deliberately simple scaffold plus carefully designed tool descriptions/specs. This supports the idea that tool and workflow ergonomics may matter more than raw subsystem count.
- OpenHands' SWE-bench post emphasizes inference-time scaling and trained critic-model selection of multiple trajectories. This is a strong frontier signal that verification/critic layers and best-of-N selection are becoming important outer-loop techniques.

## Emerging Interim Thesis
- OpenCode appears philosophically strongest at **breadth + modularity + resilience**, but weaker at **closing the loop**.
- The modern frontier is shifting from "lots of capabilities + advisory coordination" toward:
  - explicit planner/executor/verifier separation
  - eval-backed tool and workflow optimization
  - tighter context engineering
  - stronger runtime contracts on critical orchestration paths
  - better operator-visible automation for the outer loop

## Refined Working Thesis
- The system is not primitive; it is **under-converged**. It already contains many advanced pieces (authority resolver, threshold contract, eval harnesses, model benchmarking, exploration logic, dashboard APIs), but they are not yet fused into a single operating philosophy.
- The deepest inefficiency may therefore be **organizational/architectural scatter**, not lack of sophistication: advanced modules exist, but too many remain optional, advisory, duplicated, or only partially wired into real runtime authority.

## Background Research In Flight
- Relaunched explore agent: control-plane audit (`bg_def7a874`)
- Relaunched explore agent: tool/skill loop audit (`bg_df4c2db2`)
- Relaunched librarian agent: frontier methods research (`bg_65d078a5`)
- Relaunched librarian agent: comparative project benchmark (`bg_1d1ded50`)
- Relaunched oracle agent: architectural critique (`bg_4a307699`)

## Search Execution Notes
- Reran the abandoned avenues per explicit user request.
- Direct `google_search` failed due to missing Antigravity authentication; non-blocking because websearch + librarian agents remain active.

## Working Hypotheses
- The system likely over-optimizes for continuity and composability while under-investing in hard contracts, enforcement, and runtime truth coherence.
- Tool/skill richness may exceed actual operational leverage because recommendations are not converted into mandatory or economically incentivized behaviors.
- Config/package proliferation may be creating coordination overhead and hidden split-brain states.
- The modern frontier likely favors tighter closed-loop execution, better online evals, stronger memory/context discipline, and more explicit planner/executor/verifier separation than current OpenCode defaults.

## Research Streams Launched / Planned
- Repo inventory of orchestration, routing, telemetry, feedback loops, docs, and drift surfaces
- External research on current agentic coding methods, orchestration patterns, eval-driven loops, and notable open-source systems
- Comparative analysis: OpenCode vs modern best practices

## User Direction Update
- User explicitly does **not** want us to abandon the background research avenues.
- User requested we rerun the explore/librarian/oracle-style avenues rather than rely only on direct evidence.
- Therefore current approach is: relaunch parallel repo and external research, then synthesize with the direct evidence already gathered.

## Open Questions
- Which inefficiencies are fundamental philosophy issues vs tactical implementation debt?
- Where should fail-open remain, and where should the system move to fail-loud or fail-closed?
- Which modern agentic patterns are mature enough to adopt now vs still too experimental?

## Scope Boundaries
- INCLUDE: architectural philosophy, orchestration methods, tool usage strategy, feedback loops, telemetry, external trend comparison
- EXCLUDE: immediate code implementation or remediation execution in this session unless explicitly turned into a work plan later
