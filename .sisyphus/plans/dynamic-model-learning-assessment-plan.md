# Dynamic Model Learning & Assessment Plan

**Objective**: Build an adaptive orchestration system that continuously learns model strengths and standardizes new model integration.

**Working Directory**: `C:\Users\jack\work\opencode-setup`

**Context**: Built on top of the 6-layer fallback orchestration framework and model scoring matrix (v2.0).

---

## Part 1: Dynamic Exploration Mode

### Overview

An optional mode that dynamically selects models for the purpose of gathering performance data, building a "model comprehension memory" for future orchestration improvements.

### Key Requirements

1. **Task-Aware Selection**: Choose models that are purported to perform well for the task type
2. **Performance Tracking**: Record accuracy, speed, cost, success rate for each model-task pair
3. **Learning Storage**: Commit data to model comprehension memory for RL/enhanced orchestration
4. **Token Budget Awareness**: Exploration shouldn't explode costs; use proportional budgeting
5. **Manual + Automatic**: Can be manually activated or triggered by specific conditions

### Architecture

```
[User/Agent Request]
         ↓
[Task Classifier] → intent_category + granular_signals
         ↓
[ExplorationMode] ← activated?
         ↓ [YES]
[ModelCandidateSelector] ← candidate models for this task
         ↓
[PerformanceTracker] ← metrics collection per model
         ↓
[ModelComprehensionMemory] ← store performance data
         ↓
[SkillRLManager] ← update RL model selection weights
         ↓
[OrchestrationController] ← improved future selections
```

### Core Components

#### 1. ExplorationMode (`packages/opencode-model-router-x/src/exploration-mode.js`)

** Responsibility**: Manages exploration activation and candidate selection

```javascript
class ExplorationMode {
  constructor({
    isActive,              // boolean: mode enabled?
    tokenBudgetRatio,      // number: 0.05-0.20 (5-20% of total budget)
    samplingStrategy,      // 'epsilon-greedy' | 'thompson-sampling' | 'ucb'
    explorationInterval,   // number: explore every N tasks
    cooldownPeriod,        // number: ms between exploration of same model
  }) {
    this.isActive = isActive;
    this.tokenBudgetRatio = tokenBudgetRatio;
    this.samplingStrategy = samplingStrategy;
    this.explorationInterval = explorationInterval;
    this.cooldownPeriod = cooldownPeriod;
    this.lastExploredModels = new Map(); // model_id → last_explored_at timestamp
    this.taskCounter = 0;
  }

  shouldExplore({ taskCategory, granularSignals, availableTokens }) {
    // 1. Mode must be active
    if (!this.isActive) return false;

    // 2. Have budget?
    const explorationBudget = availableTokens * this.tokenBudgetRatio;
    if (explorationBudget < 1000) return false; // Need minimum budget

    // 3. Interval-based sampling
    this.taskCounter++;
    return this.taskCounter % this.explorationInterval === 0;
  }

  selectCandidateModel({ taskCategory, models, comprehensionMemory }) {
    const candidates = comprehensionMemory.getModelsForTask(taskCategory);
    const candidatesWithMetrics = candidates.map(model => ({
      model,
      metrics: comprehensionMemory.getMetrics(taskCategory, model.id)
    }));

    switch (this.samplingStrategy) {
      case 'epsilon-greedy': return this.selectEpsilonGreedy(candidatesWithMetrics);
      case 'thompson-sampling': return this.selectThompsonSampling(candidatesWithMetrics);
      case 'ucb': return this.selectUCB(candidatesWithMetrics);
      default: return this.selectEpsilonGreedy(candidatesWithMetrics);
    }
  }

  selectEpsilonGreedy(candidates) {
    // Epsilon = 0.1 (10% explore, 90% exploit)
    if (Math.random() < 0.1) {
      // Explore: uniform random
      return candidates[Math.floor(Math.random() * candidates.length)];
    }
    // Exploit: select best avg_score
    return candidates.sort((a, b) => b.metrics.avg_score - a.metrics.avg_score)[0];
  }

  selectThompsonSampling(candidates) {
    // Sample from Beta(alpha=successes, beta=failures)
    const samples = candidates.map(c => ({
      model: c.model,
      sample: this.sampleBeta(c.metrics.successes, c.metrics.failures)
    }));
    return samples.sort((a, b) => b.sample - a.sample)[0].model;
  }

  sampleBeta(alpha, beta) {
    // Approximation using gamma distribution
    const sample1 = this.sampleGamma(alpha, 1);
    const sample2 = this.sampleGamma(beta, 1);
    return sample1 / (sample1 + sample2);
  }

  selectUCB(candidates) {
    // Upper Confidence Bound: avg + confidence
    return candidates.reduce((best, current) => {
      const score = current.metrics.avg_score + this.calculateConfidence(current.metrics);
      return score > best.score ? { model: current.model, score } : best;
    }, { model: null, score: -Infinity }).model;
  }

  calculateConfidence(metrics) {
    // c * sqrt(log(total_samples) / n)
    const totalSamples = metrics.total_samples;
    const n = metrics.samples_for_this_model;
    return 2.0 * Math.sqrt(Math.log(totalSamples) / n);
  }
}
```

