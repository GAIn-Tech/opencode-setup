# Phase 1 Work Plan: High-Value Quick Wins

## Overview
Phase 1 focuses on immediate improvements to tool usage enforcement with minimal architectural changes. These quick wins demonstrate value while establishing foundation for Phases 2-3.

## Task Breakdown

### Task 1.1.1: Define High-Risk Task Classification

#### 1.1.1.1: Analyze Current Task Types
**Location**: Review existing task classification in OpenCode
**Files to Examine**:
- `packages/opencode-integration-layer/src/index.js` (task execution patterns)
- `packages/opencode-learning-engine/src/index.js` (task type definitions)
- `.sisyphus/plans/*.md` (historical task patterns)

**Deliverable**: List of task types with frequency and characteristics

#### 1.1.1.2: Implement Risk Band Classification
**File**: `packages/opencode-integration-layer/src/orchestration-policy.js`
**Changes**:
```javascript
// Add to existing policy module
const RISK_BAND_CONFIG = {
  CRITICAL: ['security_auth', 'security_permissions', 'deploy_production', 'critical_data_operations'],
  HIGH: ['debug_*', 'test_*', 'security_*', 'refactor_critical'],
  MEDIUM: ['analysis_*', 'refactor_*', 'build_*', 'test_*'],
  LOW: ['*'] // Catch-all for everything else
};

function classifyTaskRisk(taskType) {
  for (const [band, patterns] of Object.entries(RISK_BAND_CONFIG)) {
    for (const pattern of patterns) {
      if (pattern.endsWith('*') && taskType.startsWith(pattern.slice(0, -1))) {
        return band;
      }
      if (pattern === taskType) {
        return band;
      }
    }
  }
  return 'LOW'; // Default
}
```

**Acceptance Criteria**:
- Function correctly classifies known task types
- Wildcard patterns match correctly
- Default to LOW for unknown types
- Unit tests covering all patterns

#### 1.1.1.3: Add Risk Metadata to Task Execution
**File**: `packages/opencode-integration-layer/src/index.js`
**Changes**:
```javascript
// Modify task execution flow
async function executeTaskWithEvidence(task, context) {
  const riskBand = classifyTaskRisk(task.type);
  const enhancedTask = { ...task, metadata: { ...task.metadata, riskBand } };
  
  // Existing execution logic...
  
  // Add risk-based enforcement
  if (riskBand === 'HIGH' || riskBand === 'CRITICAL') {
    await enforceToolUsage(enhancedTask, recommendedTools, riskBand);
  }
}
```

**Acceptance Criteria**:
- Risk band added to task metadata
- Enforcement triggered for HIGH/CRITICAL tasks
- No impact on LOW/MEDIUM risk tasks

### Task 1.1.2: Implement Risk-Based Enforcement

#### 1.1.2.1: Create Enforcement Module
**File**: `packages/opencode-integration-layer/src/enforcement.js`
**Content**:
```javascript
const ENFORCEMENT_CONFIG = {
  CRITICAL: {
    requireTools: true,
    minTools: 2,
    allowedToolFamilies: ['security', 'audit', 'signing'],
    failOnMissing: true
  },
  HIGH: {
    requireTools: true,
    minTools: 1,
    allowedToolFamilies: ['debug', 'analysis', 'security'],
    failOnMissing: false // Warn but continue
  },
  MEDIUM: {
    requireTools: false,
    minTools: 0,
    logWarning: true
  },
  LOW: {
    requireTools: false,
    minTools: 0
  }
};

async function enforceToolUsage(task, recommendedTools, riskBand) {
  const config = ENFORCEMENT_CONFIG[riskBand] || ENFORCEMENT_CONFIG.LOW;
  
  if (!config.requireTools) {
    return true; // No enforcement needed
  }
  
  const executedTools = await getExecutedTools(task.id);
  const matchingTools = executedTools.filter(tool => 
    recommendedTools.includes(tool) || 
    config.allowedToolFamilies?.some(family => tool.startsWith(family))
  );
  
  if (matchingTools.length < config.minTools) {
    const message = `Risk band ${riskBand} requires at least ${config.minTools} tools from recommended/allowed families. Found: ${matchingTools.length}`;
    
    if (config.failOnMissing) {
      throw new EnforcementError(message);
    } else {
      console.warn(`[ENFORCEMENT] ${message}`);
    }
  }
  
  return matchingTools.length >= config.minTools;
}
```

