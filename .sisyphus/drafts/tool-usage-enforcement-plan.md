# Implementation Plan: OpenCode Tool Usage Enforcement

## Executive Summary
This plan addresses the root causes of sparse tool/skill usage in OpenCode identified in the analysis: **advisory wiring + weak enforcement + telemetry quality drift**. The plan implements phased enforcement mechanisms while maintaining OpenCode's fail-open resilience philosophy through risk-based enforcement bands.

## Phase 1: High-Value Quick Wins

### 1.1 Add Enforcement Layer for High-Confidence Classes
**Objective**: Require minimum tool usage for high-risk scenarios (debugging, testing, security).

**Implementation Tasks**:

#### Task 1.1.1: Define High-Risk Task Classification
```
File: packages/opencode-integration-layer/src/orchestration-policy.js
Changes:
- Add `riskBand` classification function
- Define mapping: task_type → risk_band (HIGH, MEDIUM, LOW)
- HIGH risk: security_*, debug_*, test_*, critical_*
- MEDIUM risk: refactor_*, analysis_*, build_*
- LOW risk: all others
```

#### Task 1.1.2: Implement Risk-Based Enforcement
```
File: packages/opencode-integration-layer/src/index.js
Changes:
- Add enforceToolUsage(task, recommendedTools, riskBand) function
- HIGH risk: require at least 1 recommended tool from core families
- MEDIUM risk: log warning if 0 recommended tools used
- LOW risk: no enforcement (maintain current behavior)
```

#### Task 1.1.3: Add Mandatory Tool Sequences
```
File: packages/opencode-integration-layer/src/tool-sequences.js
Changes:
- Define mandatory sequences per task type:
  * debug_*: [systematic-debugging skill, lsp_diagnostics tool]
  * security_*: [security skill family, grep tool for pattern scanning]
  * analysis_*: [ast_grep_search or lsp_symbols]
```

### 1.2 Fix Skill Usage Accounting
**Objective**: Distinguish between skill selection and actual execution.

**Implementation Tasks**:

#### Task 1.2.1: Split Skill Metrics
```
File: packages/opencode-skill-rl-manager/src/index.js
Changes:
- Add executed_count field alongside selected_count
- Update learnFromOutcome() to track executed skills separately
- Modify updateSuccessRate() to use executed_count for rate calculation
```

#### Task 1.2.2: Add Execution Tracking
```
File: packages/opencode-integration-layer/src/index.js
Changes:
- Modify executeTaskWithEvidence() to record actual tool execution
- Add trackSkillExecution(skillName, taskType, success) function
- Update metrics collection to differentiate selection vs execution
```

#### Task 1.2.3: Update Dashboard Metrics
```
File: packages/opencode-dashboard/src/app/skills/page.tsx
Changes:
- Add dual metrics display: selected vs executed
- Visualize execution rate percentage
- Highlight skills with high selection but low execution rates
```

### Acceptance Criteria for Phase 1
1. **HIGH risk tasks**: ≥80% tool usage compliance (measured by executed tools)
2. **Skill execution tracking**: Accurate distinction between selected vs executed
3. **No regression**: LOW risk tasks maintain current fail-open behavior
4. **Performance impact**: <5% overhead for enforcement checks

## Phase 2: Critical Integration Fixes

### 2.1 Wire recordToolUsage() into Execution Flow
**Objective**: Connect tier promotion/demotion to actual runtime data.

**Implementation Tasks**:

#### Task 2.1.1: Fix recordToolUsage Integration
```
File: packages/opencode-integration-layer/src/index.js
Changes:
- Modify executeTaskWithEvidence() to call recordToolUsage()
- Pass actual tool execution data, not just recommendations
- Update function signature: recordToolUsage(taskId, executedTools, outcome)
```

#### Task 2.1.2: Implement Tier Promotion/Demotion Logic
```
File: packages/opencode-skill-rl-manager/src/index.js
Changes:
- Add promoteTier(toolName, successCount) and demoteTier(toolName, failureCount)
- Connect to recordToolUsage() callbacks
- Implement hysteresis to prevent tier oscillation
```

#### Task 2.1.3: Add Tier-Aware Tool Selection
```
File: packages/opencode-integration-layer/src/orchestration-policy.js
Changes:
- Modify tool selection to consider current tier levels
- Prioritize higher-tier tools for similar tasks
- Add fallback logic when top-tier tools unavailable
```

### 2.2 Add Telemetry Sanitizer
**Objective**: Clean tool usage metrics to improve learning signal quality.

**Implementation Tasks**:

#### Task 2.2.1: Implement Tool Validation
```
File: packages/opencode-tool-usage-tracker/src/validator.js
Changes:
- Add validateToolName(toolName) function
- Check against known tool registry
- Normalize tool name variants (e.g., "bash" vs "Bash")
```