#### 2. PerformanceTracker (`packages/opencode-model-router-x/src/performance-tracker.js`)

** Responsibility**: Collects and records performance metrics

```javascript
class PerformanceTracker {
  constructor({ storage }) {
    this.storage = storage; // SQLite/WAL for durability
  }

  track({ taskId, modelId, taskCategory, request, response, duration }) {
    const metrics = {
      // Meta
      timestamp: Date.now(),
      task_id: taskId,
      model_id: modelId,
      task_category: taskCategory,

      // Request
      input_tokens: request.inputTokens,
      output_tokens: request.outputTokens,
      tool_count: request.toolCount,

      // Response
      success: response.success, // boolean: completed without error
      latency_ms: duration,
      ttft_ms: response.timeToFirstToken,
      tpot_ms: response.tokensPerOutputToken,
      error_type: response.errorType || null,

      // Quality (estimated or verified)
      quality_score: this.estimateQuality(request, response), // 0-1
      reasoning_efficiency: this.calculateReasoningEfficiency(request, response),

      // Cost
      cost_usd: this.calculateCost(modelId, inputTokens, outputTokens),
    };

    return this.storage.insert('performance_metrics', metrics);
  }

  estimateQuality(request, response) {
    // If Showboat evidence exists, use that
    if (response.evidence?.verification_passed) {
      return 1.0;
    }

    // Simple heuristic: longer responses may be better? (naive)
    if (response.outputTokens < 50) return 0.1;
    if (response.outputTokens < 200) return 0.5;
    return 0.8;
  }

  calculateReasoningEfficiency(request, response) {
    // Thinking tokens / total output tokens
    const thinkingTokens = request.thinkingTokens || 0;
    const outputTokens = response.outputTokens || 0;

    if (outputTokens === 0) return 0;
    return thinkingTokens / outputTokens; // 0-1
  }

  calculateCost(modelId, inputTokens, outputTokens) {
    const pricing = MODEL_PRICING[modelId] || DEFAULT_PRICING;
    const costInput = (inputTokens / 1000) * pricing.input_per_1k;
    const costOutput = (outputTokens / 1000) * pricing.output_per_1k;
    return costInput + costOutput;
  }
}
```

#### 3. ModelComprehensionMemory (`packages/opencode-model-router-x/src/comprehension-memory.js`)

** Responsibility**: Storage and retrieval of model performance data

