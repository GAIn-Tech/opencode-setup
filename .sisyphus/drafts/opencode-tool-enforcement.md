# Draft: OpenCode Tool Usage Enforcement Implementation

## Current Status
Phase 1 work plan completed and saved in `.sisyphus/drafts/phase1-enforcement-work-plan.md`. The plan covers:

### Phase 1 Components (High-Value Quick Wins)
1. **Risk-Based Classification** (Tasks 1.1.1-1.1.3)
   - Task risk bands: CRITICAL, HIGH, MEDIUM, LOW
   - Risk classification logic with wildcard support
   - Mandatory tool sequences for specific task types

2. **Enforcement Module** (Tasks 1.1.2-1.1.3)
   - Configurable enforcement per risk band
   - Minimum tool requirements
   - Tool family matching
   - Warning vs failure behavior

3. **Skill Execution Tracking** (Tasks 1.2.1-1.2.2)
   - Split selected_count vs executed_count
   - Track actual skill execution vs selection
   - Tool usage tracking
   - Integration with recordToolUsage (currently unused)

4. **Dashboard Metrics** (Task 1.2.3)
   - Dual metrics display (selected vs executed)
   - Skill execution analytics
   - Low execution rate identification
   - High value skill highlighting

## User Decision Confirmed
**Preferred Approach**: Full Phase 1 Implementation - Complete all Phase 1 tasks as a unit for comprehensive enforcement

### Implementation Strategy
- Complete all 6 Phase 1 tasks together (1.1.1-1.2.3)
- Deliver comprehensive enforcement system
- Enable proper testing across integrated components
- More complex first release but provides complete value

### Waiting for Key Information
1. **Test Infrastructure Analysis** (background task running)
   - Determines whether TDD approach is feasible
   - Guides testing strategy (tests-first vs tests-after)
   - Influences task structure and acceptance criteria

2. **OpenCode Pattern Analysis** (background task running)
   - Informs how to structure enforcement modules
   - Reveals existing error handling, validation patterns
   - Shows how to integrate with existing infrastructure

### Testing Strategy
- Need to verify OpenCode's current test infrastructure
- Determine if TDD approach is appropriate
- Create integration tests for enforcement features

### Open Questions
1. **Are there existing test frameworks/infrastructure in OpenCode?**
2. **Should we follow TDD (test-first) or implement-then-test?**
3. **Any existing enforcement patterns we should follow?**
4. **Timeline expectations? (Phase 1 plan shows 3 weeks)**
5. **Risk tolerance for breaking changes?**

## Next Actions Needed
1. Investigate OpenCode test infrastructure
2. Decide implementation order
3. Clarify testing approach
4. Plan for potential breaking changes
5. Set up monitoring for enforcement effectiveness