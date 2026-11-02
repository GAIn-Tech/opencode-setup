'use strict';

const { describe, it, expect } = require('bun:test');
const { ContextBridge } = require('../src/context-bridge');

function silentLogger() {
  return { info: () => {}, warn: () => {}, error: () => {} };
}

function fixedGovernor(pct) {
  return {
    getRemainingBudget: () => ({ pct }),
  };
}

describe('ContextBridge memory safety and input validation', () => {
  it('bounds audit trail growth and trims older entries', () => {
    const bridge = new ContextBridge({
      governor: fixedGovernor(0.95),
      logger: silentLogger(),
      maxAuditTrail: 50,
      trimTo: 40,
    });

    for (let i = 0; i < 250; i++) {
      bridge.evaluateAndEnforce(`ses_${i}`, 'model-a');
    }

    const trail = bridge.getAuditTrail(1000);
    expect(trail.length).toBeLessThanOrEqual(50);
    expect(trail.length).toBeGreaterThanOrEqual(40);
    expect(trail.at(-1).sessionId).toBe('ses_249');
  });

  it('normalizes getAuditTrail limit for invalid values', () => {
    const bridge = new ContextBridge({
      governor: fixedGovernor(0.95),
      logger: silentLogger(),
      maxAuditTrail: 120,
    });

    for (let i = 0; i < 120; i++) {
      bridge.evaluateAndEnforce(`ses_${i}`, 'model-a');
    }

    expect(bridge.getAuditTrail(-10).length).toBe(100);
    expect(bridge.getAuditTrail(0).length).toBe(100);
    expect(bridge.getAuditTrail('x').length).toBe(100);
    expect(bridge.getAuditTrail(5).length).toBe(5);
  });

  it('fails closed for invalid sessionId/model types', () => {
    const bridge = new ContextBridge({ governor: fixedGovernor(0.5), logger: silentLogger() });

    const badSession = bridge.evaluateAndEnforce('', 'model-a');
    expect(badSession.action).toBe('block');
    expect(badSession.reason).toContain('Invalid sessionId');

    const badModel = bridge.evaluateAndEnforce('ses_1', 42);
    expect(badModel.action).toBe('block');
    expect(badModel.reason).toContain('Invalid model');
  });

  it('fails closed when governor returns pct outside 0..1', () => {
    const over = new ContextBridge({ governor: fixedGovernor(1.5), logger: silentLogger() });
    const under = new ContextBridge({ governor: fixedGovernor(-0.1), logger: silentLogger() });

    expect(over.evaluateAndEnforce('ses_1', 'model-a').action).toBe('block');
    expect(under.evaluateAndEnforce('ses_1', 'model-a').action).toBe('block');
  });

  it('handles circular operation context without crashing', () => {
    const bridge = new ContextBridge({
      governor: fixedGovernor(0.95),
      logger: silentLogger(),
      maxOperationRefs: 10,
    });

    const circular = { name: 'root' };
    circular.self = circular;

    const result = bridge.evaluateAndEnforce('ses_circular', 'model-a', { circular });
    expect(result.action).toBe('block');
    expect(result.veto).toBeTruthy();

    const trail = bridge.getAuditTrail(10);
    expect(trail.length).toBeGreaterThan(0);
    expect(() => JSON.stringify(trail)).not.toThrow();
  });

  it('bounds weak operation reference index size', () => {
    const bridge = new ContextBridge({
      governor: fixedGovernor(0.95),
      logger: silentLogger(),
      maxOperationRefs: 25,
    });

    for (let i = 0; i < 200; i++) {
      bridge.evaluateAndEnforce(`ses_ref_${i}`, 'model-a');
    }

    expect(bridge._operationRefs.size).toBeLessThanOrEqual(25);
  });
});
