// @ts-nocheck
const { afterEach, beforeEach, describe, expect, test } = require('bun:test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const { AutoApprovalRules } = require('../../src/lifecycle/auto-approval-rules');

function createModel(overrides = {}) {
  return {
    id: 'gpt-5',
    provider: 'openai',
    version: '1.0.0',
    contextTokens: 100000,
    deprecated: false,
    ...overrides
  };
}

function createChange(overrides = {}) {
  return {
    type: 'modified',
    classification: 'minor',
    provider: 'openai',
    model: createModel(),
    changes: {
      'pricing.input': { old: 2, new: 3 }
    },
    ...overrides
  };
}

describe('AutoApprovalRules', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'auto-approval-rules-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  test('calculates full risk factors and clamps score to 100', () => {
    const rules = new AutoApprovalRules({
      trustedProviders: ['openai'],
      untrustedProviders: ['legacy-provider']
    });

    const result = rules.evaluate(
      createChange({
        classification: 'major',
        provider: 'legacy-provider',
        changes: {
          contextTokens: { old: 100000, new: 170000 },
          deprecated: { old: false, new: true }
        }
      }),
      createModel({ provider: 'legacy-provider' })
    );

    expect(result.factors).toEqual({
      changeType: 20,
      classification: 50,
      provider: 50,
      contextWindow: 40,
      deprecated: 60
    });
    expect(result.score).toBe(100);
    expect(result.recommendation).toBe('block');
  });

  test('auto-approves metadata-only pricing updates from trusted providers', () => {
    const rules = new AutoApprovalRules({
      trustedProviders: ['openai', 'anthropic']
    });

    const result = rules.evaluate(
      createChange({
        provider: 'openai',
        changes: {
          'pricing.input': { old: 2, new: 2.5 },
          'pricing.output': { old: 8, new: 8.5 }
        }
      }),
      createModel({ provider: 'openai' })
    );

    expect(result.recommendation).toBe('auto-approve');
    expect(result.score).toBeLessThanOrEqual(50);
    expect(rules.shouldAutoApprove(result)).toBe(true);
    expect(result.matchedRules).toContain('metadataOnly');
    expect(result.audit.autoApproved).toBe(true);
    expect(result.audit.metadata.matchedRules).toContain('metadataOnly');
  });

  test('auto-approves patch version bump rule', () => {
    const rules = new AutoApprovalRules({
      trustedProviders: ['openai']
    });

    const result = rules.evaluate(
      createChange({
        provider: 'openai',
        changes: {
          version: { old: '1.0', new: '1.0.1' }
        }
      }),
      createModel({ provider: 'openai', version: '1.0.1' })
    );

    expect(result.recommendation).toBe('auto-approve');
    expect(result.score).toBe(10);
    expect(result.matchedRules).toContain('patchVersion');
  });

  test('routes capability changes to manual review', () => {
    const rules = new AutoApprovalRules({
      trustedProviders: ['openai']
    });

    const result = rules.evaluate(
      createChange({
        provider: 'openai',
        classification: 'minor',
        changes: {
          'capabilities.tools': { old: false, new: true }
        }
      }),
      createModel({ provider: 'openai' })
    );

    expect(result.recommendation).toBe('manual-review');
    expect(result.score).toBeGreaterThan(50);
    expect(result.score).toBeLessThanOrEqual(80);
    expect(result.matchedRules).toContain('majorChange');
  });

  test('blocks model removals and untrusted providers', () => {
    const rules = new AutoApprovalRules({
      trustedProviders: ['openai'],
      untrustedProviders: ['external-lab']
    });

    const removedResult = rules.evaluate(
      createChange({
        type: 'removed',
        classification: 'major',
        provider: 'openai',
        changes: {}
      }),
      createModel({ provider: 'openai' })
    );

    const untrustedResult = rules.evaluate(
      createChange({
        provider: 'external-lab',
        classification: 'minor',
        changes: {
          displayName: { old: 'Model A', new: 'Model A+' }
        }
      }),
      createModel({ provider: 'external-lab' })
    );

    expect(removedResult.recommendation).toBe('block');
    expect(removedResult.score).toBeGreaterThan(80);
    expect(removedResult.matchedRules).toContain('blocked');

    expect(untrustedResult.recommendation).toBe('block');
    expect(untrustedResult.score).toBeGreaterThan(80);
    expect(untrustedResult.matchedRules).toContain('blocked');
  });

  test('loads configuration from JSON and YAML with threshold overrides', async () => {
    const rules = new AutoApprovalRules();

    rules.loadConfig(JSON.stringify({
      thresholds: {
        autoApprove: 40,
        manualReview: 70
      },
      trustedProviders: ['internal-test'],
      rules: {
        metadataOnly: { score: 3, autoApprove: true },
        patchVersion: { score: 8, autoApprove: true },
        majorChange: { score: 55, autoApprove: false }
      }
    }));

    expect(rules.getRecommendation(40)).toBe('auto-approve');
    expect(rules.getRecommendation(65)).toBe('manual-review');
    expect(rules.getRecommendation(71)).toBe('block');

    const yamlConfigPath = path.join(tempDir, 'auto-approval-rules.yaml');
    await fs.writeFile(yamlConfigPath, [
      'thresholds:',
      '  autoApprove: 35',
      '  manualReview: 75',
      'trustedProviders:',
      '  - internal-test',
      'rules:',
      '  metadataOnly:',
      '    score: 2',
      '    autoApprove: true',
      '  patchVersion:',
      '    score: 6',
      '    autoApprove: true',
      '  majorChange:',
      '    score: 60',
      '    autoApprove: false'
    ].join('\n'), 'utf8');

    rules.loadConfig(yamlConfigPath);

    const yamlConfiguredResult = rules.evaluate(
      createChange({
        provider: 'internal-test',
        changes: {
          'pricing.input': { old: 1, new: 1.2 }
        }
      }),
      createModel({ provider: 'internal-test' })
    );

    expect(yamlConfiguredResult.score).toBe(2);
    expect(yamlConfiguredResult.recommendation).toBe('auto-approve');
  });

  test('evaluates diff collections using model id targeting', () => {
    const rules = new AutoApprovalRules({ trustedProviders: ['openai'] });

    const result = rules.evaluate(
      {
        added: [],
        removed: [],
        modified: [
          createChange({
            model: createModel({ id: 'model-a' }),
            changes: {
              'capabilities.vision': { old: false, new: true }
            }
          }),
          createChange({
            model: createModel({ id: 'model-b' }),
            changes: {
              'pricing.input': { old: 2, new: 2.1 }
            }
          })
        ]
      },
      createModel({ id: 'model-b', provider: 'openai' })
    );

    expect(result.recommendation).toBe('auto-approve');
    expect(result.audit.metadata.modelId).toBe('model-b');
    expect(result.matchedRules).toContain('metadataOnly');
  });
});