```javascript
class ModelComprehensionMemory {
  constructor({ dbPath }) {
    this.db = new Database(dbPath);
    this.initializeSchema();
  }

  initializeSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS model_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        task_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        task_category TEXT NOT NULL,

        -- Request
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        tool_count INTEGER NOT NULL,

        -- Response
        success BOOLEAN NOT NULL,
        latency_ms INTEGER NOT NULL,
        error_type TEXT,

        -- Quality
        quality_score REAL,
        reasoning_efficiency REAL,

        -- Cost
        cost_usd REAL
      );

      CREATE INDEX IF NOT EXISTS idx_model_task ON model_performance(model_id, task_category);
      CREATE INDEX IF NOT EXISTS idx_task_category ON model_performance(task_category);
    `);
  }

  recordPerformance(metrics) {
    const stmt = this.db.prepare(`
      INSERT INTO model_performance (
        timestamp, task_id, model_id, task_category,
        input_tokens, output_tokens, tool_count,
        success, latency_ms, error_type,
        quality_score, reasoning_efficiency, cost_usd
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      metrics.timestamp,
      metrics.task_id,
      metrics.model_id,
      metrics.task_category,
      metrics.input_tokens,
      metrics.output_tokens,
      metrics.tool_count,
      metrics.success ? 1 : 0,
      metrics.latency_ms,
      metrics.error_type,
      metrics.quality_score,
      metrics.reasoning_efficiency,
      metrics.cost_usd
    );
  }

  getMetrics(taskCategory, modelId) {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total_samples,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures,
        AVG(quality_score) as avg_quality,
        AVG(latency_ms) as avg_latency,
        AVG(cost_usd) as avg_cost,
        AVG(reasoning_efficiency) as avg_reasoning_efficiency
      FROM model_performance
      WHERE task_category = ? AND model_id = ?
    `);

    const row = stmt.get(taskCategory, modelId);

    return {
      total_samples: row.total_samples,
      successes: row.successes,
      failures: row.failures,
      avg_score: row.avg_quality,
      avg_latency: row.avg_latency,
      avg_cost: row.avg_cost,
      avg_reasoning_efficiency: row.avg_reasoning_efficiency,
      samples_for_this_model: row.total_samples, // For UCB
    };
  }

  getModelsForTask(taskCategory) {
    const stmt = this.db.prepare(`
      SELECT DISTINCT model_id
      FROM model_performance
      WHERE task_category = ?
    `);

    return stmt.all(taskCategory).map(row => ({ id: row.model_id }));
  }

  getBestModelForTask(taskCategory, metric = 'avg_score') {
    const stmt = this.db.prepare(`
      SELECT model_id, AVG(quality_score) as score
      FROM model_performance
      WHERE task_category = ?
      GROUP BY model_id
      ORDER BY score DESC
      LIMIT 1
    `);

    const row = stmt.get(taskCategory);
    return row ? { model_id: row.model_id, score: row.score } : null;
  }
}
```

#### 4. RL Integration (`packages/opencode-skill-rl-manager/src/exploration-adapter.js`)

** Responsibility**: Feed exploration data to RL learning

```javascript
class ExplorationRLAdapter {
  constructor({ comprehensionMemory, rlModel }) {
    this.comprehensionMemory = comprehensionMemory;
    this.rlModel = rlModel; // Existing RL model in SkillRL package
  }

  updateRLModel(taskCategory) {
    // Get aggregate metrics for all models on this task
    const metrics = this.getAllMetricsForTask(taskCategory);

    // Convert to RL format
    const rlState = {
      task_category: taskCategory,
      candidates: metrics.map(m => ({
        model_id: m.model_id,
        features: [
          m.avg_quality,      // Accuracy
          m.avg_latency,      // Speed
          m.avg_cost,         // Cost
          m.success_rate,     // Reliability
          m.avg_reasoning_efficiency, // Reasoning efficiency
        ]
      }))
    };

    // Update RL model weights
    this.rlModel.train(rlState);
  }

  getAllMetricsForTask(taskCategory) {
    const stmt = this.comprehensionMemory.db.prepare(`
      SELECT
        model_id,
        COUNT(*) as total_samples,
        AVG(quality_score) as avg_quality,
        AVG(latency_ms) as avg_latency,
        AVG(cost_usd) as avg_cost,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as success_rate,
        AVG(reasoning_efficiency) as avg_reasoning_efficiency
      FROM model_performance
      WHERE task_category = ?
      GROUP BY model_id
    `);

    return stmt.all(taskCategory);
  }
}
```

### Activation Strategies

#### Manual Activation

User can activate exploration mode via:
- Environment variable: `OPENCODE_EXPLORATION_MODE=1`
- CLI flag: `opencode --explore`
- Runtime API: `explorationMode.activate({ tokenBudgetRatio: 0.1 })`

#### Automatic Activation (Optional Future Enhancement)

Trigger exploration when:
- New model added (Part 2 below)
- Performance degradation detected (model success rate drops below threshold)
- Significant task distribution shift (new task category appears)
- On a schedule (e.g., 5% of daily volume always explores)

### Token Budget Management

Exploration mode respects token limits:

```javascript
class TokenBudgetManager {
  constructor({ totalBudget, explorationRatio }) {
    this.totalBudget = totalBudget; // From quota system
    this.explorationRatio = explorationRatio; // 0.05-0.20
    this.usedTokens = 0;
    this.explorationUsed = 0;
  }

  canSpendTokens(tokens, isExploration = false) {
    const explorationBudget = this.totalBudget * this.explorationRatio;
    const productionBudget = this.totalBudget - explorationBudget;

    if (isExploration) {
      return (this.explorationUsed + tokens) <= explorationBudget;
    } else {
      return (this.usedTokens + tokens) <= productionBudget;
    }
  }

