export class BenchmarkPipeline {
  constructor({ runner, comparator, hierarchyPlacer, documentUpdater }) {
    this.runner = runner;
    this.comparator = comparator;
    this.hierarchyPlacer = hierarchyPlacer;
    this.documentUpdater = documentUpdater;
  }

  async runForModel(modelId, options = {}) {
    const benchmarks = options.benchmarks || this.runner?.benchmarks || [];
    const benchmarkResults = [];

    for (const benchmarkName of benchmarks) {
      const result = await this.runner.runBenchmark(modelId, benchmarkName, options);
      benchmarkResults.push(result);
    }

    return {
      modelId,
      benchmarkResults
    };
  }

  async compareAndPlace(modelIds, performanceData) {
    const rankings = this.comparator.rank(modelIds, performanceData);
    const hierarchy = this.hierarchyPlacer.determineLevels(performanceData.models || {});
    const suggestions = performanceData.currentHierarchy
      ? this.hierarchyPlacer.suggestChanges(performanceData.currentHierarchy, performanceData.models || {})
      : [];

    return { rankings, hierarchy, suggestions };
  }

  async updateDocumentation(hierarchy, suggestions) {
    const hierarchyDocs = await this.documentUpdater.updateHierarchyDocs(hierarchy);
    const hierarchyOverview = await this.documentUpdater.updateHierarchyOverview(hierarchy);
    const changelog = suggestions?.length
      ? await this.documentUpdater.generateChangelog(suggestions)
      : null;

    return {
      hierarchyDocs,
      hierarchyOverview,
      changelog
    };
  }

  async runFullPipeline(modelIds, performanceData, options = {}) {
    const { rankings, hierarchy, suggestions } = await this.compareAndPlace(modelIds, performanceData, options);
    const documentUpdates = await this.updateDocumentation(hierarchy, suggestions);

    return {
      rankings,
      hierarchy,
      suggestions,
      documentUpdates
    };
  }
}

export default BenchmarkPipeline;