**Acceptance Criteria**:
- Different enforcement per risk band
- Proper tool family matching
- Configurable failure/warning behavior
- Unit tests for all configurations

#### 1.1.2.2: Integrate Enforcement into Execution Flow
**File**: `packages/opencode-integration-layer/src/index.js`
**Changes**:
```javascript
// Add enforcement check
async function executeTaskWithEvidence(task, context) {
  // ... existing code ...
  
  const riskBand = classifyTaskRisk(task.type);
  const shouldEnforce = ['HIGH', 'CRITICAL'].includes(riskBand);
  
  if (shouldEnforce) {
    try {
      const enforced = await enforceToolUsage(task, recommendedTools, riskBand);
      if (!enforced && riskBand === 'CRITICAL') {
        throw new Error('Critical task failed tool usage enforcement');
      }
    } catch (error) {
      if (error instanceof EnforcementError) {
        // Log and potentially escalate
        auditLog('enforcement_failure', { task, error });
        throw error;
      }
    }
  }
  
  // Continue with execution...
}
```

**Acceptance Criteria**:
- Enforcement integrated without breaking existing flows
- Proper error handling for enforcement failures
- Audit logging for enforcement events
- Performance impact < 2ms per task

### Task 1.1.3: Add Mandatory Tool Sequences

#### 1.1.3.1: Define Mandatory Sequences
**File**: `packages/opencode-integration-layer/src/tool-sequences.js`
**Content**:
```javascript
const MANDATORY_SEQUENCES = {
  debug_errors: {
    requiredTools: ['systematic-debugging', 'lsp_diagnostics'],
    optionalTools: ['grep', 'ast_grep_search'],
    orderMatters: false,
    timeoutMs: 5000
  },
  security_scan: {
    requiredTools: ['grep', 'security_audit'],
    optionalTools: ['supermemory_search', 'context7_query_docs'],
    orderMatters: true,
    timeoutMs: 10000
  },
  code_analysis: {
    requiredTools: ['ast_grep_search', 'lsp_symbols'],
    optionalTools: ['lsp_find_references', 'lsp_goto_definition'],
    orderMatters: false,
    timeoutMs: 3000
  }
};

function getMandatorySequence(taskType) {
  // Check exact match first
  if (MANDATORY_SEQUENCES[taskType]) {
    return MANDATORY_SEQUENCES[taskType];
  }
  
  // Check wildcard patterns
  for (const [pattern, sequence] of Object.entries(MANDATORY_SEQUENCES)) {
    if (pattern.endsWith('*') && taskType.startsWith(pattern.slice(0, -1))) {
      return sequence;
    }
  }
  
  return null; // No mandatory sequence for this task
}
```

**Acceptance Criteria**:
- Correct pattern matching
- Wildcard support
- Null return for unmatched tasks
- Unit tests for all sequences

#### 1.1.3.2: Implement Sequence Validation
**File**: `packages/opencode-integration-layer/src/enforcement.js` (add to existing)
**Changes**:
```javascript
async function validateToolSequence(task, executedTools) {
  const sequence = getMandatorySequence(task.type);
  if (!sequence) {
    return { valid: true, missing: [] };
  }
  
  const missingRequired = sequence.requiredTools.filter(
    tool => !executedTools.includes(tool)
  );
  
  const isValid = missingRequired.length === 0;
  
  if (!isValid) {
    return {
      valid: false,
      missing: missingRequired,
      sequence: sequence
    };
  }
  
  // Check order if required
  if (sequence.orderMatters) {
    const toolIndices = sequence.requiredTools.map(tool => 
      executedTools.indexOf(tool)
    );
    const isOrdered = toolIndices.every((index, i) => 
      i === 0 || index > toolIndices[i - 1]
    );
    
    if (!isOrdered) {
      return {
        valid: false,
        missing: [],
        orderViolation: true,
        sequence: sequence
      };
    }
  }
  
  return { valid: true, missing: [] };
}
```

