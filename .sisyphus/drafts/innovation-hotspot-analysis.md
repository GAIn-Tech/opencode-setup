# Draft: Innovation Hotspot Analysis for OpenCode System

## Requirements (confirmed)
- [User request]: Find new ways to improve system performance, robustness, flexibility, etc. Extensive, high level directions, comprehensive in volume.
- [Scope]: Entire OpenCode monorepo (36+ packages) for AI agent orchestration
- [Goal]: Comprehensive innovation opportunity identification with weighted scoring
- [Method]: Exhaustive parallel discovery using multiple agents and direct tools

## Technical Decisions
- [Scoring model]: Using Innovation Hotspot Score (IHS) = (VarianceNuance ^ wv) * (PotentialValue ^ wp) * (InverseAttention ^ wa) * Confidence
- [Weights]: wv=1.20, wp=1.50, wa=1.35 (adjustable based on findings)
- [Output format]: Structured plan with hotspot ranking, innovation directions, migration strategy
- [Parallel execution]: Launching multiple background agents for different discovery dimensions

## Research Findings
[Will be populated from background agents and direct searches]

## Open Questions
- What specific performance bottlenecks exist in the learning engine and model manager?
- Where are the tightest coupling points that limit flexibility?
- Which subsystems lack adequate resilience patterns?
- What architectural patterns create the most technical debt?
- Where are the biggest opportunities for innovation with reasonable implementation effort?

## Scope Boundaries
- INCLUDE: All packages in packages/, scripts/, plugins/, mcp-servers/, opencode-config/
- INCLUDE: Performance, robustness, flexibility, and extensibility improvements
- EXCLUDE: Pure bug fixing, routine maintenance, cosmetic changes
- EXCLUDE: Breaking changes without clear migration path