  recordSpent(tokens, isExploration = false) {
    if (isExploration) {
      this.explorationUsed += tokens;
    } else {
      this.usedTokens += tokens;
    }
  }
}
```

---

## Part 2: Standard Protocol for New Model Assessment

### Overview

An automated pipeline that runs when a provider adds a new model, benchmarks it against existing models, and integrates it into the orchestration system.

### Workflow

```
[Provider Releases New Model]
         ↓
[ModelDiscoveryService] ← detects new model (API, docs, webhook)
         ↓
[ModelRegistration] ← add to registry, extract specs
         ↓
[BenchmarkRunner] ← run standard benchmarks
         ↓
[ModelComparator] ← compare to existing models
         ↓
[HierarchyPlacer] ← place in 6-layer fallback
         ↓
[DocumentUpdater] ← update scoring matrix, fallback tables
         ↓
[OrchestrationUpdater] ← reload routing configuration
         ↓
[ExplorationMode] ← enable early-phase exploration to gather real-world data
```

### Core Components

#### 1. ModelDiscoveryService (`packages/opencode-model-router-x/src/model-discovery.js`)

** Responsibility**: Automatically detects new models from providers

```javascript
class ModelDiscoveryService {
  constructor({ providers, interval, db }) {
    this.providers = providers; // Array of provider configs
    this.interval = interval; // 15-60 minutes
    this.db = db;
    this.knownModels = new Set();
  }

  async discoverAll() {
    for (const provider of this.providers) {
      const models = await this.discoverProviderModels(provider);

      for (const model of models) {
        if (!this.knownModels.has(model.id)) {
          await this.handleNewModel(model, provider);
          this.knownModels.add(model.id);
        }
      }
    }
  }

  async discoverProviderModels(provider) {
    try {
      if (provider.api) {
        // Use /v1/models endpoint
        return await this.fetchFromAPI(provider);
      } else if (provider.documentation_url) {
        // Scraping fallback
        return await this.fetchFromDocs(provider);
      } else {
        // Community source fallback
        return await this.fetchFromCommunity(provider);
      }
    } catch (error) {
      console.error(`Failed to discover models from ${provider.name}:`, error);
      return [];
    }
  }

  async fetchFromAPI(provider) {
    const response = await fetch(`${provider.base_url}/v1/models`, {
      headers: {
        'Authorization': `Bearer ${provider.api_key}`,
        'User-Agent': 'OpenCode-ModelDiscovery/1.0'
      }
    });

    const data = await response.json();
    return data.data.map(model => ({
      id: model.id,
      provider: provider.name,
      created: model.created,
      object: model.object,
      ...this.extractCapabilities(model)
    }));
  }

  async fetchFromDocs(provider) {
    // Use Playwright/Selenium to scrape documentation
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(provider.documentation_url);

    // Extract model specs from page
    const models = await page.evaluate(() => {
      // Provider-specific extraction logic
      return document.querySelectorAll('.model-spec').map(spec => ({
        id: spec.querySelector('.model-id').textContent,
        context_window: parseInt(spec.querySelector('.context-window').textContent),
        pricing: JSON.parse(spec.querySelector('.pricing').textContent)
      }));
    });

    await browser.close();
    return models;
  }

  async fetchFromCommunity(provider) {
    // Check LiteLLM or Aider community JSON
    const response = await fetch('https://raw.githubusercontent.com/litellm/litellm/master/model_prices_and_context_window.json');
    const data = await response.json();

    return Object.entries(data)
      .filter(([modelId, spec]) => spec.litellm_params?.provider === provider.name)
      .map(([modelId, spec]) => ({
        id: modelId,
        provider: provider.name,
        context_window: spec.context_window,
        pricing: spec.input_cost_per_token,
      }));
  }

  async handleNewModel(model, provider) {
    console.log(`🎉 New model discovered: ${model.id} from ${provider.name}`);

    // 1. Register in database
    await this.registerModel(model, provider);

    // 2. Trigger benchmark pipeline
    await benchmarkRunner.runBenchmarks(model);

    // 3. Place in hierarchy and update docs
    await hierarchyPlacer.placeModel(model);
  }