#### Task 2.2.2: Add Category Sanitization
```
File: packages/opencode-tool-usage-tracker/src/index.js
Changes:
- Add sanitizeMetrics(metrics) function
- Collapse unknown categories into "unknown" bucket
- Filter invalid tool entries before metrics update
```

#### Task 2.2.3: Implement Real-Time Validation
```
File: packages/opencode-integration-layer/src/index.js
Changes:
- Add pre-execution tool validation
- Log warnings for unknown/invalid tool usage
- Option to block execution for HIGH risk tasks with invalid tools
```

### 2.3 Fix Async Learning Advice Path
**Objective**: Unify sync/async learning advice handling.

**Implementation Tasks**:

#### Task 2.3.1: Fix Model-Router Legacy Path
```
File: packages/opencode-model-router-x/src/index.js
Changes:
- Modify line 1407: implement proper async/await for learning advice
- Add timeout with graceful degradation (not fail-open)
- Log when learning advice unavailable vs intentionally skipped
```

#### Task 2.3.2: Implement Learning Advice Cache
```
File: packages/opencode-learning-engine/src/advice-cache.js
Changes:
- Add TTL-based cache for learning advice
- Cache key: task_type + context_hash
- Stale-while-revalidate pattern for async advice
```

#### Task 2.3.3: Add Synchronization Layer
```
File: packages/opencode-integration-layer/src/learning-sync.js
Changes:
- Implement sync/async advice unification
- Provide consistent interface regardless of backend timing
- Fallback to cached advice when async unavailable
```

### Acceptance Criteria for Phase 2
1. **recordToolUsage integration**: Called for 100% of task executions
2. **Telemetry quality**: Invalid tool entries reduced by ≥90%
3. **Tier promotion/demotion**: Working based on actual execution data
4. **Async advice handling**: No blind spots in tool recommendations

## Phase 3: Strategic Architecture Improvements

### 3.1 Tighten Policy Mode with Risk Bands
**Objective**: Implement graduated enforcement based on risk assessment.

**Implementation Tasks**:

#### Task 3.1.1: Enhanced Risk Assessment
```
File: packages/opencode-integration-layer/src/risk-assessor.js
Changes:
- Implement multi-factor risk assessment:
  * Task criticality (HIGH/MEDIUM/LOW)
  * Data sensitivity classification
  * System impact potential
  * Historical failure rate
```

#### Task 3.1.2: Graduated Enforcement Policies
```
File: packages/opencode-integration-layer/src/enforcement-policy.js
Changes:
- Define enforcement levels per risk band:
  * CRITICAL: Fail-closed (like VISION mandatory veto)
  * HIGH: Strong enforcement (require specific tools)
  * MEDIUM: Advisory with escalation
  * LOW: Current fail-open behavior
```

#### Task 3.1.3: Dynamic Policy Adjustment
```
File: packages/opencode-learning-engine/src/policy-adjuster.js
Changes:
- Learn from enforcement outcomes
- Adjust risk bands based on historical success/failure
- Implement A/B testing for policy variations
```

### 3.2 Adopt VISION-Style Enforcement for Critical Operations
**Objective**: Selective adoption of fail-closed patterns for highest-risk scenarios.

**Implementation Tasks**:

#### Task 3.2.1: Identify Critical Operations
```
Analysis Task: Audit OpenCode codebase for critical operations:
- Security-sensitive operations (auth, secrets, permissions)
- Destructive operations (delete, drop, truncate)
- High-impact operations (deploy, production changes)
- Learning engine modifications
```

#### Task 3.2.2: Implement Mandatory Veto System
```
File: packages/opencode-security-enforcer/src/mandatory-veto.js
Changes:
- Port VISION's mandatory_veto.py patterns to JavaScript
- Implement fail-closed checks for identified critical operations
- Add Ed25519 signature verification for override commands
```

#### Task 3.2.3: Integrate with Existing Security
```
File: packages/opencode-integration-layer/src/security-integration.js
Changes:
- Connect mandatory veto system to existing security hooks
- Add audit logging for veto checks and overrides
- Implement role-based override permissions
```

### 3.3 Enhanced Tool Usage Analytics
**Objective**: Real-time visibility into tool usage compliance and effectiveness.

**Implementation Tasks**:

#### Task 3.3.1: Compliance Dashboard
```
File: packages/opencode-dashboard/src/app/compliance/page.tsx
Changes:
- Real-time tool usage compliance metrics
- Risk band visualization
- Enforcement effectiveness tracking
- Drill-down to specific task types
```

