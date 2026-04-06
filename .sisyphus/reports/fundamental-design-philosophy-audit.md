# Fundamental Design Philosophy Audit

**Date**: 2026-04-05  
**Scope**: OpenCode ecosystem — orchestration, tool usage, delegation, runtime authority  
**Method**: Repo evidence + external frontier research + comparative analysis  

---

## Executive Summary

OpenCode is not primitive. It is **under-converged**.

The system contains many advanced pieces — authority resolvers, threshold contracts, eval harnesses, model benchmarking, exploration logic, dashboard APIs, plugin supervision, liveness detection, telemetry explainability — but too many remain advisory, optional, duplicated, or only partially wired into actual runtime authority.

The deepest inefficiency is not missing features or bad code. It is this:

> **You keep building powerful subsystems, then allowing the runtime to treat them as advisory neighbors instead of operational authority.**

This creates:
- Duplicated truth surfaces
- Soft compliance on critical seams
- Weak learning loops
- Underused advanced tooling
- Expensive architectural complexity with diluted payoff

Compared to the current frontier (Anthropic, OpenHands, Claude Code, SWE-agent, GitHub Copilot workflows), OpenCode appears:
- **Ahead** on modularity, ecosystem breadth, resilience mindset, and observability affordances
- **Behind** on eval-driven orchestration, explicit planner/executor/verifier separation, context engineering discipline, and outer-loop automation productization
- **Different** in ways that may be intentional: stronger fail-open resilience, richer config surfaces, more experimental package diversity

---

## Part 1: Ranked Inefficiencies

### #1: Fail-Open as Default Philosophy (Not Just Edge Case)

**Severity**: High  
**Evidence**:
- `packages/opencode-integration-layer/src/index.js:1633-1647` — context budget checks are explicitly advisory-only and "Never block"
- `scripts/runtime-skill-tracker.mjs` — exits 0 on error (`main().catch(() => process.exit(0))`)
- `opencode-config/skills/context-governor/SKILL.md` — governor is advisory and must not block operations
- Multiple historical plans/docs normalize try/catch fail-open imports as intended architecture

**Why it's inefficient**:
- Preserves liveness well, but normalizes weak guarantees on critical seams
- The system keeps running, but often without strong truth, strong enforcement, or strong feedback
- Creates a culture where "it didn't crash" is mistaken for "it worked correctly"

**What the frontier does differently**:
- Fail-open at dependency boundaries, fail-loud at core orchestration seams
- Explicit degraded-mode contracts with visible state, not silent fallbacks
- Measurable compliance: when recommendations are ignored, it's an event, not a non-event

---

### #2: Advanced Subsystems Not Fully Authoritative

**Severity**: High  
**Evidence**:
- `packages/opencode-runtime-authority/src/index.js` — clean authority resolver, but defaults only cover single primary model per category
- `packages/opencode-integration-layer/src/context-bridge.js` — presents as mandatory enforcement, but runtime still uses advisory budget checks
- `packages/opencode-model-manager/src/monitoring/alert-manager.js` — still carries local threshold semantics instead of importing shared invariant layer
- `packages/opencode-model-router-x/src/index.js:548-585` — initializes large orchestration subsystem, falls back to legacy scoring if init fails

**Why it's inefficient**:
- You pay the complexity cost of advanced modules without consistently getting their leverage benefits
- Creates split-brain truth: multiple modules claim authority, but runtime behavior reflects older assumptions
- Makes the system conceptually advanced but operationally timid

**What the frontier does differently**:
- One clear authority contract per domain, enforced not suggested
- Smart subsystems are on the real control path, not optional neighbors
- Fallback paths exist but are explicitly degraded, not silently equivalent

---

### #3: Tool/Skill Orchestration Richer in Selection Than Enforcement

