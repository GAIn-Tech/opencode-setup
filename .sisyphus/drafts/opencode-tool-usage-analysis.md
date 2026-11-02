# OpenCode Tool/Skill Usage Analysis: Sparse Patterns Investigation

## Executive Summary
Analysis reveals sparse tool/skill usage in OpenCode is not primarily due to "missing" tools/skills, but stems from **advisory wiring + weak enforcement + telemetry quality drift**. OpenCode's orchestration path is explicitly fail-open/advisory, resulting in recommendations that don't reliably translate into execution behavior. Comparison with VISION shows stark differences in enforcement philosophy: VISION uses fail-closed mandatory enforcement while OpenCode prioritizes continuity/resilience.

## Key Findings

### 1. Fundamental Architecture Issue: Advisory-Only Control Plane
**Evidence**:
- `packages/opencode-integration-layer/src/index.js:1631` - Explicit fail-open design
- `packages/opencode-integration-layer/src/index.js:1642` - Advisory warnings only
- `packages/opencode-integration-layer/src/orchestration-policy.js:161,179` - Recommendations without enforcement

**Impact**: Skills/tools can be recommended but are never required, leading to sparse actual usage despite broad availability.

### 2. Measurement Mismatch: Selection vs Execution
**Evidence**:
- `packages/opencode-skill-rl-manager/src/index.js:248` - Skills counted as "used" at selection time, not execution time
- `packages/opencode-integration-layer/src/index.js:1725` - Preload/tier output passed as recommendations with no hard enforcement gate

**Impact**: Inflates apparent skill adoption metrics (30 skills marked as "used" but actual execution likely lower).

### 3. Critical Feedback Loop Gaps
**Evidence**:
- `packages/opencode-integration-layer/src/index.js:1012` - `recordToolUsage()` function defined but never called in integration flow
- `packages/opencode-integration-layer/src/index.js:989` - On-demand Tier 2 load path defined but not used anywhere in repo (no call sites)

**Impact**: Tier promotion/demotion lacks real runtime data, weakening the skill recommendation feedback loop.

### 4. Telemetry Quality Issues
**Evidence** (from runtime metrics):
- `C:\Users\jack\.opencode\tool-usage\metrics.json:55` - Tool telemetry with quality noise
- `C:\Users\jack\.opencode\tool-usage\metrics.json:5,49` - Unknown categories and invalid tool names

**Impact**: Dilutes learning signals, making skill/tool recommendations less accurate.

### 5. Actual Tool Usage Patterns (Runtime Evidence)
**Distribution** (from runtime metrics):
- **Core Tools**: bash/read account for 63.6% of invocations
- **Advanced Tools**: LSP/AST tools only 1.9% of usage
- **Other Tools**: Remaining 34.5% spread across other categories

**Skill Usage Statistics**:
- **Total Skills**: 121 skills in SkillRL registry
- **Used Skills**: 30 skills (~24.8%) marked as used
- **Unused Skills**: 91 skills (~75.2%) not used

### 6. Async Mismatch Issues
**Evidence**:
- `packages/opencode-model-router-x/src/index.js:1407` - Model-router legacy path fails open when learning advice is async

**Impact**: Creates blind spots where tool recommendations are missed due to timing mismatches.

## Root Cause Analysis

### Primary Cause: Weak Triggering Mechanisms
**Problem**: Tools/skills have **triggers** (recommendations) but lack **enforcement** mechanisms.

**Examples**:
1. **Debugging Scenarios**: `systematic-debugging` skill is recommended but not required when debugging patterns detected
2. **Security Scenarios**: Security-related tools suggested but not enforced for security-sensitive operations
3. **Code Analysis Scenarios**: LSP/AST tools recommended but rarely required

### Secondary Cause: Telemetry Quality Degradation
**Problem**: Low-quality telemetry data weakens learning signals over time.

**Examples**:
- Invalid tool names in metrics
- Unknown categories diluting pattern recognition
- Missing execution vs selection distinction

### Tertiary Cause: Feedback Loop Disconnects
**Problem**: Critical feedback mechanisms defined but not wired.

**Examples**:
- `recordToolUsage()` function exists but never called
- Tier 2 on-demand loading path unused
- Skill success/failure tracking disconnected from actual execution

## Comparison with VISION Architecture

### VISION's Enforcement Model
**Fail-Closed Philosophy**:
1. **Mandatory Veto**: `C:\Users\jack\work\vision\src\security\mandatory_veto.py:181` - Blocks when enforcement dependency missing
2. **Exception Handling**: `C:\Users\jack\work\vision\src\security\mandatory_veto.py:251` - Exceptions during checks still deny
3. **Default Deny**: `C:\Users\jack\work\vision\src\security\duat_gate.py:224` - Unknown operations deny by default
4. **Isolation Enforcement**: `C:\Users\jack\work\vision\src\security\sandbox.py:220` - Sandbox blocks execution when isolation runtime unavailable