**Acceptance Criteria**:
- Detects missing required tools
- Validates tool order when required
- Graceful handling of no sequence
- Performance efficient

### Task 1.2.1: Split Skill Metrics

#### 1.2.1.1: Modify Skill Data Structure
**File**: `packages/opencode-skill-rl-manager/src/index.js`
**Changes**:
```javascript
// Update skill data structure
const skillSchema = {
  name: String,
  selected_count: { type: Number, default: 0 },
  executed_count: { type: Number, default: 0 },
  success_rate: { type: Number, default: 0.5 },
  tool_affinities: Object,
  last_used: Date,
  // ... existing fields
};

// Update learnFromOutcome
learnFromOutcome(outcome) {
  const { skill_used, success, task_type } = outcome;
  
  if (skill_used) {
    const skill = this.skillBank.getSkill(skill_used);
    
    // Increment selected count when skill is chosen
    skill.selected_count = (skill.selected_count || 0) + 1;
    
    // Only increment executed count if actually used
    if (outcome.skill_executed === true) {
      skill.executed_count = (skill.executed_count || 0) + 1;
      
      // Recalculate success rate based on execution
      const totalExecutions = skill.executed_count;
      const currentSuccesses = (skill.success_rate || 0.5) * (totalExecutions - 1);
      const newSuccesses = currentSuccesses + (success ? 1 : 0);
      skill.success_rate = newSuccesses / totalExecutions;
    }
    
    // Update tool affinities
    this.updateToolAffinities(skill, outcome.mcpToolsUsed);
  }
}
```

**Acceptance Criteria**:
- Separate selected vs executed counts
- Success rate calculated from executed count only
- Backward compatible with existing data
- Unit tests for new counting logic

#### 1.2.1.2: Add Skill Execution Tracking
**File**: `packages/opencode-integration-layer/src/index.js`
**Changes**:
```javascript
// Add execution tracking
let executionTracker = {
  currentTask: null,
  executedTools: [],
  executedSkills: []
};

function trackSkillExecution(skillName, taskId) {
  if (!executionTracker.currentTask || executionTracker.currentTask !== taskId) {
    executionTracker = {
      currentTask: taskId,
      executedTools: [],
      executedSkills: []
    };
  }
  
  if (!executionTracker.executedSkills.includes(skillName)) {
    executionTracker.executedSkills.push(skillName);
  }
}

// Modify task completion
async function completeTask(task, outcome) {
  const finalOutcome = {
    ...outcome,
    skill_executed: executionTracker.executedSkills.includes(outcome.skill_used),
    executed_skills: executionTracker.executedSkills,
    executed_tools: executionTracker.executedTools
  };
  
  // Pass to learning engine
  await learningEngine.learnFromOutcome(finalOutcome);
  
  // Clear tracker
  executionTracker = { currentTask: null, executedTools: [], executedSkills: [] };
}
```

**Acceptance Criteria**:
- Accurate tracking of executed skills
- Proper cleanup between tasks
- Integration with learning engine
- Performance efficient

### Task 1.2.2: Add Execution Tracking to Tool Usage

#### 1.2.2.1: Track Tool Execution
**File**: `packages/opencode-integration-layer/src/index.js`
**Changes**:
```javascript
// Intercept tool calls
const originalToolCall = globalThis.toolCall;
globalThis.toolCall = async function(toolName, ...args) {
  if (executionTracker.currentTask) {
    if (!executionTracker.executedTools.includes(toolName)) {
      executionTracker.executedTools.push(toolName);
    }
  }
  
  return originalToolCall.call(this, toolName, ...args);
};

// Alternative: wrapper function
function trackToolUsage(toolName) {
  if (executionTracker.currentTask && 
      !executionTracker.executedTools.includes(toolName)) {
    executionTracker.executedTools.push(toolName);
  }
}

// Usage in tool execution
async function executeTool(toolName, params) {
  trackToolUsage(toolName);
  // ... existing tool execution logic
}
```

**Acceptance Criteria**:
- All tool usage tracked
- No duplicate tracking
- Minimal performance impact
- Works with existing tool infrastructure

