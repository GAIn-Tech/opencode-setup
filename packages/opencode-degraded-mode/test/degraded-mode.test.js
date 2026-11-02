/**
 * Tests for degraded-mode contract
 * 
 * Task 2: Replace silent degraded behavior with explicit degraded-mode contracts
 * on critical orchestration/routing seams.
 */

const { describe, test, expect, beforeEach } = require('bun:test');
const { 
  DegradedModeState,
  DEGRADED_MODES,
  CONTAINMENT_ACTIONS,
  DegradedModeManager,
  classifyDependencyStatus,
  createDegradedEvent
} = require('../src/index');

// ---------------------------------------------------------------------------
// DEGRADED MODE STATE TESTS
// ---------------------------------------------------------------------------

describe('DegradedModeState', () => {
  test('creates healthy state by default', () => {
    const state = new DegradedModeState();
    expect(state.mode).toBe(DEGRADED_MODES.HEALTHY);
    expect(state.severity).toBe('none');
    expect(state.containment).toBe(CONTAINMENT_ACTIONS.NONE);
  });

  test('transitions to degraded when dependency is missing', () => {
    const state = new DegradedModeState();
    state.transition(DEGRADED_MODES.DEPENDENCY_MISSING, {
      dependency: 'opencode-shared-orchestration',
      severity: 'high',
      reason: 'Module not found'
    });
    
    expect(state.mode).toBe(DEGRADED_MODES.DEPENDENCY_MISSING);
    expect(state.severity).toBe('high');
    // DEPENDENCY_MISSING with high severity gets FALLBACK_UNAPPROVED containment
    expect(state.containment).toBe(CONTAINMENT_ACTIONS.FALLBACK_UNAPPROVED);
  });

  test('emits structured event on transition', () => {
    const state = new DegradedModeState();
    const events = [];
    state.on('transition', (event) => events.push(event));
    
    state.transition(DEGRADED_MODES.STUBBED, {
      dependency: 'context-utils',
      severity: 'medium'
    });
    
    expect(events.length).toBe(1);
    expect(events[0].from).toBe(DEGRADED_MODES.HEALTHY);
    expect(events[0].to).toBe(DEGRADED_MODES.STUBBED);
    expect(events[0].timestamp).toBeDefined();
    expect(events[0].provenance).toBeDefined();
  });

  test('prevents unsafe learning updates when degraded', () => {
    const state = new DegradedModeState();
    state.transition(DEGRADED_MODES.DEPENDENCY_MISSING, {
      dependency: 'orchestration-advisor',
      severity: 'critical'
    });
    
    expect(state.canSafelyUpdateLearning()).toBe(false);
  });

  test('allows learning updates when healthy', () => {
    const state = new DegradedModeState();
    expect(state.canSafelyUpdateLearning()).toBe(true);
  });

  test('includes remediation hints in state', () => {
    const state = new DegradedModeState();
    state.transition(DEGRADED_MODES.STUBBED, {
      dependency: 'tool-usage-tracker',
      severity: 'medium',
      remediation: 'Install opencode-tool-usage-tracker package'
    });
    
    expect(state.remediation).toBe('Install opencode-tool-usage-tracker package');
  });
});

// ---------------------------------------------------------------------------
// DEGRADED MODE MANAGER TESTS
// ---------------------------------------------------------------------------

describe('DegradedModeManager', () => {
  let manager;

  beforeEach(() => {
    manager = new DegradedModeManager();
  });

  test('tracks multiple dependency states', () => {
    manager.reportDependency('opencode-shared-orchestration', {
      status: 'missing',
      severity: 'high'
    });
    manager.reportDependency('opencode-tool-usage-tracker', {
      status: 'stubbed',
      severity: 'medium'
    });
    
    const snapshot = manager.getSnapshot();
    expect(snapshot.dependencies['opencode-shared-orchestration'].status).toBe('missing');
    expect(snapshot.dependencies['opencode-tool-usage-tracker'].status).toBe('stubbed');
  });

  test('computes overall degraded state from dependencies', () => {
    manager.reportDependency('dep-a', { status: 'missing', severity: 'critical' });
    manager.reportDependency('dep-b', { status: 'healthy', severity: 'none' });
    
    const overall = manager.getOverallState();
    expect(overall.mode).toBe(DEGRADED_MODES.DEPENDENCY_MISSING);
    expect(overall.severity).toBe('critical');
  });

  test('emits degraded-mode event on critical transition', () => {
    const events = [];
    manager.on('degraded-mode', (event) => events.push(event));
    
    manager.reportDependency('critical-dep', {
      status: 'missing',
      severity: 'critical',
      affects: ['routing', 'learning']
    });
    
    expect(events.length).toBe(1);
    expect(events[0].mode).toBe(DEGRADED_MODES.DEPENDENCY_MISSING);
    expect(events[0].affects).toContain('routing');
  });

  test('gates routing decisions when degraded', () => {
    manager.reportDependency('routing-dep', {
      status: 'missing',
      severity: 'high',
      affects: ['routing']
    });
    
    const gateResult = manager.checkRoutingGate();
    expect(gateResult.allowed).toBe(false);
    expect(gateResult.reason).toContain('blocked');
  });

  test('allows routing with approved fallback', () => {
    manager.reportDependency('optional-dep', {
      status: 'stubbed',
      severity: 'low',
      affects: ['routing'],
      fallbackApproved: true
    });
    
    const gateResult = manager.checkRoutingGate();
    expect(gateResult.allowed).toBe(true);
    expect(gateResult.fallbackUsed).toBe(true);
  });

  test('contains unsafe learning updates', () => {
    manager.reportDependency('learning-dep', {
      status: 'missing',
      severity: 'critical',
      affects: ['learning']
    });
    
    const containment = manager.checkLearningGate();
    expect(containment.action).toBe(CONTAINMENT_ACTIONS.BLOCK);
    expect(containment.reason).toContain('blocked');
  });
});