**Severity**: Medium-High  
**Evidence**:
- `packages/opencode-plugin-preload-skills/README.md` — explicitly says `selectTools()` returns selected surface, host must apply it
- `packages/opencode-plugin-preload-skills/src/index.js` — promotion/demotion depends on host-mediated usage reporting
- Existing tool-usage analysis concluded sparse adoption driven by advisory wiring + weak enforcement + telemetry drift
- `packages/opencode-integration-layer/src/index.js` — skill selection happens, but compliance is not measured

**Why it's inefficient**:
- You optimize for recommendation quality, not runtime behavior quality
- Advanced tools sit unused not because they're bad, but because nothing makes them matter
- Creates a "tool graveyard" problem: many capabilities, low actual leverage

**What the frontier does differently**:
- Tool selection is coupled with usage measurement and compliance tracking
- Non-compliance is visible and consequential, not invisible
- Tools are eval-driven: built, measured, and optimized against real task evaluations

---

### #4: Eval and Observability Exist But Don't Govern Enough

**Severity**: Medium-High  
**Evidence**:
- `packages/opencode-eval-harness/README.md` — benchmark harness exists
- `packages/opencode-model-benchmark/README.md` — HumanEval, MBPP, SWE-bench pipeline exists
- `packages/opencode-dashboard/API.md` — frontier status, learning stats, memory graph, retrieval quality, plugin evaluation, model lifecycle
- `packages/opencode-plugin-lifecycle/src/index.js` — health evaluation and quarantine logic exists

**Why it's inefficient**:
- You built measurement, but haven't made measurement authoritative
- Observability without authority just documents drift; it doesn't prevent it
- Rich dashboard APIs exist, but orchestration decisions don't appear strongly governed by them

**What the frontier does differently**:
- Evals shape routing, tool quality, and workflow evolution, not just sit off to the side
- Operator visibility actively governs runtime behavior, not just monitors it
- Benchmark results drive model promotion/demotion, not just documentation

---

### #5: Static Policy Short-Circuits Dynamic Intelligence

**Severity**: Medium  
**Evidence**:
- `packages/opencode-model-router-x/src/index.js:1301-1331` — hard-filters Anthropic models before scoring
- Rich scoring/exploration/orchestration exists, but static constraints can dominate it
- Category→model mappings in config may narrow delegation diversity despite richer routing machinery

**Why it's inefficient**:
- You built sophisticated routing, then partially bypass it with static rules
- Reduces the practical upside of having advanced machinery at all
- Creates a system that is smarter than it's allowed to be

**What the frontier does differently**:
- Static constraints are minimal and explicit; dynamic intelligence does the heavy lifting
- Hard constraints are rare, documented, and reviewed; soft constraints are measured and adjusted
- Exploration is built into the routing path, not bolted on as an afterthought

---

### #6: Context Engineering Not a First-Class Runtime Discipline

**Severity**: Medium  
**Evidence**:
- Context budget management exists but is advisory-only
- Preload-skills system optimizes selection, not just-in-time retrieval
- No explicit compaction, structured note-taking, or sub-agent decomposition patterns visible in core orchestration

**Why it's inefficient**:
- Context is treated as a budget to track, not a scarce resource to engineer
- Over-eager preloading may waste tokens on irrelevant capabilities
- Long-horizon tasks lack explicit context discipline

**What the frontier does differently**:
- Context engineering is a core discipline, not an afterthought
- Just-in-time retrieval over static preload
- Compaction, structured memory, and sub-agent architectures for long tasks
- Hybrid context strategies tuned to task type

---

### #7: Weaker Outer-Loop Automation Philosophy

**Severity**: Medium  
**Evidence**:
- System focuses on inner-loop orchestration (task execution, skill selection, routing)
- Less evidence of outer-loop automation: PR review, vulnerability fixing, migration workflows, incident triage
- Dashboard provides visibility, but not autonomous outer-loop workflow productization

**Why it's inefficient**:
- Inner-loop optimization has diminishing returns without outer-loop leverage
- Operator time is spent monitoring, not delegating
- Misses the scalability advantage of autonomous outer-loop workflows