#### 1.2.2.2: Integrate with recordToolUsage
**File**: `packages/opencode-integration-layer/src/index.js`
**Changes**:
```javascript
// Wire up recordToolUsage
async function recordToolUsage(taskId, executedTools, outcome) {
  const usageRecord = {
    task_id: taskId,
    timestamp: Date.now(),
    tools: executedTools,
    outcome: outcome.success,
    risk_band: outcome.riskBand,
    duration_ms: outcome.duration
  };
  
  // Store for analytics
  await storeToolUsageRecord(usageRecord);
  
  // Update tool tiers if implemented
  if (toolTierManager) {
    executedTools.forEach(tool => {
      toolTierManager.recordToolUsage(tool, outcome.success);
    });
  }
}
```

**Acceptance Criteria**:
- Records all executed tools
- Includes task context
- Integrates with tier management
- Persistent storage

### Task 1.2.3: Update Dashboard Metrics

#### 1.2.3.1: Add Dual Metrics Display
**File**: `packages/opencode-dashboard/src/app/skills/page.tsx`
**Changes**:
```tsx
// Add new metrics component
function SkillUsageMetrics({ skillName }: { skillName: string }) {
  const { data: skillData } = useSkillData(skillName);
  
  const executionRate = skillData?.executed_count 
    ? (skillData.executed_count / skillData.selected_count) * 100
    : 0;
  
  return (
    <div className="skill-metrics">
      <MetricCard 
        title="Selected" 
        value={skillData?.selected_count || 0}
        description="Times skill was recommended"
      />
      <MetricCard 
        title="Executed" 
        value={skillData?.executed_count || 0}
        description="Times skill was actually used"
      />
      <MetricCard 
        title="Execution Rate" 
        value={`${executionRate.toFixed(1)}%`}
        description="Percentage of recommendations followed"
        variant={executionRate < 50 ? 'warning' : 'success'}
      />
      <MetricCard 
        title="Success Rate" 
        value={`${(skillData?.success_rate || 0) * 100}%`}
        description="Based on executed tasks only"
      />
    </div>
  );
}
```

**Acceptance Criteria**:
- Displays both selected and executed counts
- Calculates execution rate
- Visual indicators for low execution rates
- Responsive design

#### 1.2.3.2: Add Skill Execution Analytics
**File**: `packages/opencode-dashboard/src/app/analytics/skill-execution.tsx`
**Content**:
```tsx
// New analytics page
export default function SkillExecutionAnalytics() {
  const { data: skills } = useAllSkills();
  
  const lowExecutionSkills = skills.filter(skill => {
    const executionRate = skill.executed_count / skill.selected_count;
    return executionRate < 0.5 && skill.selected_count > 10;
  });
  
  const highValueSkills = skills.filter(skill => {
    const executionRate = skill.executed_count / skill.selected_count;
    return executionRate > 0.8 && skill.success_rate > 0.7;
  });
  
  return (
    <div className="container">
      <h1>Skill Execution Analytics</h1>
      
      <Section title="Low Execution Rate Skills (Needs Attention)">
        <DataTable data={lowExecutionSkills} columns={[
          { header: 'Skill', accessor: 'name' },
          { header: 'Selected', accessor: 'selected_count' },
          { header: 'Executed', accessor: 'executed_count' },
          { header: 'Execution Rate', accessor: row => 
            `${((row.executed_count / row.selected_count) * 100).toFixed(1)}%`
          },
          { header: 'Success Rate', accessor: row => 
            `${(row.success_rate * 100).toFixed(1)}%`
          }
        ]} />
      </Section>
      
      <Section title="High Value Skills (Well-Adopted)">
        <DataTable data={highValueSkills} columns={[
          { header: 'Skill', accessor: 'name' },
          { header: 'Execution Rate', accessor: row => 
            `${((row.executed_count / row.selected_count) * 100).toFixed(1)}%`
          },
          { header: 'Success Rate', accessor: row => 
            `${(row.success_rate * 100).toFixed(1)}%`
          }
        ]} />
      </Section>
      
      <Section title="Execution Trends">
        <LineChart 
          data={executionTrends}
          xAxis="date"
          yAxis="execution_rate"
          title="Skill Execution Rate Over Time"
        />
      </Section>
    </div>
  );
}
```

