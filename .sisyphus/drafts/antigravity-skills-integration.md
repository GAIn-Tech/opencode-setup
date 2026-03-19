# Draft: Antigravity Awesome Skills Integration

## Requirements (confirmed)
- Integrate skills from antigravity-awesome-skills repo (1,272 skills, v8.2.0)
- Full synergy with existing 25 skills — multi-skill workflow linkage
- Upgrade skill triggering beyond keyword-only to include semantic/abstracted recognition
- Avoid semantic gaps where functionally identical requests miss skill matches

## Technical Decisions (confirmed)
- **Semantic matching**: Synonym/Concept Tables (zero runtime cost, deterministic, no external deps)
- **Interconnections**: Auto-Infer + Manual Override (auto-generate graph from category/tag similarity, manual review critical paths)
- **Cold start**: Tiered Defaults (variable success_rate based on category relevance, curated skills start higher)

## Research Findings

### Source Repo (antigravity-awesome-skills)
- 1,272 skills in SKILL.md format (YAML frontmatter + markdown body)
- Categories: architecture(82), business(56), data-ai(235+), development(300+), general(150+), infrastructure(200+), security(100+), testing(80+), workflow(60+), uncategorized(100+)
- bundles.json: 20+ role-based collections, workflows.json: 5+ playbooks, aliases.json
- Universal SKILL.md format

### Existing Skill Infrastructure (opencode-setup)
- 25 skills in opencode-config/skills/ with SKILL.md + registry.json
- registry.json: per-skill synergies[], dependencies[], conflicts[], triggers[], selectionHints
- 7 workflow profiles, 14 categories
- skill-orchestrator-runtime: trigger 0.4 + category 0.3 + synergy 0.3
- SkillRL: UCB/epsilon-greedy/greedy with success_rate tracking

---

## ARCHITECTURAL FEASIBILITY ASSESSMENT (Oracle)

### Component-by-Component Verdict

| # | Component | Verdict | Breaking Point | Key Issue |
|---|-----------|---------|---------------|-----------|
| 1 | SkillBank _matchesContext() | **BLOCKER** | ~200-300 perf, quality broken earlier | success_rate>0.7 fallback = match-all; pre-tokenize keywords |
| 2 | SkillRL UCB/selectSkills() | **BLOCKER** | ~100 for RL learning | UCB only reranks ≤5 candidates; 1,272 needs 90,900 events to sample once |
| 3 | registry.json + syncWithRegistry() | CAUTION | ~1k+ (diff pain) | 80k line JSON parse at startup OK; default success_rate=0.75 triggers match-all |
| 4 | Synergy/Dependency/Conflict Graph | **BLOCKER** | O(n²) if unbounded | Runtime code does NOT consume deps/synergies/conflicts from registry |
| 5 | skill-orchestrator-runtime | **BLOCKER** | ~100-200 LLM scoring | Can't inject/score 1,272 candidates; attention collapse |
| 6 | Context Budget | CAUTION→**BLOCKER** | naive injection kills budget | 1-line/skill × 1,272 = ~19k-38k tokens; full metadata = hundreds of thousands |
| 7 | LearningEngine | CAUTION | ~5k patterns | shouldWarn loops all patterns; per-skill patterns grow linearly |
| 8 | ExplorationRLAdapter | CAUTION | model×category count | Field mismatch: skill_used vs skills_used — feedback likely doesn't work |
| 9 | Meta-KB Adjustments | **GO** | meta-KB index size | Only examines selected skills (≤5); constant scaling |
| 10 | Governance Scripts | CAUTION | ~1k directories | consolidate-skills.mjs: full directory copy/delete, regex YAML parsing |

### Oracle's Verdict
- **1,272 skills is a BLOCKER** for meaningful runtime orchestration under current architecture
- **Max safe WITHOUT architectural changes**: 200-300 for performance, **50-100 for quality/learnability**
- **Feasible ONLY with**: indexed retrieval + hard candidate caps (profiles/tiers/top-K)

