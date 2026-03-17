import { describe, expect, test } from 'bun:test';
import { BenchmarkPipeline } from '../src/benchmark-pipeline.js';

describe('BenchmarkPipeline', () => {
  test('runForModel calls runner for each benchmark', async () => {
    const calls = [];
    const pipeline = new BenchmarkPipeline({
      runner: {
        benchmarks: ['humaneval', 'mbpp'],
        runBenchmark: async (modelId, benchmarkName) => {
          calls.push({ modelId, benchmarkName });
          return { modelId, benchmark: benchmarkName, summary: {} };
        }
      },
      comparator: {},
      hierarchyPlacer: {},
      documentUpdater: {}
    });

    const result = await pipeline.runForModel('model-a');
    expect(calls).toHaveLength(2);
    expect(result.modelId).toBe('model-a');
    expect(result.benchmarkResults).toHaveLength(2);
  });

  test('compareAndPlace calls comparator and hierarchy placer', async () => {
    let rankCalled = false;
    let determineCalled = false;
    let suggestCalled = false;

    const pipeline = new BenchmarkPipeline({
      runner: {},
      comparator: {
        rank: (modelIds) => {
          rankCalled = true;
          return modelIds.map((modelId, index) => ({ modelId, score: 1 - index }));
        }
      },
      hierarchyPlacer: {
        determineLevels: () => {
          determineCalled = true;
          return { alpha: { level: 'premium' } };
        },
        suggestChanges: () => {
          suggestCalled = true;
          return [{ modelId: 'alpha', direction: 'promote' }];
        }
      },
      documentUpdater: {}
    });

    const result = await pipeline.compareAndPlace(
      ['alpha'],
      {
        models: { alpha: { benchmarkScore: 0.9, latency: 600, reliability: 0.99 } },
        currentHierarchy: { alpha: { level: 'standard' } }
      }
    );

    expect(rankCalled).toBe(true);
    expect(determineCalled).toBe(true);
    expect(suggestCalled).toBe(true);
    expect(result.rankings).toHaveLength(1);
    expect(result.hierarchy.alpha.level).toBe('premium');
    expect(result.suggestions).toHaveLength(1);
  });

  test('updateDocumentation calls updater methods', async () => {
    const called = {
      docs: false,
      overview: false,
      changelog: false
    };

    const pipeline = new BenchmarkPipeline({
      runner: {},
      comparator: {},
      hierarchyPlacer: {},
      documentUpdater: {
        updateHierarchyDocs: async () => {
          called.docs = true;
          return [{ status: 'updated' }];
        },
        updateHierarchyOverview: async () => {
          called.overview = true;
          return { status: 'updated' };
        },
        generateChangelog: async () => {
          called.changelog = true;
          return { status: 'generated' };
        }
      }
    });

    const result = await pipeline.updateDocumentation(
      { alpha: { level: 'premium' } },
      [{ modelId: 'alpha', direction: 'promote' }]
    );

    expect(called.docs).toBe(true);
    expect(called.overview).toBe(true);
    expect(called.changelog).toBe(true);
    expect(result.changelog.status).toBe('generated');
  });

  test('runFullPipeline returns combined orchestration output', async () => {
    const pipeline = new BenchmarkPipeline({
      runner: {},
      comparator: {
        rank: () => [{ modelId: 'alpha', score: 0.9 }]
      },
      hierarchyPlacer: {
        determineLevels: () => ({ alpha: { level: 'premium' } }),
        suggestChanges: () => [{ modelId: 'alpha', direction: 'promote' }]
      },
      documentUpdater: {
        updateHierarchyDocs: async () => [{ modelId: 'alpha', status: 'updated' }],
        updateHierarchyOverview: async () => ({ status: 'updated' }),
        generateChangelog: async () => ({ status: 'generated' })
      }
    });

    const result = await pipeline.runFullPipeline(
      ['alpha'],
      {
        models: { alpha: { benchmarkScore: 0.95, latency: 400, reliability: 0.995 } },
        currentHierarchy: { alpha: { level: 'standard' } }
      }
    );

    expect(result.rankings[0].modelId).toBe('alpha');
    expect(result.hierarchy.alpha.level).toBe('premium');
    expect(result.suggestions).toHaveLength(1);
    expect(result.documentUpdates.hierarchyOverview.status).toBe('updated');
  });
});