#### Task 3.3.2: Anomaly Detection
```
File: packages/opencode-learning-engine/src/anomaly-detector.js
Changes:
- Detect abnormal tool usage patterns
- Alert on sudden drops in tool compliance
- Identify tool usage outliers
```

#### Task 3.3.3: Predictive Recommendations
```
File: packages/opencode-skill-rl-manager/src/predictive-recommender.js
Changes:
- Predict tool needs based on task context
- Proactively load likely-needed tools
- Learn from successful tool sequences
```

### Acceptance Criteria for Phase 3
1. **Risk-based enforcement**: Clear differentiation between risk bands
2. **Critical operation safety**: Mandatory veto for identified critical operations
3. **Analytics visibility**: Real-time compliance dashboard operational
4. **No performance regression**: <10% overhead for enhanced enforcement

## Implementation Timeline

### Week 1-2: Phase 1 Implementation
- Days 1-3: High-risk task classification and enforcement layer
- Days 4-6: Skill execution tracking implementation
- Days 7-10: Testing and validation
- Days 11-14: Dashboard updates and metrics visualization

### Week 3-4: Phase 2 Implementation
- Days 15-17: recordToolUsage() integration
- Days 18-20: Telemetry sanitizer implementation
- Days 21-24: Async learning advice fixes
- Days 25-28: Integration testing and refinement

### Week 5-6: Phase 3 Implementation
- Days 29-32: Risk assessment and graduated enforcement
- Days 33-36: Critical operations audit
- Days 37-40: Mandatory veto system implementation
- Days 41-44: Analytics dashboard development
- Days 45-48: System integration and testing

### Week 7: Final Integration & Documentation
- Days 49-50: End-to-end testing
- Days 51-52: Performance optimization
- Days 53-54: Documentation updates
- Days 55-56: Rollout planning
- Days 57-58: Monitoring setup
- Days 59-60: Final review and deployment

## Success Metrics

### Quantitative Metrics
1. **Tool Usage Compliance**: Increase from current ~25% to:
   - Phase 1: ≥50% for HIGH risk tasks
   - Phase 2: ≥70% for HIGH risk tasks
   - Phase 3: ≥85% for HIGH risk tasks

2. **Advanced Tool Usage**: Increase LSP/AST tool usage from 1.9% to:
   - Phase 1: ≥5%
   - Phase 2: ≥8%
   - Phase 3: ≥12%

3. **Skill Execution Rate**: Increase from current ~25% to:
   - Phase 1: ≥40% actual execution
   - Phase 2: ≥60% actual execution
   - Phase 3: ≥80% actual execution

4. **Telemetry Quality**: Reduce invalid tool entries:
   - Phase 2: ≥90% reduction
   - Phase 3: ≥95% reduction

### Qualitative Metrics
1. **Developer Experience**: No degradation in ease of use for LOW risk tasks
2. **System Resilience**: Maintain current fail-open behavior for non-critical paths
3. **Safety Improvement**: Enhanced protection for critical operations
4. **Learning Effectiveness**: Improved skill/tool recommendations accuracy

## Risk Management

### Technical Risks
1. **Performance Overhead**:
   - Mitigation: Implement lazy evaluation for enforcement checks
   - Mitigation: Cache risk assessments for similar tasks
   - Mitigation: Profile and optimize hot paths

2. **False Positives in Enforcement**:
   - Mitigation: Gradual rollout with monitoring
   - Mitigation: Override mechanisms for edge cases
   - Mitigation: Learn from false positives to improve rules

3. **Integration Complexity**:
   - Mitigation: Phase-based implementation
   - Mitigation: Comprehensive testing at each phase
   - Mitigation: Fallback to current behavior on failure

### Operational Risks
1. **Developer Resistance**:
   - Mitigation: Clear communication of benefits
   - Mitigation: Maintain current behavior for LOW risk tasks
   - Mitigation: Provide opt-out mechanisms during transition

2. **Learning Curve**:
   - Mitigation: Incremental feature introduction
   - Mitigation: Comprehensive documentation
   - Mitigation: Tooltips and guidance in UI

3. **Monitoring Gap**:
   - Mitigation: Enhanced telemetry from Day 1
   - Mitigation: Real-time dashboard for compliance tracking
   - Mitigation: Alerting for abnormal patterns

## Conclusion

This implementation plan provides a structured approach to fixing OpenCode's sparse tool/skill usage problem by addressing the root causes identified in the analysis. By implementing phased enforcement mechanisms, fixing critical integration gaps, and adopting selective fail-closed patterns from VISION, OpenCode can significantly improve tool usage compliance while maintaining its core resilience philosophy.

The plan balances immediate improvements (Phase 1) with strategic architectural evolution (Phases 2-3), ensuring each step delivers measurable value while building toward a more robust, safety-aware system architecture.