// ---------------------------------------------------------------------------
// CLASSIFY DEPENDENCY STATUS TESTS
// ---------------------------------------------------------------------------

describe('classifyDependencyStatus', () => {
  test('classifies missing dependency', () => {
    const result = classifyDependencyStatus({
      available: false,
      required: true,
      fallbackAvailable: false
    });
    
    expect(result.status).toBe('missing');
    expect(result.severity).toBe('critical');
    expect(result.containment).toBe(CONTAINMENT_ACTIONS.BLOCK);
  });

  test('classifies stubbed dependency with approved fallback', () => {
    const result = classifyDependencyStatus({
      available: false,
      required: true,
      fallbackAvailable: true,
      fallbackApproved: true
    });
    
    expect(result.status).toBe('stubbed');
    expect(result.severity).toBe('medium');
    expect(result.containment).toBe(CONTAINMENT_ACTIONS.FALLBACK_APPROVED);
  });

  test('classifies healthy dependency', () => {
    const result = classifyDependencyStatus({
      available: true,
      required: true
    });
    
    expect(result.status).toBe('healthy');
    expect(result.severity).toBe('none');
    expect(result.containment).toBe(CONTAINMENT_ACTIONS.NONE);
  });

  test('classifies optional missing dependency', () => {
    const result = classifyDependencyStatus({
      available: false,
      required: false,
      fallbackAvailable: true
    });
    
    expect(result.status).toBe('optional_missing');
    expect(result.severity).toBe('low');
    expect(result.containment).toBe(CONTAINMENT_ACTIONS.LOG_ONLY);
  });
});

// ---------------------------------------------------------------------------
// CREATE DEGRADED EVENT TESTS
// ---------------------------------------------------------------------------

describe('createDegradedEvent', () => {
  test('creates structured event with all required fields', () => {
    const event = createDegradedEvent({
      mode: DEGRADED_MODES.STUBBED,
      dependency: 'test-dep',
      severity: 'high',
      affects: ['routing'],
      remediation: 'Install package'
    });
    
    expect(event.id).toBeDefined();
    expect(event.timestamp).toBeDefined();
    expect(event.mode).toBe(DEGRADED_MODES.STUBBED);
    expect(event.provenance).toBeDefined();
    expect(event.provenance.source).toBe('degraded-mode-contract');
  });

  test('includes containment decision in event', () => {
    const event = createDegradedEvent({
      mode: DEGRADED_MODES.DEPENDENCY_MISSING,
      dependency: 'critical-dep',
      severity: 'critical',
      affects: ['routing', 'learning']
    });
    
    expect(event.containment).toBe(CONTAINMENT_ACTIONS.BLOCK);
    expect(event.affects).toContain('routing');
    expect(event.affects).toContain('learning');
  });
});

// ---------------------------------------------------------------------------
// EDGE CASES
// ---------------------------------------------------------------------------

describe('Edge Cases', () => {
  test('handles brownout scenario', () => {
    const manager = new DegradedModeManager();
    manager.reportDependency('api-provider', {
      status: 'degraded',
      severity: 'medium',
      reason: 'Rate limiting active',
      affects: ['routing']
    });
    
    const overall = manager.getOverallState();
    expect(overall.mode).toBe(DEGRADED_MODES.DEGRADED);
    expect(overall.severity).toBe('medium');
  });

  test('handles partial config corruption', () => {
    const manager = new DegradedModeManager();
    manager.reportDependency('config-loader', {
      status: 'corrupted',
      severity: 'high',
      reason: 'Config parse error',
      affects: ['routing', 'learning'],
      fallbackApproved: false
    });
    
    const gateResult = manager.checkRoutingGate();
    expect(gateResult.allowed).toBe(false);
  });

  test('tracks recovery to healthy state', () => {
    const manager = new DegradedModeManager();
    const events = [];
    manager.on('recovered', (event) => events.push(event));
    
    manager.reportDependency('test-dep', {
      status: 'missing',
      severity: 'high'
    });
    
    manager.reportDependency('test-dep', {
      status: 'healthy',
      severity: 'none'
    });
    
    expect(events.length).toBe(1);
    expect(events[0].dependency).toBe('test-dep');
  });

  test('prevents oscillation between states', () => {
    const manager = new DegradedModeManager();
    const events = [];
    manager.on('degraded-mode', (event) => events.push(event));
    
    // Rapid state changes
    for (let i = 0; i < 5; i++) {
      manager.reportDependency('test-dep', {
        status: i % 2 === 0 ? 'missing' : 'healthy',
        severity: i % 2 === 0 ? 'high' : 'none'
      });
    }
    
    // Should not emit duplicate events for same state
    expect(events.length).toBeLessThan(5);
  });
});
