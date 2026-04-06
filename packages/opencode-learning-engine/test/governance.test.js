import { describe, test, expect, beforeEach } from 'bun:test';
import { OrchestrationAdvisor } from '../src/orchestration-advisor.js';

describe('Learning Governance', () => {
  let advisor;

  beforeEach(() => {
    advisor = new OrchestrationAdvisor();
  });

  describe('applyLearningToRouting', () => {
    test('returns unchanged advice when risk is low', () => {
      const advice = {
        advice_id: 'adv_123',
        warnings: [],
        suggestions: [],
        routing: { agent: 'hephaestus', skills: ['verification-before-completion'], confidence: 0.6 },
        risk_score: 5,
        quota_risk: 0.1,
        should_pause: false
      };

      const result = advisor.applyLearningToRouting(advice, { task_type: 'debug' });

      expect(result.learning_governance.applied).toBe(false);
      expect(result.routing.agent).toBe('hephaestus');
      expect(result.routing.confidence).toBe(0.6);
    });

    test('overrides agent when anti-pattern risk is high', () => {
      const advice = {
        advice_id: 'adv_123',
        warnings: [
          { type: 'failed_debug', context: { agent: 'hephaestus' }, strength: 'STRONG' }
        ],
        suggestions: [],
        routing: { agent: 'hephaestus', skills: [], confidence: 0.5 },
        risk_score: 25, // Above threshold
        quota_risk: 0.1,
        should_pause: false
      };

      const result = advisor.applyLearningToRouting(advice, { task_type: 'debug' });

      expect(result.learning_governance.applied).toBe(true);
      expect(result.learning_governance.overrides.length).toBeGreaterThan(0);
      expect(result.routing.agent).not.toBe('hephaestus'); // Should be overridden
      expect(result.routing.skills).toContain('verification-before-completion');
      expect(result.routing.confidence).toBeLessThan(0.5); // Reduced due to overrides
    });

    test('injects verification skill when risk is high', () => {
      const advice = {
        advice_id: 'adv_123',
        warnings: [{ type: 'broken_state', strength: 'STRONG' }],
        suggestions: [],
        routing: { agent: 'hephaestus', skills: [], confidence: 0.5 },
        risk_score: 30,
        quota_risk: 0.1,
        should_pause: false
      };

      const result = advisor.applyLearningToRouting(advice, { task_type: 'fix' });

      expect(result.learning_governance.applied).toBe(true);
      expect(result.routing.skills).toContain('verification-before-completion');
    });

    test('injects systematic-debugging when shotgun debugging detected', () => {
      const advice = {
        advice_id: 'adv_123',
        warnings: [{ type: 'shotgun_debug', strength: 'STRONG' }],
        suggestions: [],
        routing: { agent: 'hephaestus', skills: [], confidence: 0.5 },
        risk_score: 25,
        quota_risk: 0.1,
        should_pause: false
      };

      const result = advisor.applyLearningToRouting(advice, { task_type: 'debug' });

      expect(result.learning_governance.applied).toBe(true);
      expect(result.routing.skills).toContain('systematic-debugging');
      expect(result.routing.skills).toContain('verification-before-completion');
    });

    test('boosts confidence when positive pattern has high success rate', () => {
      // First, add a positive pattern
      advisor.positivePatterns.addPositivePattern({
        type: 'efficient_debug',
        description: 'Successful debug execution',
        success_rate: 0.95,
        context: { task_type: 'debug', skills: ['systematic-debugging'] }
      });

      const advice = {
        advice_id: 'adv_123',
        warnings: [],
        suggestions: [],
        routing: { agent: 'hephaestus', skills: [], confidence: 0.5 },
        risk_score: 2,
        quota_risk: 0.1,
        should_pause: false
      };

      const result = advisor.applyLearningToRouting(advice, { task_type: 'debug' });

      expect(result.learning_governance.applied).toBe(true);
      expect(result.learning_governance.boosts.length).toBeGreaterThan(0);
      expect(result.routing.confidence).toBeGreaterThan(0.5); // Boosted
    });

    test('respects custom thresholds', () => {
      const advice = {
        advice_id: 'adv_123',
        warnings: [{ type: 'failed_debug', strength: 'STRONG' }],
        suggestions: [],
        routing: { agent: 'hephaestus', skills: [], confidence: 0.5 },
        risk_score: 15,
        quota_risk: 0.1,
        should_pause: false
      };

      // With default threshold (20), no override
      const result1 = advisor.applyLearningToRouting(advice, { task_type: 'debug' });
      expect(result1.learning_governance.applied).toBe(false);

      // With lower threshold (10), override applies
      const result2 = advisor.applyLearningToRouting(advice, { task_type: 'debug' }, {
        antiPatternOverrideRisk: 10
      });
      expect(result2.learning_governance.applied).toBe(true);
    });

    test('caps skills at 5', () => {
      advisor.positivePatterns.addPositivePattern({
        type: 'efficient_debug',
        description: 'Successful debug',
        success_rate: 0.9,
        context: { skills: ['skill1', 'skill2', 'skill3'] }
      });

      const advice = {
        advice_id: 'adv_123',
        warnings: [{ type: 'shotgun_debug', strength: 'STRONG' }],
        suggestions: [],
        routing: { agent: 'hephaestus', skills: ['existing1', 'existing2'], confidence: 0.5 },
        risk_score: 25,
        quota_risk: 0.1,
        should_pause: false
      };

      const result = advisor.applyLearningToRouting(advice, { task_type: 'debug' });

      expect(result.routing.skills.length).toBeLessThanOrEqual(5);
    });

    test('LEARNING_OVERRIDE event metadata is present', () => {
      const advice = {
        advice_id: 'adv_123',
        warnings: [{ type: 'failed_debug', context: { agent: 'hephaestus' }, strength: 'STRONG' }],
        suggestions: [],
        routing: { agent: 'hephaestus', skills: [], confidence: 0.5 },
        risk_score: 25,
        quota_risk: 0.1,
        should_pause: false
      };

      const result = advisor.applyLearningToRouting(advice, { task_type: 'debug' });

      expect(result.learning_governance).toBeDefined();
      expect(result.learning_governance.overrides).toBeDefined();
      expect(result.learning_governance.boosts).toBeDefined();
    });
  });
});