**What the frontier does differently**:
- OpenHands: secure sandboxed runtime + autonomous outer-loop workflows at scale
- Claude Code: PR-ready outcomes, parallel tasks, working-pull-request delivery
- GitHub Copilot: reusable workflow primitives, validation gates, inner/outer-loop separation

---

## Part 2: Naive Assumptions

| # | Assumption | Reality |
|---|------------|---------|
| 1 | "If it's observable, that's almost enough." | Observability without authority just documents drift. |
| 2 | "If smarter modules exist, the system is strategically advanced." | Not unless they're on the real control path. |
| 3 | "Fail-open is safer than fail-loud." | Only at dependency boundaries. At core seams, it hides degraded truth. |
| 4 | "Recommendation quality will naturally become usage quality." | It usually doesn't without enforcement, incentives, or explicit compliance measurement. |
| 5 | "Having many frontier-style packages means we are near the frontier." | Frontier advantage now comes from loop closure, verification, context discipline, and scaffold quality — not just subsystem count. |
| 6 | "More tools and skills = more capability." | Anthropic's guidance: more tools don't always lead to better outcomes. Agents have limited context; thoughtful, targeted tools outperform broad toolsets. |
| 7 | "If tests demonstrate advanced ideas, the system has them." | Tests show potential, not production reality. Entourage-v2 tests show quota-aware routing and uncertainty-triggered evidence capture, but runtime defaults still normalize advisory handling. |

---

## Part 3: Strategic Modernization Map

### Copy Now (Mature, High-Leverage, Low-Risk)

| What | Why | Evidence |
|------|-----|----------|
| **Eval-driven tool optimization** | Anthropic's strongest finding: tools built and optimized against real evaluations dramatically outperform intuition-built tools. | Anthropic engineering blog (Sep 2025): "Writing effective tools for agents — with agents" |
| **Explicit planner/executor/verifier separation** | Clean separation reduces accidental complexity and makes verification first-class. | GitHub Copilot workflow guidance (Oct 2025), PEV architecture patterns |
| **Context engineering as operating discipline** | Just-in-time retrieval, compaction, structured memory are now table stakes for long-horizon tasks. | Anthropic context-engineering guidance (Sep 2025) |
| **Measurable compliance on critical seams** | When recommendations are ignored, it should be an event, not a non-event. | Internal evidence: advisory-only budget checks, unmeasured skill compliance |
| **Tool description/spec quality** | Anthropic achieved SOTA on SWE-bench Verified partly through careful tool description engineering. | Anthropic SWE-bench writeup (Jan 2025) |

### Postpone (Experimental, High-Risk, or Premature)

| What | Why | When to Revisit |
|------|-----|-----------------|
| **Trained critic-model selection** | OpenHands' approach is powerful but requires significant training infrastructure and data. | When you have enough trajectory data and dedicated ML infrastructure |
| **Inference-time scaling (best-of-N)** | Expensive in token costs; only justified for high-value outer-loop tasks. | When you have clear ROI cases for multi-attempt workflows |
| **Full fail-closed migration** | Would break too much existing behavior; needs phased approach. | After authority/threshold unification is complete |
| **Complete config consolidation** | Config fragmentation serves real use cases; consolidation should be gradual. | After runtime authority contract is stable and proven |

### Keep as Intentional Differentiation

| What | Why It's Valuable | How to Leverage |
|------|-------------------|-----------------|
| **Fail-open resilience at edges** | Keeps system alive during partial outages; good for dependency boundaries. | Make it explicit: "fail-open here by design, fail-loud there by contract" |
| **Rich config surfaces** | Per-category fallbacks, agent-specific models, MCP toggles provide flexibility. | Ensure runtime actually exploits this richness consistently |
| **Experimental package diversity** | Broad surface area enables rapid exploration and innovation. | Converge the best experiments into authoritative paths; archive the rest |
| **Observability affordances** | Dashboard APIs, retrieval quality, RL state, plugin evaluation are ahead of many systems. | Make them governance inputs, not just monitoring outputs |
| **Modular ecosystem architecture** | 36+ packages enable composability and independent evolution. | Add convergence layer: one authority contract per domain, enforced not suggested |

