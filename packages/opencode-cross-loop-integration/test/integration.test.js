import { describe, test, expect } from 'bun:test';
import {
  simulateProviderOutage,
  simulateENOENTSpawn,
  simulateConfigCorruption,
  simulateConcurrentSessions,
  assertAuthorityCoherence,
  assertDegradedModeVisibility,
  assertThresholdAgreement,
  assertLivenessClassification,
  INTEGRATION_SCENARIOS
} from '../src/index.js';

describe('Cross-Loop Integration', () => {
  describe('INTEGRATION_SCENARIOS', () => {
    test('defines provider outage scenario', () => {
      expect(INTEGRATION_SCENARIOS.PROVIDER_OUTAGE).toBeDefined();
      expect(INTEGRATION_SCENARIOS.PROVIDER_OUTAGE.type).toBe('provider_outage');
    });

    test('defines ENOENT spawn scenario', () => {
      expect(INTEGRATION_SCENARIOS.ENOENT_SPAWN).toBeDefined();
      expect(INTEGRATION_SCENARIOS.ENOENT_SPAWN.type).toBe('enoent_spawn');
    });

    test('defines config corruption scenario', () => {
      expect(INTEGRATION_SCENARIOS.CONFIG_CORRUPTION).toBeDefined();
      expect(INTEGRATION_SCENARIOS.CONFIG_CORRUPTION.type).toBe('config_corruption');
    });

    test('defines concurrent sessions scenario', () => {
      expect(INTEGRATION_SCENARIOS.CONCURRENT_SESSIONS).toBeDefined();
      expect(INTEGRATION_SCENARIOS.CONCURRENT_SESSIONS.type).toBe('concurrent_sessions');
    });
  });

  describe('Provider Outage Scenario', () => {
    test('simulates provider outage', () => {
      const result = simulateProviderOutage({
        provider: 'openai',
        modelId: 'gpt-5.2',
        duration: 60000
      });

      expect(result.scenario).toBe('provider_outage');
      expect(result.provider).toBe('openai');
      expect(result.modelId).toBe('gpt-5.2');
      expect(result.authoritySnapshot).toBeDefined();
      expect(result.degradedMode).toBeDefined();
      expect(result.thresholdState).toBeDefined();
      expect(result.livenessState).toBeDefined();
    });

    test('authority remains coherent during outage', () => {
      const result = simulateProviderOutage({
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-5'
      });

      const coherence = assertAuthorityCoherence(result);
      expect(coherence.valid).toBe(true);
      expect(coherence.source).toBeDefined();
      expect(coherence.fallback).toBeDefined();
    });

    test('degraded mode is visible during outage', () => {
      const result = simulateProviderOutage({
        provider: 'google',
        modelId: 'gemini-2.5-flash'
      });

      const visibility = assertDegradedModeVisibility(result);
      expect(visibility.visible).toBe(true);
      expect(visibility.mode).toBeDefined();
      expect(visibility.severity).toBeDefined();
    });

    test('threshold semantics agree across loops', () => {
      const result = simulateProviderOutage({
        provider: 'moonshotai',
        modelId: 'kimi-k2.5'
      });

      const agreement = assertThresholdAgreement(result);
      expect(agreement.agreed).toBe(true);
      expect(agreement.contextBridge).toBeDefined();
      expect(agreement.governor).toBeDefined();
      expect(agreement.alertManager).toBeDefined();
    });

    test('liveness classification is appropriate', () => {
      const result = simulateProviderOutage({
        provider: 'z-ai',
        modelId: 'glm-5'
      });

      const classification = assertLivenessClassification(result);
      expect(classification.valid).toBe(true);
      expect(classification.state).toBeDefined();
    });
  });

  describe('ENOENT Spawn Scenario', () => {
    test('simulates ENOENT spawn failure', () => {
      const result = simulateENOENTSpawn({
        command: 'nonexistent-binary',
        args: ['--flag'],
        category: 'deep'
      });

      expect(result.scenario).toBe('enoent_spawn');
      expect(result.command).toBe('nonexistent-binary');
      expect(result.error).toBeDefined();
      expect(result.contained).toBe(true);
    });

    test('ENOENT is contained and observable', () => {
      const result = simulateENOENTSpawn({
        command: 'missing-tool',
        category: 'quick'
      });

      expect(result.contained).toBe(true);
      expect(result.observable).toBe(true);
      expect(result.classification).toBeDefined();
      expect(result.classification.type).toBe('enoent');
    });

    test('system does not silently continue on ENOENT', () => {
      const result = simulateENOENTSpawn({
        command: 'bun',
        category: 'visual-engineering'
      });

      expect(result.silentContinue).toBe(false);
      expect(result.explicitFailure).toBe(true);
    });
  });

  describe('Config Corruption Scenario', () => {
    test('simulates partial config corruption', () => {
      const result = simulateConfigCorruption({
        file: './opencode-config/oh-my-opencode.json',
        corruptionType: 'partial',
        affectedKeys: ['agents.atlas.model', 'categories.deep.model']
      });

      expect(result.scenario).toBe('config_corruption');
      expect(result.file).toBeDefined();
      expect(result.corruptionType).toBe('partial');
      expect(result.recovery).toBeDefined();
    });

    test('corruption is detected before runtime', () => {
      const result = simulateConfigCorruption({
        file: './opencode-config/compound-engineering.json',
        corruptionType: 'syntax_error'
      });

      expect(result.detected).toBe(true);
      expect(result.detectedAt).toBe('governance_check');
    });

    test('fallback is explicit on corruption', () => {
      const result = simulateConfigCorruption({
        file: './opencode-config/oh-my-opencode.json',
        corruptionType: 'missing_keys'
      });

      expect(result.fallback).toBeDefined();
      expect(result.fallback.explicit).toBe(true);
      expect(result.fallback.source).toBe('default');
    });
  });

  describe('Concurrent Sessions Scenario', () => {
    test('simulates concurrent session pressure', () => {
      const result = simulateConcurrentSessions({
        sessionCount: 5,
        categories: ['deep', 'quick', 'visual-engineering'],
        duration: 300000
      });

      expect(result.scenario).toBe('concurrent_sessions');
      expect(result.sessionCount).toBe(5);
      expect(result.isolation).toBeDefined();
      expect(result.budgetTracking).toBeDefined();
    });

    test('sessions are isolated', () => {
      const result = simulateConcurrentSessions({
        sessionCount: 3,
        categories: ['deep', 'ultrabrain', 'artistry']
      });

      expect(result.isolation.valid).toBe(true);
      expect(result.isolation.crossContamination).toBe(false);
    });

    test('budget is tracked per session', () => {
      const result = simulateConcurrentSessions({
        sessionCount: 4,
        categories: ['quick', 'quick', 'quick', 'quick']
      });

      expect(result.budgetTracking.perSession).toBe(true);
      expect(result.budgetTracking.aggregated).toBeDefined();
    });

    test('liveness is tracked per session', () => {
      const result = simulateConcurrentSessions({
        sessionCount: 2,
        categories: ['deep', 'writing']
      });

      expect(result.livenessTracking.perSession).toBe(true);
      expect(result.livenessTracking.states).toBeDefined();
      expect(result.livenessTracking.states.length).toBe(2);
    });
  });

  describe('Cross-Loop Coherence', () => {
    test('authority, degraded-mode, threshold, and liveness agree on severity', () => {
      const result = simulateProviderOutage({
        provider: 'openai',
        modelId: 'gpt-5.2',
        severity: 'critical'
      });

      // All control loops should agree on severity
      expect(result.authoritySnapshot.severity).toBe('critical');
      expect(result.degradedMode.severity).toBe('critical');
      expect(result.thresholdState.severity).toBe('critical');
      expect(result.livenessState.severity).toBe('critical');
    });

    test('no silent fallback on critical seams', () => {
      const result = simulateProviderOutage({
        provider: 'anthropic',
        modelId: 'claude-opus-4-6',
        severity: 'emergency'
      });

      expect(result.silentFallback).toBe(false);
      expect(result.explicitDegradation).toBe(true);
    });
  });
});