### Required Architectural Fixes (even for ~86 skills)
1. Remove `success_rate > 0.7` fallback match in _matchesContext()
2. Replace keyword matching with indexed scored retrieval (token→skills) + top-K cap
3. Stop injecting "available skills" wholesale — enforce tier/profile selection
4. Make SkillRL exploration hierarchical (profile/category → skill)
5. Implement synergy/dependency/conflict as bounded adjacency lists
6. Fix ExplorationRLAdapter field mismatch (skill_used vs skills_used)
7. Add caps/aggregation to LearningEngine pattern storage
8. Refactor governance scripts for incremental operation

---

## SKILL REDUNDANCY & QUALITY AUDIT (Explore Agent)

### Deduplication Results
- **Exact duplicates with existing 25**: 14 skills (brainstorming, TDD, systematic-debugging, code review, git worktrees, etc.)
- **Functional duplicates**: 45-60 skills (8+ debugging variants, 4+ code review, 3+ testing, 3+ git)
- **Irrelevant**: 10-15 skills (Portuguese legal, niche tools, deprecated)
- **Total SKIP**: 129-144 skills

### Quality Distribution
- HIGH (substantive, clear criteria, actionable): 35-40%
- MEDIUM (good structure, some gaps): 50-55%
- LOW (thin, vague): 5-10%
- JUNK: <1%

### After Filtering
- **Must-Have** (fill clear gaps, HIGH quality): **54 skills**
- **Nice-to-Have** (useful, MEDIUM quality): **32 skills**
- **Skip** (redundant/irrelevant/low quality): **129-144 skills**

### Must-Have Skills by Domain
- Architecture & Design (7): C4 models, DDD, event-sourcing
- Security (6): auditing, pentesting, OWASP, vulnerability scanning
- DevOps (6): Docker, K8s, Terraform, AWS, Azure
- Data & AI (6): RAG, LLM ops, ML engineering, prompt optimization
- Frontend (5): React, Vue, Angular, accessibility, Tailwind
- Backend (5): FastAPI, Django, Laravel, Go, Rust
- Database (4): migration, DDD patterns, Postgres
- Product & Business (5): pricing, GTM, competitive analysis
- Testing & QA (3): E2E, accessibility, performance testing
- Code Quality (2): linting, tech debt assessment

---

## STRATEGIC ALIGNMENT

**Happy coincidence**: The architectural analysis says max safe = 50-100 skills for quality.
The audit says must-have = 54 skills, total candidates = 86 (with nice-to-have).
**These numbers align perfectly.** 86 skills is within the safe zone with minor architectural fixes.

---

## Decisions (ALL CONFIRMED)
1. **Scope**: 54 must-have skills ONLY (skip 32 nice-to-have for now)
2. **Architecture**: Same unified plan — arch fixes Wave 1, skill import Wave 2+
3. **Testing**: TDD (RED-GREEN-REFACTOR for arch fixes and matching logic)
4. **Format conversion**: Required (antigravity SKILL.md → our SKILL.md + registry.json entries)
5. **Bundles**: YES — import relevant bundles as new workflow profiles
6. **Semantic matching**: Synonym Tables + Domain Heuristics (zero runtime cost, deterministic)
7. **Interconnections**: Auto-Infer + Manual Override
8. **Cold start**: Tiered Defaults (variable success_rate by category relevance)

## Scope Boundaries
- INCLUDE: 4 architectural fixes (blockers), semantic matching layer with synonym+heuristic tables, 54 skill import pipeline, format conversion, interconnection wiring (synergies/deps/conflicts), bundle import as workflow profiles, TDD throughout, governance script updates
- EXCLUDE: 32 nice-to-have skills (can add later), wholesale 1,272 import, external embedding models, full concept graph taxonomy, new MCP servers