---

## Part 4: The Philosophy Shift

### From: Capability Accumulation
- Build more packages
- Add more tools and skills
- Create more observability surfaces
- Preserve liveness at all costs
- Keep options open with advisory semantics

### To: Authoritative Loop Closure
- Fewer advisory-only core seams
- More explicit contract layers
- Measurable compliance on critical paths
- Eval-governed orchestration
- Strong distinction between:
  - **Resilience at the edges** (fail-open is fine here)
  - **Authority in the center** (fail-loud is required here)

### The One-Sentence Version

> **Stop building powerful subsystems and letting runtime treat them as advisory neighbors. Start making them operational authority.**

---

## Part 5: Concrete Next Steps

### Immediate (1-2 weeks)
1. **Define one runtime authority contract** — consolidate `opencode-runtime-authority` and `opencode-threshold-invariants` behind one facade
2. **Replace local hardcoded reads** — make `context-bridge.js`, `alert-manager.js`, and `ModelRouter` import from shared authority
3. **Make advisory consumption measurable** — emit compliance events when recommended tools/compression are ignored
4. **Introduce two budget modes** — `warn-only` and `enforce-critical` with explicit enforcement path

### Short-term (2-4 weeks)
5. **Unify category routing semantics** — resolve conflicts between `ModelRouter.route()` category short-circuit and global provider exclusions
6. **Repair preload-skill feedback-loop plumbing** — fix boolean return value assumptions in promotion/demotion
7. **Add architecture fitness tests** — fail CI when core modules bypass authority or threshold contracts
8. **Implement eval-driven tool optimization loop** — use existing eval harness to measure and improve tool quality

### Medium-term (1-2 months)
9. **Context engineering discipline** — just-in-time retrieval, compaction, structured memory for long-horizon tasks
10. **Outer-loop automation surfaces** — PR review, vulnerability fixing, migration workflows, incident triage
11. **Operator-visible governance** — make dashboard metrics actively shape runtime behavior, not just monitor it
12. **Explicit planner/executor/verifier separation** — clean workflow contracts with verification checkpoints

---

## Appendix: Evidence Sources

### Repo Evidence
- `packages/opencode-integration-layer/src/index.js:1628-1667` — advisory-only budget checks
- `packages/opencode-integration-layer/src/context-bridge.js:1-220` — enforcement bridge semantics
- `packages/opencode-model-manager/src/monitoring/alert-manager.js:1-220` — local threshold duplication
- `packages/opencode-model-router-x/src/index.js:1298-1347` — static policy short-circuit
- `packages/opencode-runtime-authority/src/index.js:1-220` — authority resolver design
- `packages/opencode-plugin-preload-skills/src/index.js` — recommendation vs enforcement gap
- `packages/opencode-plugin-lifecycle/src/index.js` — supervision with soft degradation
- `packages/opencode-integration-layer/tests/entourage-v2.test.js` — frontier ideas in tests
- `packages/opencode-eval-harness/README.md` — eval infrastructure
- `packages/opencode-model-benchmark/README.md` — benchmark pipeline
- `packages/opencode-dashboard/API.md` — operator surfaces
- `opencode-config/oh-my-opencode.json` — config richness

### External Sources
- Anthropic: "Writing effective tools for agents — with agents" (Sep 2025)
- Anthropic: "Effective context engineering for AI agents" (Sep 2025)
- Anthropic: "Raising the bar on SWE-bench Verified with Claude 3.5 Sonnet" (Jan 2025)
- GitHub: "How to build reliable AI workflows with agentic primitives and context engineering" (Oct 2025)
- OpenHands: "SOTA on SWE-Bench Verified with Inference-Time Scaling and Critic Model" (Nov 2025)
- OpenHands positioning and product documentation

---

*This audit was conducted through parallel repo exploration, external research, and architectural critique. All findings are backed by concrete evidence, not speculation.*
