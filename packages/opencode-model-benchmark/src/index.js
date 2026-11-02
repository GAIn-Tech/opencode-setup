/**
 * opencode-model-benchmark - Model benchmarking pipeline
 */

/**
 * @deprecated This package is currently orphaned — it has no callers in the integration layer.
 * Pending: either wire into integration-layer or formally deprecate and remove.
 * See orchestration-fixes audit (March 2026), Gap #32.
 */

export { ModelBenchmarkRunner, BENCHMARKS } from './benchmark-runner.js';
export { ModelComparator } from './model-comparator.js';
export { HierarchyPlacer, HIERARCHY_LEVELS } from './hierarchy-placer.js';
export { DocumentUpdater } from './document-updater.js';
export { BenchmarkPipeline } from './benchmark-pipeline.js';
