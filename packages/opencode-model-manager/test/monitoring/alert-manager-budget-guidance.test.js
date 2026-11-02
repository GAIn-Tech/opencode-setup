/**
 * AlertManager Budget Guidance Tests
 */

const { describe, it, expect, beforeEach } = require('bun:test');
const { AlertManager } = require('../../src/monitoring/alert-manager');

describe('AlertManager Budget Guidance', () => {
  let alertManager;

  beforeEach(() => {
    alertManager = new AlertManager();
  });

  describe('75% Warning Threshold', () => {
    it('should include remediation guidance at 75%', () => {
      const alerts = alertManager.evaluateBudget({ sessionId: 'test-session', model: 'test-model', used: 75000, remaining: 25000, pct: 0.75 });
      const alert = alerts[0];
      expect(alert.remediation).toBeDefined();
      expect(alert.remediation.action).toBe('PROACTIVE_COMPRESSION');
      expect(alert.remediation.must_compress).toBe(false);
      expect(alert.remediation.must_block).toBe(false);
      expect(alert.remediation.steps).toBeInstanceOf(Array);
      expect(alert.remediation.steps.length).toBeGreaterThan(0);
    });

    it('should have grace period at 75%', () => {
      const alerts = alertManager.evaluateBudget({ sessionId: 'test-session', model: 'test-model', used: 75000, remaining: 25000, pct: 0.75 });
      expect(alerts[0].remediation.grace_period_ms).toBe(60000);
    });
  });

  describe('80% Critical Threshold', () => {
    it('should include mandatory compression guidance at 80%', () => {
      const alerts = alertManager.evaluateBudget({ sessionId: 'test-session', model: 'test-model', used: 80000, remaining: 20000, pct: 0.8 });
      const alert = alerts[0];
      expect(alert.severity).toBe('critical');
      expect(alert.remediation.action).toBe('MANDATORY_COMPRESSION');
      expect(alert.remediation.must_compress).toBe(true);
      expect(alert.remediation.must_block).toBe(false);
    });

    it('should have shorter grace period at 80%', () => {
      const alerts = alertManager.evaluateBudget({ sessionId: 'test-session', model: 'test-model', used: 80000, remaining: 20000, pct: 0.8 });
      expect(alerts[0].remediation.grace_period_ms).toBe(30000);
    });
  });

  describe('85% Block Threshold', () => {
    it('should include blocking guidance at 85%', () => {
      const alerts = alertManager.evaluateBudget({ sessionId: 'test-session', model: 'test-model', used: 85000, remaining: 15000, pct: 0.85 });
      const alert = alerts[0];
      expect(alert.severity).toBe('critical');
      expect(alert.remediation.action).toBe('BLOCK');
      expect(alert.remediation.must_compress).toBe(true);
      expect(alert.remediation.must_block).toBe(true);
      expect(alert.remediation.grace_period_ms).toBe(0);
    });
  });

  describe('95% Emergency Threshold', () => {
    it('should include emergency recovery guidance at 95%', () => {
      const alerts = alertManager.evaluateBudget({ sessionId: 'test-session', model: 'test-model', used: 95000, remaining: 5000, pct: 0.95 });
      const alert = alerts[0];
      expect(alert.severity).toBe('critical');
      expect(alert.remediation.action).toBe('EMERGENCY_RECOVERY');
      expect(alert.remediation.must_compress).toBe(true);
      expect(alert.remediation.must_block).toBe(true);
    });

    it('should have no grace period at 95%', () => {
      const alerts = alertManager.evaluateBudget({ sessionId: 'test-session', model: 'test-model', used: 95000, remaining: 5000, pct: 0.95 });
      expect(alerts[0].remediation.grace_period_ms).toBe(0);
    });
  });

  describe('Below Threshold', () => {
    it('should not fire alert below 75%', () => {
      const alerts = alertManager.evaluateBudget({ sessionId: 'test-session', model: 'test-model', used: 70000, remaining: 30000, pct: 0.7 });
      expect(alerts.length).toBe(0);
    });

    it('should resolve existing alert when budget drops below threshold', () => {
      alertManager.evaluateBudget({ sessionId: 'test-session', model: 'test-model', used: 80000, remaining: 20000, pct: 0.8 });
      expect(alertManager.getActiveAlerts().length).toBeGreaterThan(0);
      alertManager.evaluateBudget({ sessionId: 'test-session', model: 'test-model', used: 70000, remaining: 30000, pct: 0.7 });
      const activeAlerts = alertManager.getActiveAlerts().filter((a) => a.type === 'budget_threshold');
      expect(activeAlerts.length).toBe(0);
    });
  });

  describe('Remediation Steps', () => {
    it('should include actionable steps in all alerts', () => {
      const alerts = alertManager.evaluateBudget({ sessionId: 'test-session', model: 'test-model', used: 80000, remaining: 20000, pct: 0.8 });
      const alert = alerts[0];
      expect(alert.remediation.steps).toBeInstanceOf(Array);
      expect(alert.remediation.steps.length).toBeGreaterThanOrEqual(3);
      alert.remediation.steps.forEach((step) => {
        expect(typeof step).toBe('string');
        expect(step.length).toBeGreaterThan(5);
      });
    });

    it('should include next_step guidance', () => {
      const alerts = alertManager.evaluateBudget({ sessionId: 'test-session', model: 'test-model', used: 80000, remaining: 20000, pct: 0.8 });
      const alert = alerts[0];
      expect(alert.remediation.next_step).toBeDefined();
      expect(typeof alert.remediation.next_step).toBe('string');
      expect(alert.remediation.next_step.length).toBeGreaterThan(10);
    });
  });
});
