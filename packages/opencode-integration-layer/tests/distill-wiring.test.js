const { describe, it, expect } = require('bun:test');
const { IntegrationLayer } = require('../src/index');

describe('DCP/Distill wiring in resolveRuntimeContext', () => {
  it('returns compression advisory when context budget exceeds threshold', () => {
    const integration = new IntegrationLayer({});

    // Mock context-bridge to report high usage
    integration.contextBridge = {
      evaluateAndCompress: () => ({
        action: 'compress',
        reason: 'Budget at 70%',
        pct: 70,
      }),
    };

    // Mock preload-skills to return tool selection
    integration.preloadSkills = {
      selectTools: () => ({
        tools: [{ id: 'grep', tier: 0 }],
        totalTokens: 500,
      }),
    };

    const result = integration.resolveRuntimeContext({
      sessionId: 'test-session',
      model: 'claude-sonnet-4-20250514',
      taskType: 'code-edit',
    });

    expect(result).toHaveProperty('compression');
    expect(result.compression.active).toBe(true);
    expect(result.compression.recommendedTools).toContain('distill_browse_tools');
    expect(result.compression.recommendedTools).toContain('distill_run_tool');
    expect(result.compression.recommendedSkills).toContain('dcp');
    expect(result.compression.recommendedSkills).toContain('distill');
    expect(result.compression.recommendedSkills).toContain('context-governor');
    expect(result.budget.action).toBe('compress');
  });

  it('returns no compression when budget is healthy', () => {
    const integration = new IntegrationLayer({});

    integration.contextBridge = {
      evaluateAndCompress: () => ({
        action: 'none',
        reason: 'Budget healthy at 30%',
        pct: 30,
      }),
    };

    integration.preloadSkills = {
      selectTools: () => ({
        tools: [{ id: 'grep', tier: 0 }],
        totalTokens: 500,
      }),
    };

    const result = integration.resolveRuntimeContext({
      sessionId: 'test-session',
      model: 'claude-sonnet-4-20250514',
      taskType: 'code-edit',
    });

    expect(result.compression.active).toBe(false);
    expect(result.compression.recommendedTools).toHaveLength(0);
    expect(result.compression.recommendedSkills).toHaveLength(0);
    expect(result.budget.action).toBe('none');
  });

  it('returns compress_urgent advisory at critical budget levels', () => {
    const integration = new IntegrationLayer({});

    integration.contextBridge = {
      evaluateAndCompress: () => ({
        action: 'compress_urgent',
        reason: 'Budget CRITICAL at 85%',
        pct: 85,
      }),
    };

    integration.preloadSkills = {
      selectTools: () => ({
        tools: [{ id: 'grep', tier: 0 }],
        totalTokens: 500,
      }),
    };

    const result = integration.resolveRuntimeContext({
      sessionId: 'test-session',
      model: 'claude-sonnet-4-20250514',
      taskType: 'code-edit',
    });

    expect(result.compression.active).toBe(true);
    expect(result.budget.action).toBe('compress_urgent');
  });

  it('works without preloadSkills (graceful fallback)', () => {
    const integration = new IntegrationLayer({});

    integration.contextBridge = {
      evaluateAndCompress: () => ({
        action: 'compress',
        reason: 'Budget at 70%',
        pct: 70,
      }),
    };

    // No preloadSkills mock — should still work
    const result = integration.resolveRuntimeContext({
      sessionId: 'test-session',
      model: 'claude-sonnet-4-20250514',
    });

    expect(result.selection).toBeNull();
    expect(result.compression.active).toBe(true);
  });
});