**Acceptance Criteria**:
- Identifies skills needing attention
- Highlights successful skill adoption
- Historical trend visualization
- Actionable insights

## Testing Strategy

### Unit Tests
1. **Risk Classification Tests**: Verify correct band assignment
2. **Enforcement Logic Tests**: Test all risk band configurations
3. **Sequence Validation Tests**: Test mandatory tool sequences
4. **Skill Tracking Tests**: Verify selected vs executed counting
5. **Tool Tracking Tests**: Verify tool usage recording

### Integration Tests
1. **End-to-End Enforcement**: Complete task flow with enforcement
2. **Dashboard Integration**: Verify metrics display correctly
3. **Learning Engine Integration**: Ensure proper feedback loops
4. **Performance Tests**: Verify minimal overhead

### Acceptance Tests
1. **HIGH Risk Tasks**: Verify ≥80% tool usage compliance
2. **Skill Execution Tracking**: Verify accurate selected vs executed distinction
3. **No Regression**: LOW risk tasks maintain current behavior
4. **Performance**: <5% overhead for enforcement checks

## Deployment Plan

### Step 1: Development Environment
- Implement all Phase 1 tasks in feature branch
- Run comprehensive test suite
- Performance benchmarking

### Step 2: Staging Environment
- Deploy to staging with monitoring
- Run synthetic workload tests
- Gather performance metrics
- Validate dashboard functionality

### Step 3: Canary Release (10% traffic)
- Deploy to 10% of production traffic
- Monitor enforcement effectiveness
- Gather real-world metrics
- Collect developer feedback

### Step 4: Full Release
- Deploy to 100% of production traffic
- Enable all enforcement features
- Monitor for issues
- Ready documentation

### Step 5: Post-Release Validation
- Verify success metrics achieved
- Gather feedback for Phase 2 planning
- Document lessons learned

## Success Metrics for Phase 1

### Quantitative Goals
1. **HIGH risk tasks**: ≥80% tool usage compliance
2. **Skill execution tracking**: Accurate distinction (selected vs executed)
3. **Performance impact**: <5% overhead for enforcement checks
4. **Dashboard accuracy**: Real-time metrics with <1s latency

### Qualitative Goals
1. **Developer experience**: No negative impact on LOW risk tasks
2. **System stability**: No new critical bugs introduced
3. **Documentation**: Clear guidance on new enforcement features
4. **Monitoring**: Comprehensive visibility into enforcement effectiveness

## Risk Mitigation

### Rollback Plan
1. **Feature Flags**: Each enforcement feature toggleable
2. **Graceful Degradation**: Enforcement failures don't break task execution
3. **Monitoring Alerts**: Immediate notification of issues
4. **Quick Rollback**: Ability to disable all enforcement within 5 minutes

### Communication Plan
1. **Developer Announcement**: Clear documentation of changes
2. **Training Materials**: Examples of new enforcement in action
3. **Support Channels**: Dedicated support for transition period
4. **Feedback Collection**: Regular check-ins with power users

## Timeline

### Week 1 (Days 1-5): Core Implementation
- Day 1: Risk classification implementation
- Day 2: Enforcement module development
- Day 3: Skill tracking modifications
- Day 4: Tool execution tracking
- Day 5: Integration testing

### Week 2 (Days 6-10): Dashboard & Analytics
- Day 6: Dashboard metrics implementation
- Day 7: Analytics page development
- Day 8: Data visualization
- Day 9: Performance optimization
- Day 10: End-to-end testing

### Week 3 (Days 11-15): Deployment & Validation
- Day 11: Staging deployment
- Day 12: Canary release (10%)
- Day 13: Monitoring setup
- Day 14: Full release (100%)
- Day 15: Post-release validation

## Next Steps After Phase 1

Upon successful completion of Phase 1:

1. **Review Metrics**: Analyze Phase 1 success metrics
2. **Gather Feedback**: Collect developer feedback
3. **Plan Phase 2**: Begin work on integration fixes
4. **Document Learnings**: Capture lessons for future phases

Phase 1 establishes the foundation for addressing sparse tool usage while demonstrating immediate value through targeted enforcement of high-risk scenarios.