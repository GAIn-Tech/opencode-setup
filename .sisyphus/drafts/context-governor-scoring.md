# Context Governor System - Innovation Hotspot Scoring

## VARIANCE_NUANCE (Complexity, contextual nuance, architecture branching, unresolved tradeoffs)
**Score: 0.7/1.0**

Evidence:
- Moderate-high complexity - Active token budget controller tracking per-model, per-session token consumption
- Configurable warn(75%)/error(80%) thresholds with exceeded state
- MCP server and CLI interfaces for integration
- Persistence to ~/.opencode/session-budgets.json
- Integration with learning engine via quota_signal in orchestration advisor
- Economic risk calculation: quotaRisk > 0.4 triggers quota-aware-routing suggestion, fallbackApplied acts as risk multiplier
- Telemetry: tracks remaining budget, percentage used, status (ok/warn/error/exceeded)
- Session management: checkBudget() advisory, consumeTokens() recording, getRemainingBudget() query, resetSession() clearing
- Model-specific budgets: claude-opus-4-6: 180k, claude-sonnet-4-5: 200k, claude-haiku-4-5: 90k, gpt-5: 100k, gemini-2.5-pro: 1,000k
- Focused but sophisticated resource management system

## POTENTIAL_VALUE (Expected impact if solved well)
**Score: 0.75/1.0**

Evidence:
- Direct impact on system efficiency, cost control, and preventing resource exhaustion
- Prevents catastrophic token budget depletion that could halt agent operations
- Potential improvements: better budget forecasting preventing unexpected outages, more granular control per task type
- Engineering impact: automated cost optimization, reduced need for manual budget monitoring
- Business impact: more predictable operational costs, ability to run more agents within budget constraints
- High potential value - prevents operational disruptions and controls costs

## INVERSE_ATTENTION (1 - AttentionDepth)
**Score: 0.55/1.0**

Evidence:
- System shows signs of attention but likely has underexplored potential:
  * Clear documentation in README.md explaining usage, model budgets, thresholds, persistence, API
  * Evidence of integration with learning engine (orchestration advisor uses getQuotaSignal)
  * However, compared to learning engine or model manager, this appears to be a more focused, specialized system
  * The specificity suggests it has received appropriate attention for its core function
  * Opportunities for enhancement exist in predictive budgeting, cross-system integration, more sophisticated economic modeling
  * The system appears solid but not overly complex - suggesting it may have received appropriate attention for its scope

## CONFIDENCE (Evidence quality multiplier)
**Score: 0.9/1.0**

Evidence:
- High - clear README with usage examples, API specifications, model budgets table
- Direct code examination showing implementation matches documentation
- Clear understanding of system purpose and mechanisms

## INNOVATION HOTSPOT SCORE CALCULATION
Formula: IHS = (VarianceNuance ^ wv) * (PotentialValue ^ wp) * (InverseAttention ^ wa) * Confidence
Weights: wv=1.20, wp=1.50, wa=1.35

Calculation:
IHS = (0.7 ^ 1.20) * (0.75 ^ 1.50) * (0.55 ^ 1.35) * 0.9
IHS = (0.637) * (0.614) * (0.427) * 0.9
IHS = 0.150

## Notes for Divergence Phase
- Moderate-high variance nuance suggests focused innovation opportunities
- High potential value indicates meaningful impact if improved (prevents disruptions, controls costs)
- Moderate inverse attention suggests appropriate attention but room for growth in sophistication
- Good confidence in assessment
- Innovation opportunities: predictive budgeting based on historical patterns, integration with learning engine for proactive suggestions, more sophisticated economic modeling, cross-system alerting