**Key Difference**: VISION prioritizes safety over continuity, OpenCode prioritizes continuity over strict enforcement.

### OpenCode's Continuity Model
**Fail-Open Philosophy**:
1. **Advisory Recommendations**: Warnings but no blocking
2. **Graceful Degradation**: Continue with fallbacks when recommendations unavailable
3. **Resilience Focus**: System continues operating even with suboptimal tool usage
4. **Learning-Optimized**: Focus on improving over time rather than strict initial compliance

## Recommendations for Improvement

### Phase 1: High-Value Quick Wins
1. **Add Enforcement Layer for High-Confidence Classes**:
   - **Target**: Debugging, testing, security scenarios
   - **Mechanism**: Require minimum tool family usage or inject mandatory call sequences
   - **Acceptance Criteria**: 80%+ tool usage compliance for high-risk scenarios

2. **Fix Skill Usage Accounting**:
   - **Target**: `packages/opencode-skill-rl-manager/src/index.js`
   - **Change**: Split metrics into `selected_count` vs `executed_count`
   - **Impact**: Accurate skill adoption tracking

### Phase 2: Critical Integration Fixes
3. **Wire `recordToolUsage()` into Execution Flow**:
   - **Target**: `packages/opencode-integration-layer/src/index.js`
   - **Change**: Call `recordToolUsage()` from `executeTaskWithEvidence()`
   - **Impact**: Real runtime data for tier promotion/demotion

4. **Add Telemetry Sanitizer**:
   - **Target**: Tool usage metrics pipeline
   - **Change**: Reject invalid tool keys, collapse unknown variants before metrics update
   - **Impact**: Cleaner learning signals

### Phase 3: Strategic Architecture Improvements
5. **Tighten Policy Mode with Risk Bands**:
   - **Target**: Orchestration policy system
   - **Change**: Keep fail-open globally, but allow fail-closed per risk band/task type
   - **Impact**: Gradual enforcement adoption based on risk assessment

6. **Unify Learning Advice Path**:
   - **Target**: Sync vs async learning advice handling
   - **Change**: Remove legacy fallback blind spots in model-router path
   - **Impact**: Consistent tool recommendations across all execution paths

### Phase 4: Long-Term Architecture Evolution
7. **Adopt VISION-Style Enforcement for Critical Operations**:
   - **Target**: Security-sensitive and high-risk operations
   - **Change**: Implement mandatory veto system for critical OpenCode operations
   - **Impact**: Enhanced safety for high-risk scenarios

8. **Enhanced Tool Usage Analytics**:
   - **Target**: Dashboard and monitoring systems
   - **Change**: Real-time tool usage compliance tracking
   - **Impact**: Visibility into enforcement effectiveness

## Implementation Considerations

### Technical Constraints
1. **Backward Compatibility**: Must maintain existing fail-open behavior for non-critical paths
2. **Performance Impact**: Enforcement checks must be lightweight
3. **Integration Complexity**: Need to work with existing skill/tool ecosystem
4. **Learning Integration**: Must not break existing learning feedback loops

### Risk Management
1. **Gradual Rollout**: Start with highest-value, lowest-risk enforcement scenarios
2. **Monitoring**: Enhanced telemetry for enforcement effectiveness
3. **Fallback Mechanisms**: Graceful degradation when enforcement fails
4. **User Feedback**: Clear communication about new enforcement requirements

### Success Metrics
1. **Tool Usage Compliance**: Increase from current ~25% to >75% for targeted scenarios
2. **Skill Activation Rate**: Increase from 24.8% to >50% actual execution
3. **Advanced Tool Usage**: Increase LSP/AST tool usage from 1.9% to >10%
4. **Telemetry Quality**: Reduce invalid tool entries by 90%

## Conclusion

The sparse tool/skill usage in OpenCode stems from architectural choices favoring continuity over strict enforcement. While this provides resilience, it weakens the effectiveness of the skill/tool recommendation system. By selectively adopting enforcement mechanisms from VISION's architecture and fixing critical feedback loop gaps, OpenCode can maintain its resilience while dramatically improving tool usage compliance.

**Key Insight**: The problem is not missing tools/skills, but missing **enforcement mechanisms** to ensure recommended tools/skills are actually used.

**Next Steps**: Begin with Phase 1 quick wins (enforcement layer for high-confidence classes, skill usage accounting fix) to demonstrate immediate value while planning longer-term architectural improvements.