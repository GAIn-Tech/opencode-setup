import { describe, test, expect, beforeEach } from 'bun:test';
import { GovernanceManager, DEFAULT_GOVERNANCE } from './governance-manager.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

describe('Dashboard Governance', () => {
  let manager;
  let tmpPath;

  beforeEach(() => {
    tmpPath = path.join(os.tmpdir(), `governance-test-${Date.now()}.json`);
    manager = new GovernanceManager({ governancePath: tmpPath, autoLoad: false });
  });

  describe('getSettings', () => {
    test('returns default settings', () => {
      const settings = manager.getSettings();
      expect(settings.budget.mode).toBe('advisory');
      expect(settings.learning.anti_pattern_override_risk).toBe(20);
      expect(settings.verification.when).toBe('on-failure');
      expect(settings.routing.strategy).toBe('scoring');
    });
  });

  describe('updateSettings', () => {
    test('updates budget mode', () => {
      manager.updateSettings({ budget: { mode: 'enforce-critical' } });
      expect(manager.getSettings().budget.mode).toBe('enforce-critical');
    });

    test('updates learning thresholds', () => {
      manager.updateSettings({
        learning: {
          anti_pattern_override_risk: 15,
          positive_pattern_boost_success: 0.9
        }
      });
      const settings = manager.getSettings();
      expect(settings.learning.anti_pattern_override_risk).toBe(15);
      expect(settings.learning.positive_pattern_boost_success).toBe(0.9);
    });

    test('updates verification policy', () => {
      manager.updateSettings({
        verification: {
          when: 'always',
          max_retries: 5
        }
      });
      const settings = manager.getSettings();
      expect(settings.verification.when).toBe('always');
      expect(settings.verification.max_retries).toBe(5);
    });

    test('updates routing strategy', () => {
      manager.updateSettings({
        routing: {
          strategy: 'thompson-sampling'
        }
      });
      expect(manager.getSettings().routing.strategy).toBe('thompson-sampling');
    });

    test('sets updated_at timestamp', () => {
      manager.updateSettings({ budget: { mode: 'enforce-critical' } });
      expect(manager.getSettings().updated_at).toBeDefined();
    });

    test('deep merges nested objects', () => {
      manager.updateSettings({ budget: { mode: 'enforce-critical' } });
      const settings = manager.getSettings();
      // Other budget fields should remain
      expect(settings.budget.mode).toBe('enforce-critical');
      // Other top-level fields should remain
      expect(settings.learning.anti_pattern_override_risk).toBe(20);
    });
  });

  describe('getSetting', () => {
    test('gets nested setting by path', () => {
      expect(manager.getSetting('budget.mode')).toBe('advisory');
      expect(manager.getSetting('learning.anti_pattern_override_risk')).toBe(20);
      expect(manager.getSetting('verification.when')).toBe('on-failure');
    });

    test('returns undefined for invalid path', () => {
      expect(manager.getSetting('nonexistent.path')).toBeUndefined();
    });
  });

  describe('onUpdate', () => {
    test('calls listener on update', () => {
      const calls = [];
      manager.onUpdate((settings) => calls.push(settings));
      manager.updateSettings({ budget: { mode: 'enforce-critical' } });
      
      expect(calls.length).toBe(1);
      expect(calls[0].budget.mode).toBe('enforce-critical');
    });

    test('unsubscribe removes listener', () => {
      const calls = [];
      const unsubscribe = manager.onUpdate(() => calls.push(true));
      
      manager.updateSettings({ budget: { mode: 'enforce-critical' } });
      expect(calls.length).toBe(1);
      
      unsubscribe();
      manager.updateSettings({ budget: { mode: 'advisory' } });
      expect(calls.length).toBe(1); // Should not increment
    });
  });

  describe('applyToRuntime', () => {
    test('applies budget mode to governor', () => {
      const mockGovernor = { setMode: function(mode) { this.mode = mode; } };
      manager.updateSettings({ budget: { mode: 'enforce-critical' } });
      manager.applyToRuntime({ governor: mockGovernor });
      expect(mockGovernor.mode).toBe('enforce-critical');
    });

    test('applies learning thresholds to advisor', () => {
      const mockAdvisor = { setGovernanceThresholds: function(t) { this.thresholds = t; } };
      manager.updateSettings({ learning: { anti_pattern_override_risk: 15 } });
      manager.applyToRuntime({ advisor: mockAdvisor });
      expect(mockAdvisor.thresholds.anti_pattern_override_risk).toBe(15);
    });

    test('applies verification policy to verifier', () => {
      const mockVerifier = { setPolicy: function(p) { this.policy = p; } };
      manager.updateSettings({ verification: { when: 'always' } });
      manager.applyToRuntime({ verifier: mockVerifier });
      expect(mockVerifier.policy.when).toBe('always');
    });

    test('applies routing strategy to router', () => {
      const mockRouter = { setRoutingStrategy: function(s) { this.strategy = s; } };
      manager.updateSettings({ routing: { strategy: 'thompson-sampling' } });
      manager.applyToRuntime({ router: mockRouter });
      expect(mockRouter.strategy).toBe('thompson-sampling');
    });

    test('handles missing runtime components gracefully', () => {
      expect(() => manager.applyToRuntime({})).not.toThrow();
      expect(() => manager.applyToRuntime(null)).not.toThrow();
    });
  });

  describe('Persistence', () => {
    test('saves and loads settings', () => {
      manager.updateSettings({ budget: { mode: 'enforce-critical' } });

      const manager2 = new GovernanceManager({ governancePath: tmpPath, autoLoad: true });
      expect(manager2.getSettings().budget.mode).toBe('enforce-critical');
    });
  });

  describe('DEFAULT_GOVERNANCE', () => {
    test('has expected structure', () => {
      expect(DEFAULT_GOVERNANCE.budget.mode).toBe('advisory');
      expect(DEFAULT_GOVERNANCE.learning.anti_pattern_override_risk).toBe(20);
      expect(DEFAULT_GOVERNANCE.verification.when).toBe('on-failure');
      expect(DEFAULT_GOVERNANCE.routing.strategy).toBe('scoring');
      expect(DEFAULT_GOVERNANCE.version).toBe('1.0.0');
    });
  });
});
