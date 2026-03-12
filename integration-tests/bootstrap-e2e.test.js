const { describe, it, expect } = require('bun:test');

describe('bootstrap E2E', () => {
  it('full bootstrap produces a functional runtime', () => {
    const { resetBootstrap, bootstrap, getBootstrapStatus } =
      require('../packages/opencode-integration-layer/src/bootstrap.js');
    resetBootstrap();

    const runtime = bootstrap({ sessionId: 'e2e-test' });
    const status = getBootstrapStatus();

    // Core methods exist
    expect(typeof runtime.resolveRuntimeContext).toBe('function');
    expect(typeof runtime.selectToolsForTask).toBe('function');
    expect(typeof runtime.checkContextBudget).toBe('function');
    expect(typeof runtime.diagnose).toBe('function');

    // At least some packages attempted
    expect(status.packagesAttempted).toBeGreaterThan(0);

    // Memory graph methods
    expect(typeof runtime.recordSessionError).toBe('function');
    expect(typeof runtime.getSessionErrors).toBe('function');
    expect(typeof runtime.getErrorFrequency).toBe('function');
    expect(typeof runtime.activateMemoryGraph).toBe('function');
    expect(typeof runtime.isMemoryGraphActive).toBe('function');

    // Fallback doctor methods
    expect(typeof runtime.validateFallbackChain).toBe('function');
    expect(typeof runtime.diagnoseFallbacks).toBe('function');

    // Plugin lifecycle methods
    expect(typeof runtime.evaluatePluginHealth).toBe('function');
    expect(typeof runtime.listPlugins).toBe('function');

    // Sisyphus state methods
    expect(typeof runtime.executeWorkflow).toBe('function');
    expect(typeof runtime.resumeWorkflow).toBe('function');
    expect(typeof runtime.getWorkflowState).toBe('function');

    // resolveRuntimeContext doesn't throw
    const ctx = runtime.resolveRuntimeContext({
      sessionId: 'e2e-test',
      model: 'claude-sonnet-4-20250514',
      taskType: 'code-edit',
    });
    expect(ctx).toBeDefined();
    expect(ctx).toHaveProperty('compression');
  });

  it('bootstrap is idempotent', () => {
    const { bootstrap } =
      require('../packages/opencode-integration-layer/src/bootstrap.js');
    const a = bootstrap();
    const b = bootstrap();
    expect(a).toBe(b);
  });
});