  async registerModel(model, provider) {
    await this.db.run(`
      INSERT INTO models (id, provider, context_window, pricing, specs, discovered_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [model.id, provider.name, model.context_window, JSON.stringify(model.pricing), JSON.stringify(model), Date.now()]);
  }
}
```

#### 2. BenchmarkRunner (`packages/opencode-model-benchmark/runner.js`)

** Responsibility**: Runs standard benchmarks on new models

```javascript
class BenchmarkRunner {
  constructor({ db, modelClient }) {
    this.db = db;
    this.modelClient = modelClient; // Generic client for calling any model
    this.benchmarks = {
      human_eval: this.runHumanEval.bind(this),
      mbpp: this.runMBPP.bind(this),
      swe_bench: this.runSWEBench.bind(this),
      custom_coding: this.runCustomCoding.bind(this),
      reasoning: this.runReasoning.bind(this),
      documentation: this.runDocumentation.bind(this),
    };
  }

  async runBenchmarks(model) {
    const results = {};

    for (const [benchmarkName, benchmarkFn] of Object.entries(this.benchmarks)) {
      try {
        console.log(`Running ${benchmarkName} on ${model.id}...`);
        results[benchmarkName] = await benchmarkFn(model);
      } catch (error) {
        console.error(`Benchmark ${benchmarkName} failed:`, error);
        results[benchmarkName] = { error: error.message };
      }
    }

    // Store results
    await this.storeBenchmarkResults(model.id, results);

    return results;
  }

  async runHumanEval(model) {
    const humanEvalData = await this.loadHumanEvalDataset(); // 164 problems

    const results = {
      total: humanEvalData.length,
      correct: 0,
      pass_at_1: 0,
      timeout: 0,
      error: 0,
    };

    for (const problem of humanEvalData) {
      try {
        const startTime = Date.now();
        const response = await this.modelClient.completions({
          model: model.id,
          prompt: problem.prompt,
          max_tokens: 500,
          temperature: 0.2,
        });

        const timeout = (Date.now() - startTime) > 60000; // 60s timeout

        if (timeout) {
          results.timeout++;
          continue;
        }

        // Execute code and check correctness
        const isCorrect = await this.evaluatePythonCode(response.text, problem.test);

        if (isCorrect) {
          results.correct++;
          results.pass_at_1++;
        }
      } catch (error) {
        results.error++;
      }
    }

    results.pass_rate = (results.correct / results.total) * 100;
    return results;
  }

  async runMBPP(model) {
    const mbppData = await this.loadMBPPDataset(); // ~1000 basic problems

    const results = {
      total: mbppData.length,
      correct: 0,
      avg_response_time: 0,
    };

    const startTime = Date.now();

    for (const problem of mbppData.slice(0, 100)) { // Sample 100 for speed
      try {
        const response = await this.modelClient.completions({
          model: model.id,
          prompt: problem.text,
          max_tokens: 300,
          temperature: 0.0,
        });

        const isCorrect = await this.evaluatePythonCode(response.text, problem.test_list);

        if (isCorrect) results.correct++;
      } catch (error) { /* ignore */ }
    }

    results.avg_response_time = (Date.now() - startTime) / 100;
    results.pass_rate = (results.correct / 100) * 100;
    return results;
  }

  async runSWEBench(model) {
    // SWE-bench is complex (requires full git repo)
    // For MVP, we can run a simplified version:
    // Sample 50 issues, generate patches, verify against test suites

    const sweBenchData = await this.loadSWEBenchDataset();

    const results = {
      total: 50,
      correct: 0,
    };

    for (const issue of sweBenchData.slice(0, 50)) {
      try {
        const response = await this.modelClient.completions({
          model: model.id,
          prompt: this.buildSWEPrompt(issue),
          max_tokens: 1000,
          temperature: 0.0,
        });

        const isCorrect = await this.verifySWEPatch(response.text, issue);

        if (isCorrect) results.correct++;
      } catch (error) { /* ignore */ }
    }

    results.pass_rate = (results.correct / results.total) * 100;
    return results;
  }

  async evaluatePythonCode(code, testCode) {
    // Use a sandbox (Docker container or Pyodide)
    try {
      const pyodide = await loadPyodide();
      await pyodide.loadPackage(['numpy', 'pandas']);

      // Execute code + test
      const fullCode = `${code}\n${testCode}`;
      await pyodide.runPythonAsync(fullCode);

      // Check if tests passed (no exceptions)
      return true;
    } catch (error) {
      return false;
    }
  }
}
```

#### 3. ModelComparator (`packages/opencode-model-benchmark/comparator.js`)

** Responsibility**: Compares new model to existing models across dimensions

```javascript
class ModelComparator {
  constructor({ db }) {
    this.db = db;
  }

  async compareModel(newModelId) {
    const newModelBenchmark = await this.getBenchmarkData(newModelId);

    const existingModels = await this.getAllExistingModels();
    const comparisons = {};

    for (const existingModel of existingModels) {
      const existingBenchmark = await this.getBenchmarkData(existingModel.id);

      comparisons[existingModel.id] = {
        accuracy_delta: this.compareAccuracy(newModelBenchmark, existingBenchmark),
        speed_delta: this.compareSpeed(newModelBenchmark, existingBenchmark),
        cost_delta: this.compareCost(newModelBenchmark, existingBenchmark),
        overall_score: this.calculateOverallScore(newModelBenchmark, existingBenchmark),
      };
    }

    // Find similar models (for hierarchy placement)
    const mostSimilar = this.findMostSimilarModel(comparisons);

    return {
      comparisons,
      most_similar: mostSimilar,
      rank: this.calculateRank(newModelBenchmark, comparisons),
    };
  }

  compareAccuracy(newBench, existingBench) {
    return {
      human_eval: newBench.human_eval.pass_rate - existingBench.human_eval.pass_rate,
      mbpp: newBench.mbpp.pass_rate - existingBench.mbpp.pass_rate,
      swe_bench: newBench.swe_bench.pass_rate - existingBench.swe_bench.pass_rate,
    };
  }

  compareSpeed(newBench, existingBench) {
    return {
      tokens_per_second: newBench.throughput.tps - existingBench.throughput.tps,
      latency_p50_ms: existingBench.latency.p50_ms - newBench.latency.p50_ms, // Lower is better
    };
  }

  compareCost(newBench, existingBench) {
    return {
      cost_per_1k_tokens: existingBench.pricing.input_per_1k - newBench.pricing.input_per_1k, // Lower is better
    };
  }

  findMostSimilarModel(comparisons) {
    // Find model with smallest overall_score delta
    const deltas = Object.entries(comparisons).map(([modelId, comp]) => ({
      modelId,
      delta: Math.abs(comp.overall_score),
    }));

    return deltas.sort((a, b) => a.delta - b.delta)[0].modelId;
  }
}
```

#### 4. HierarchyPlacer (`packages/opencode-model-router-x/src/hierarchy-placer.js`)

** Responsibility**: Places new model in 6-layer fallback hierarchy

```javascript
class HierarchyPlacer {
  constructor({ db }, fallbackConfig) {
    this.db = db;
    this.fallbackConfig = fallbackConfig; // 6-layer table
  }

  async placeModel(newModelId, comparisonResult) {
    const mostSimilar = comparisonResult.most_similar;

    // Find layer of most similar model
    const similarLayer = this.findLayerForModel(mostSimilar);

    // Determine placement based on comparison
    let targetLayer = similarLayer;

    if (comparisonResult.comparisons[mostSimilar].overall_score > 5) {
      // New model is significantly better → move up one layer
      targetLayer = Math.max(1, similarLayer - 1);
    } else if (comparisonResult.comparisons[mostSimilar].overall_score < -5) {
      // New model is significantly worse → move down one layer
      targetLayer = Math.min(6, similarLayer + 1);
    }

    // Special rules:
    // - Context window → higher layers (5-6)
    if (newModelId.context_window > 500000) {
      targetLayer = Math.max(targetLayer, 5);
    }

    // - ULTRA-fast → lower layers (1-2)
    if (newModelId.throughput.tps > 300) {
      targetLayer = Math.min(targetLayer, 2);
    }

    // Place in layer
    await this.addToLayer(targetLayer, newModelId);

    return { layer: targetLayer, reason: `Based on similarity to ${mostSimilar}, overall_score: ${comparisonResult.overall_score}` };
  }

  findLayerForModel(modelId) {
    // Search through 6 layers
    for (let layer = 1; layer <= 6; layer++) {
      if (this.fallbackConfig[layer].includes(modelId)) {
        return layer;
      }
    }
    return 3; // Default
  }

  async addToLayer(layer, modelId) {
    // Update fallback config file
    this.fallbackConfig[layer].push(modelId);
    await this.writeFallbackConfig();

    // Also update database
    await this.db.run(`
      INSERT INTO model_hierarchy (model_id, layer, placed_at)
      VALUES (?, ?, ?)
    `, [modelId, layer, Date.now()]);
  }
}
```

#### 5. DocumentUpdater (`packages/opencode-model-router-x/src/document-updater.js`)

** Responsibility**: Updates scoring matrix and fallback tables

```javascript
class DocumentUpdater {
  constructor({ docsPath }) {
    this.docsPath = docsPath;
  }

  async updateScoringMatrix(modelId, benchmarks, layer) {
    const scoringMatrixPath = `${this.docsPath}/model-scoring-matrix-2025-${layer}.md`;

    let content = await fs.readFile(scoringMatrixPath, 'utf-8');

    // Append new model entry
    const entry = `
### ${modelId}

| Metric | Score | Source |
| :--- | :--- | :--- |
| Reasoning | ${benchmarks.reasoning.score}/100 | Benchmarked |
| Coding | ${benchmarks.coding.score}/100 | Benchmarked |
| Context Window | ${benchmarks.context_window} | Spec |
| Speed | ${benchmarks.throughput.tps} tps | Benchmarked |
| Cost | ${benchmarks.pricing.input_per_1k}/1K | Spec |
| Layer | ${layer} | Auto-placed |

#### Best For

${this.generateBestForSection(benchmarks)}
`;

    content += entry;
    await fs.writeFile(scoringMatrixPath, content);

    console.log(`✅ Updated scoring matrix for ${modelId}`);
  }

  updateFallbackTable(modelId, layer, taskCategories) {
    // Update .sisyphus/docs/model-scoring-matrix-2025-v2.md
    // Add model to appropriate rows and columns
  }
}
```

---

## Implementation Phases

### Phase 1: Core Exploration Mode (Week 1)

- [ ] Implement ExplorationMode class
- [ ] TokenBudgetManager for budget-aware exploration
- [ ] Configure env variables for exploration activation
- [ ] Manual activation via CLI flag
- [ ] Unit tests for exploration selection algorithms

### Phase 2: Performance Tracking & Memory (Week 2)

- [ ] PerformanceTracker implementation
- [ ] ModelComprehensionMemory schema and CRUD
- [ ] SQLite integration with proper indexes
- [ ] Schema migration for existing data
- [ ] Performance metrics validation

### Phase 3: RL Integration (Week 3)

- [ ] ExplorationRLAdapter to feed data to SkillRL
- [ ] RL model weight updates from comprehension memory
- [ ] Validation that RL uses new data
- [ ] A/B testing: RL with vs without exploration data

### Phase 4: Model Discovery (Week 4)

- [ ] ModelDiscoveryService with tiered strategies
- [ ] API polling for OpenAI-compatible endpoints
- [ ] Documentation scraping fallback (Playwright)
- [ ] Community source integration (LiteLLM)
- [ ] Discovery daemon with 15-60 minute intervals

### Phase 5: Benchmarking Pipeline (Week 5)

- [ ] BenchmarkRunner with HumanEval/MBPP
- [ ] Python code evaluation sandbox (Pyodide)
- [ ] SWE-bench simplified runner
- [ ] Benchmark result storage in database
- [ ] Benchmark data export for analysis

### Phase 6: Hierarchy Placement & Doc Updates (Week 6)

- [ ] ModelComparator for multi-dimensional comparison
- [ ] HierarchyPlacer with layer determination logic
- [ ] DocumentUpdater for scoring matrix updates
- [ ] Fallback table updates
- [ ] OrchestrationController reload config

### Phase 7: Integration & Testing (Weeks 7-8)

- [ ] End-to-end integration tests
- [ ] Load testing for exploration mode
- [ ] Benchmark runner reliability tests
- [ ] Documentation for operators
- [ ] Onboarding guide for new providers

---

## Configuration

### Environment Variables

```bash
# Exploration Mode
OPENCODE_EXPLORATION_MODE=1                    # Enable exploration
OPENCODE_EXPLORATION_TOKEN_RATIO=0.10          # 10% of budget for exploration
OPENCODE_EXPLORATION_INTERVAL=10               # Explore every 10 tasks
OPENCODE_EXPLORATION_COOLDOWN_MS=300000        # 5 minute cooldown per model
OPENCODE_EXPLORATION_SAMPLING=thompson-sampling # epsilon-greedy | thompson-sampling | ucb

# Model Discovery
OPENCODE_MODEL_DISCOVERY_INTERVAL_MS=1800000  # 30 minutes
OPENCODE_MODEL_DISCOVERY_DOC_SCRAPING=1       # Enable docs scraping fallback
OPENCODE_MODEL_DISCOVERY_COMMUNITY_SOURCE=1   # Enable LiteLLM community source

# Benchmarking
OPENCODE_BENCHMARK_ENABLED=1                  # Enable new model benchmarking
OPENCODE_BENCHMARK_TIMEOUT_MS=120000          # 2 minute per benchmark
OPENCODE_BENCHMARK_SAMPLE_SIZE=100            # HumanEval full, MBPP sample
OPENCODE_BENCHMARK_SANDBOX=pyodide            # pyodide | docker
```

### Configuration Files

```json
// opencode-config/exploration-mode.json
{
  "isActive": true,
  "tokenBudgetRatio": 0.10,
  "samplingStrategy": "thompson-sampling",
  "explorationInterval": 10,
  "cooldownPeriodMs": 300000,
  "initializationBudget": 10000, // Warm-up tokens per new model
  "taskCategories": ["code-generation", "debugging", "architecture"],
  "excludedModels": ["gpt-4-turbo"] // Don't explore expensive models
}

// opencode-config/model-discovery.json
{
  "providers": [
    {
      "name": "openai",
      "base_url": "https://api.openai.com/v1",
      "api_endpoint": "/models",
      "documentation_url": "https://platform.openai.com/docs/models"
    },
    {
      "name": "anthropic",
      "base_url": "https://api.anthropic.com/v1",
      "api_endpoint": "/models",
      "documentation_url": "https://docs.anthropic.com/claude/docs/models-overview"
    },
    {
      "name": "google",
      "base_url": "https://generativelanguage.googleapis.com/v1beta",
      "api_endpoint": "/models",
      "documentation_url": "https://ai.google.dev/models"
    }
  ],
  "intervalMs": 1800000,
  "enableDocScraping": true,
  "enableCommunitySource": true
}

// opencode-config/benchmark-config.json
{
  "enabled": true,
  "benchmarks": {
    "human_eval": {
      "enabled": true,
      "sampleSize": 164,
      "timeoutMs": 60000
    },
    "mbpp": {
      "enabled": true,
      "sampleSize": 100,
      "timeoutMs": 60000
    },
    "swe_bench": {
      "enabled": true,
      "sampleSize": 50,
      "timeoutMs": 120000
    }
  },
  "sandbox": "pyodide"
}
```

---

## Success Metrics

### Exploration Mode

- **Coverage Percentage**: % of task-category/model pairs explored (target: 50%+)
- **Cost Control**: Exploration costs stay within tokenBudgetRatio (target: ±5%)
- **RL Improvement**: Model selection accuracy improves after exploration data integration (target: 10%+ gain)
- **Discovery Rate**: New better-than-baseline models discovered (target: 2+ per quarter)

### New Model Protocol

- **Detection Latency**: Time from model release to detection (target: < 6 hours)
- **Benchmark Duration**: Time to run full benchmark suite (target: < 2 hours)
- **Integration Latency**: Time from detection to hierarchy placement (target: < 24 hours)
- **Placement Accuracy**: % of models placed in correct layer (via manual verification, target: 80%+)

---

## Open Questions & Future Enhancements

1. **Exploration Strategies**: Should we add context-aware exploration (e.g., explore more when stuck on bug)?
2. **Benchmarking Tradeoffs**: HumanEval takes 2-3 hours; should we use a smaller subset for faster feedback?
3. **Community Validation**: Should we cross-validate benchmark results against community platforms (Chatbot Arena, HELM)?
4. **Automated Deployment**: Should we automatically deploy new models after benchmarking, or require manual approval?
5. **Deprecation Handling**: How to gracefully deprecate removed models and reroute existing tasks?

---

## Dependencies

### New Packages

- `package/opencode-model-benchmark` - Benchmark runner and comparison tools

### External Dependencies

- `pyodide` - Python code execution sandbox for HumanEval/MBPP
- `puppeteer` - Documentation scraping for model discovery
- `beta-distribution` - Thompson sampling implementation (or custom)
- `better-sqlite3` - Already in opencode-sisyphus-state
- `openai` - Generic client for making requests to any model

### Existing Package Integration

- `opencode-skill-rl-manager` - RL model weight updates from exploration data
- `opencode-sisyphus-state` - Performance metrics storage (extend schema)
- `opencode-model-router-x` - Main orchestration integration point

---

## Related Plans

- [Model Scoring Matrix v2.0](../docs/model-scoring-matrix-2025-v2.md)
- [Orchestration Implementation Plan](./orchestration-implementation-plan.md)
- [6-Layer Fallback Strategy](../docs/fallback-strategy.md)
