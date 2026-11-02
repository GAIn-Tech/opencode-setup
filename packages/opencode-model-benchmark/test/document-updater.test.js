import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import fs from 'fs/promises';
import os from 'os';
import { join } from 'path';
import { DocumentUpdater } from '../src/document-updater.js';

describe('DocumentUpdater', () => {
  let tempRoot;
  let docsPath;
  let updater;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(join(os.tmpdir(), 'benchmark-docs-'));
    docsPath = join(tempRoot, 'docs');
    await fs.mkdir(join(docsPath, 'models'), { recursive: true });
    updater = new DocumentUpdater({ docsPath, configPath: join(tempRoot, 'config') });
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  test('generateModelDoc returns expected markdown sections', () => {
    const content = updater.generateModelDoc('model-a', {
      level: 'premium',
      confidence: 0.93,
      reason: 'Excellent benchmark score',
      performance: {
        benchmarkScore: 0.91,
        latency: 500,
        reliability: 0.995,
        cost: 4.2
      }
    });

    expect(content).toContain('# Model: model-a');
    expect(content).toContain('## Hierarchy Level');
    expect(content).toContain('## Performance Summary');
    expect(content).toContain('## Use Cases');
  });

  test('generateHierarchyOverview returns table output', () => {
    const content = updater.generateHierarchyOverview({
      alpha: { level: 'premium' },
      beta: { level: 'standard' }
    });

    expect(content).toContain('# Model Hierarchy');
    expect(content).toContain('| Level | Models | Description |');
    expect(content).toContain('| premium | alpha |');
  });

  test('generateChangelogEntry formats promotion and demotion entries', () => {
    const content = updater.generateChangelogEntry([
      {
        modelId: 'alpha',
        direction: 'promote',
        currentLevel: 'standard',
        suggestedLevel: 'premium',
        reason: 'Strong gains'
      },
      {
        modelId: 'beta',
        direction: 'demote',
        currentLevel: 'premium',
        suggestedLevel: 'standard',
        reason: 'Increased latency'
      }
    ]);

    expect(content).toContain('↑ alpha: standard → premium');
    expect(content).toContain('↓ beta: premium → standard');
  });

  test('getUseCases returns level-specific defaults', () => {
    expect(updater.getUseCases('premium')).toContain('Complex reasoning tasks');
    expect(updater.getUseCases('standard')).toContain('General coding tasks');
    expect(updater.getUseCases('economy')).toContain('Simple queries');
    expect(updater.getUseCases('fallback')).toContain('Last resort requests');
  });

  test('updateModelDoc writes file in temp directory', async () => {
    const result = await updater.updateModelDoc('alpha', {
      level: 'standard',
      confidence: 0.8,
      reason: 'Stable performance'
    });

    expect(result.status).toBe('updated');
    const fileContent = await fs.readFile(join(docsPath, 'models', 'alpha.md'), 'utf8');
    expect(fileContent).toContain('# Model: alpha');
  });

  test('updateHierarchyOverview writes hierarchy markdown file', async () => {
    const result = await updater.updateHierarchyOverview({
      alpha: { level: 'premium' },
      beta: { level: 'economy' }
    });

    expect(result.status).toBe('updated');
    const fileContent = await fs.readFile(join(docsPath, 'models', 'HIERARCHY.md'), 'utf8');
    expect(fileContent).toContain('| premium | alpha |');
    expect(fileContent).toContain('| economy | beta |');
  });
});
