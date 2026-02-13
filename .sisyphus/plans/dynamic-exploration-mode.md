# Dynamic Exploration Mode & New Model Protocol

**Date**: 2026-02-12
**Status**: Implementation Plan
**Based On**: Model Scoring Matrix v2.0 (`.sisyphus/docs/model-scoring-matrix-2025-v2.md`)
**Related Plans**: `orchestration-implementation-plan.md`

---

## Executive Summary

Implement two complementary systems for continuous model orchestration improvement:

1. **Dynamic Exploration Mode** - Activatable mode that selects models dynamically to gather performance data and learn orchestration improvements
2. **New Model Assessment Protocol** - Automated workflow for assessing new models from providers and updating fallback hierarchy

**Key Change from Research**: Simplified model discovery polling - **poll once when opening a new chat**, with optional periodic polling every few hours if frequent updates are detected.

---

## Part 1: Dynamic Exploration Mode

### Purpose

Enable adaptive learning of model strengths through systematic data collection. When activated, the system:

1. Dynamically selects models based on task category and exploration strategy
2. Tracks performance metrics (accuracy, latency, cost, success rate)
3. Stores data to model comprehension memory
4. Enables Thompson Sampling for intelligent model selection

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                   DYNAMIC EXPLORATION MODE                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  DynamicExplorationController                             │  │
│  │  - activate(mode, budget)                                 │  │
│  │  - selectModelForTask(task)                               │  │
│  │  - gatherMetrics(task, model, result)                     │  │
│  │  - storeToMemory(metrics)                                 │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ModelPerformanceTracker                                 │  │
│  │  - track(task_category, model_id, metrics)               │  │
│  │  - aggregates: accuracy, latency, cost, robustness        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ThompsonSamplingRouter                                  │  │
│  │  - Beta(α=successes, β=failures) per model-task pair      │  │
│  │  - select model with highest posterior sample             │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                  │
│                              ▼                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  ModelComprehensionMemory                                │  │
│  │  - SQLite database: model_performance table               │  │
│  │  - Index: model_id, task_category                        │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.1 DynamicExplorationController

**File**: `packages/opencode-model-router-x/src/dynamic-exploration-controller.js`

```javascript
class DynamicExplorationController {
  constructor() {
    this.active = false;
    this.explorationBudget = 0; // % of queries to explore vs exploit
    this.tracker = new ModelPerformanceTracker();
    this.sampler = new ThompsonSamplingRouter();
    this.memory = new ModelComprehensionMemory();
  }

  /**
   * Activate exploration mode
   * @param {string} mode - 'balanced', 'aggressive', 'conservative'
   * @param {number} budget - % of queries to explore (0-100)
   */
  async activate(mode = 'balanced', budget = 20) {
    this.active = true;
    this.explorationBudget = budget;
    this.explorationMode = mode;

    // Load existing data from memory
    await this.memory.load();
    this.sampler.loadFromMemory(this.memory.data);

    console.log(`[DynamicExploration] Mode activated: ${mode}, Budget: ${budget}%`);
  }

  async deactivate() {
    this.active = false;
    console.log('[DynamicExploration] Mode deactivated');
  }

  /**
   * Select model for task
   * @param {Object} task - { taskId, intentCategory, complexity, context }
   * @returns {Object} { model, provider, isExploration }
   */
  async selectModelForTask(task) {
    if (!this.active) {
      return null; // Let standard orchestration handle it
    }

    const shouldExplore = Math.random() * 100 < this.explorationBudget;

    if (shouldExplore) {
      // Exploration: Use Thompson Sampling to select diverse model
      const modelId = this.sampler.select(task.intentCategory);
      const provider = this.extractProvider(modelId);
      return { model: modelId, provider, isExploration: true };
    } else {
      // Exploitation: Use best-known model for this task
      const bestModel = this.tracker.getBestModel(task.intentCategory);
      const provider = this.extractProvider(bestModel);
      return { model: bestModel, provider, isExploration: false };
    }
  }

  /**
   * Gather metrics after task completion
   * @param {Object} task - Task metadata
   * @param {Object} selection - Model selection { model, provider, isExploration }
   * @param {Object} result - Task result { success, accuracy, latency, tokensUsed }
   */
  async gatherMetrics(task, selection, result) {
    const metrics = {
      taskId: task.taskId,
      intentCategory: task.intentCategory,
      modelId: selection.model,
      provider: selection.provider,
      isExploration: selection.isExploration,
      timestamp: Date.now(),
      // 4-Pillar Metrics
      accuracy: this.calculateAccuracy(result),
      latency: result.latency || 0,
      cost: this.calculateCost(selection.model, result.tokensUsed),
      success: result.success || false,
      tokensUsed: result.tokensUsed,
      // Context metadata
      complexity: task.complexity,
      fileSize: task.fileSize,
      language: task.language
    };

    // Track in memory
    await this.tracker.track(metrics);
    await this.memory.store(metrics);

    // Update Thompson Sampling posterior
    if (selection.isExploration) {
      this.sampler.update(task.intentCategory, selection.model, result.success);
    }

    return metrics;
  }

  calculateAccuracy(result) {
    // G-Eval (LLM-as-a-judge) or Pass@k for code
    if (result.passRate !== undefined) return result.passRate;
    if (result.qualityScore !== undefined) return result.qualityScore;
    return result.success ? 1.0 : 0.0;
  }

  calculateCost(modelId, tokensUsed) {
    const pricing = this.getProviderPricing(modelId);
    if (!pricing || !tokensUsed) return 0;

    const { input, output } = pricing;
    const { input: inputTokens, output: outputTokens } = tokensUsed;
    return (inputTokens * input + outputTokens * output) / 1000;
  }

  extractProvider(modelId) {
    // Parse model ID to extract provider
    if (modelId.includes('llama') || modelId.includes('groq')) return 'groq';
    if (modelId.includes('cerebras')) return 'cerebras';
    if (modelId.includes('nvidia')) return 'nvidia';
    if (modelId.includes('gemini')) return 'antigravity';
    if (modelId.includes('claude')) return 'anthropic';
    if (modelId.includes('gpt') || modelId.includes('codex')) return 'openai';
    return 'unknown';
  }
}
```

### 1.2 ModelPerformanceTracker

**File**: `packages/opencode-model-router-x/src/model-performance-tracker.js`

```javascript
class ModelPerformanceTracker {
  constructor() {
    this.aggregates = new Map(); // intentCategory -> modelId -> AggregatedMetrics
  }

  async track(metrics) {
    const key = `${metrics.intentCategory}:${metrics.modelId}`;

    if (!this.aggregates.has(key)) {
      this.aggregates.set(key, this.initializeAggregate());
    }

    const agg = this.aggregates.get(key);

    // Update aggregate metrics
    agg.totalAttempts++;
    agg.successfulAttempts += metrics.success ? 1 : 0;
    agg.totalAccuracy += metrics.accuracy;
    agg.totalLatency += metrics.latency;
    agg.totalCost += metrics.cost;
    agg.totalTokens += metrics.tokensUsed;

    // Latency tracking (percentiles)
    agg.latencyHistory.push(metrics.latency);
    agg.latencyHistory.sort((a, b) => a - b);
    if (agg.latencyHistory.length > 100) agg.latencyHistory.shift();

    // Calculate derived metrics
    agg.successRate = agg.successfulAttempts / agg.totalAttempts;
    agg.averageAccuracy = agg.totalAccuracy / agg.totalAttempts;
    agg.averageLatency = agg.totalLatency / agg.totalAttempts;
    agg.averageCost = agg.totalCost / agg.totalAttempts;
    agg.costPerSuccess = agg.totalCost / agg.successfulAttempts;

    // Percentiles
    agg.medianLatency = agg.latencyHistory[Math.floor(agg.latencyHistory.length / 2)];
    agg.p95Latency = agg.latencyHistory[Math.floor(agg.latencyHistory.length * 0.95)];
    agg.p99Latency = agg.latencyHistory[Math.floor(agg.latencyHistory.length * 0.99)];

    return agg;
  }

  getBestModel(intentCategory) {
    const categoryMetrics = new Map();

    for (const [key, agg] of this.aggregates) {
      const [category, modelId] = key.split(':');
      if (category === intentCategory) {
        categoryMetrics.set(modelId, agg);
      }
    }

    if (categoryMetrics.size === 0) {
      return null; // No data yet, use fallback
    }

    // Find best model by weighted score
    let bestModel = null;
    let bestScore = -Infinity;

    for (const [modelId, agg] of categoryMetrics) {
      const score = this.calculateScore(agg);
      if (score > bestScore) {
        bestScore = score;
        bestModel = modelId;
      }
    }

    return bestModel;
  }

  /**
   * Weighted performance score
   * Higher is better
   */
  calculateScore(agg) {
    const ACCURACY_WEIGHT = 0.4;
    const LATENCY_WEIGHT = -0.3; // Lower latency is better
    const COST_WEIGHT = -0.2; // Lower cost is better
    const SUCCESS_WEIGHT = 0.1;

    return (
      agg.averageAccuracy * ACCURACY_WEIGHT +
      agg.medianLatency * LATENCY_WEIGHT +
      agg.costPerSuccess * COST_WEIGHT +
      agg.successRate * SUCCESS_WEIGHT
    );
  }

  initializeAggregate() {
    return {
      totalAttempts: 0,
      successfulAttempts: 0,
      successRate: 0,
      totalAccuracy: 0,
      averageAccuracy: 0,
      totalLatency: 0,
      averageLatency: 0,
      latencyHistory: [],
      medianLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      totalCost: 0,
      averageCost: 0,
      costPerSuccess: 0,
      totalTokens: 0
    };
  }
}
```

### 1.3 ThompsonSamplingRouter

**File**: `packages/opencode-model-router-x/src/thompson-sampling-router.js`

```javascript
class ThompsonSamplingRouter {
  constructor() {
    // Beta distribution parameters: Beta(α=successes, β=failures)
    this.posteriors = new Map(); // { intentCategory: { modelId: { alpha, beta } } }
  }

  /**
   * Select model using Thompson Sampling
   * Sample from posterior distribution for each model, pick highest
   */
  select(intentCategory) {
    if (!this.posteriors.has(intentCategory)) {
      this.posteriors.set(intentCategory, new Map());
    }

    const categoryPosteriors = this.posteriors.get(intentCategory);
    let bestModel = null;
    let bestSample = -Infinity;

    for (const [modelId, posterior] of categoryPosteriors) {
      // Sample from Beta(alpha, beta)
      const sample = this.sampleBeta(posterior.alpha, posterior.beta);
      if (sample > bestSample) {
        bestSample = sample;
        bestModel = modelId;
      }
    }

    // If no data, return random model
    if (!bestModel) {
      const models = this.getAvailableModels();
      return models[Math.floor(Math.random() * models.length)];
    }

    return bestModel;
  }

  /**
   * Update posterior with observed success/failure
   */
  update(intentCategory, modelId, success) {
    if (!this.posteriors.has(intentCategory)) {
      this.posteriors.set(intentCategory, new Map());
    }

    const categoryPosteriors = this.posteriors.get(intentCategory);
    if (!categoryPosteriors.has(modelId)) {
      categoryPosteriors.set(modelId, { alpha: 1, beta: 1 }); // Uniform prior
    }

    const posterior = categoryPosteriors.get(modelId);
    if (success) {
      posterior.alpha++; // Increment success parameter
    } else {
      posterior.beta++; // Increment failure parameter
    }
  }

  /**
   * Sample from Beta(alpha, beta) using Gamma method
   */
  sampleBeta(alpha, beta) {
    const gamma1 = this.sampleGamma(alpha, 1);
    const gamma2 = this.sampleGamma(beta, 1);
    return gamma1 / (gamma1 + gamma2);
  }

  /**
   * Sample from Gamma(k, theta) using Marsaglia and Tsang's method
   */
  sampleGamma(k, theta) {
    if (k < 1) {
      return this.sampleGamma(k + 1, theta) * Math.pow(Math.random(), 1 / k);
    }

    const d = k - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);

    while (true) {
      let x, v;
      do {
        x = this.randomNormal();
        v = 1 + c * x;
      } while (v <= 0);

      v = v * v * v;
      const u = Math.random();
      if (u < 1 - 0.0331 * (x * x) * (x * x)) {
        return d * v * theta;
      }
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v * theta;
      }
    }
  }

  randomNormal() {
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  getAvailableModels() {
    return [
      'Llama 3.1 70B (Groq)',
      'Llama 3.1 405B (Groq)',
      'Llama 3.1 70B (Cerebras)',
      'Llama 3.1 405B (Cerebras)',
      'Llama 3.1 70B (NVIDIA)',
      'Llama 3.1 405B (NVIDIA)',
      'Gemini 3 Flash',
      'Gemini 3 Flash Minimal',
      'Gemini 3 Pro',
      'Claude Sonnet 4.5',
      'Claude Sonnet 4.5 Thinking (Low)',
      'Claude Sonnet 4.5 Thinking (Max)',
      'Claude Opus 4.6',
      'GPT 5.2',
      'GPT 5.3 Codex',
      'DeepSeek V3.2'
    ];
  }
}
```

### 1.4 ModelComprehensionMemory

**File**: `packages/opencode-model-router-x/src/model-comprehension-memory.js`

```javascript
const Database = require('better-sqlite3');
const path = require('path');

class ModelComprehensionMemory {
  constructor(dbPath = null) {
    const defaultPath = path.join(
      process.env.HOME || process.env.USERPROFILE,
      '.opencode',
      'model-comprehension.db'
    );
    this.dbPath = dbPath || defaultPath;
    this.db = null;
    this.data = new Map();
  }

  async initialize() {
    this.db = new Database(this.dbPath);

    // Enable WAL mode for concurrent access
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this.createSchema();
    await this.load();
  }

  createSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS model_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        intent_category TEXT NOT NULL,
        model_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        is_exploration INTEGER DEFAULT 0,
        accuracy REAL,
        latency REAL,
        cost REAL,
        success INTEGER,
        tokens_used INTEGER,
        complexity REAL,
        file_size INTEGER,
        language TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_model_task
        ON model_performance(model_id, intent_category);

      CREATE INDEX IF NOT EXISTS idx_timestamp
        ON model_performance(timestamp);

      CREATE TABLE IF NOT EXISTS model_benchmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id TEXT NOT NULL,
        benchmark_name TEXT NOT NULL,
        score REAL,
        normalized_score REAL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_benchmark_model
        ON model_benchmarks(model_id);
    `);
  }

  async load() {
    const rows = this.db.prepare(`
      SELECT * FROM model_performance
      WHERE timestamp > ?
      ORDER BY timestamp DESC
    `).all(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days

    for (const row of rows) {
      const key = `${row.intent_category}:${row.model_id}`;
      if (!this.data.has(key)) {
        this.data.set(key, []);
      }
      this.data.get(key).push(row);
    }
  }

  async store(metrics) {
    const stmt = this.db.prepare(`
      INSERT INTO model_performance (
        task_id, intent_category, model_id, provider, timestamp,
        is_exploration, accuracy, latency, cost, success,
        tokens_used, complexity, file_size, language
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      metrics.taskId,
      metrics.intentCategory,
      metrics.modelId,
      metrics.provider,
      metrics.timestamp,
      metrics.isExploration ? 1 : 0,
      metrics.accuracy,
      metrics.latency,
      metrics.cost,
      metrics.success ? 1 : 0,
      metrics.tokensUsed,
      metrics.complexity,
      metrics.fileSize,
      metrics.language
    );

    // Update in-memory cache
    const key = `${metrics.intentCategory}:${metrics.modelId}`;
    if (!this.data.has(key)) {
      this.data.set(key, []);
    }
    this.data.get(key).push(metrics);
  }

  async getMetrics(intentCategory, modelId) {
    const key = `${intentCategory}:${modelId}`;
    return this.data.get(key) || [];
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}
```

---

## Part 2: New Model Assessment Protocol

### 2.1 Overview

Automated workflow for:
1. **Discovery**: Detect new models from providers
2. **Benchmarks**: Run standard evaluation suite
3. **Comparison**: Compare against existing models
4. **Placement**: Assign to 6-layer fallback hierarchy
5. **Update**: Update scoring matrix, fallback tables, docs

**Key Design Decision**: **Poll once when opening a new chat**, with optional periodic polling every few hours if frequent model updates are detected.

### 2.2 Simplified Discovery Polling

**File**: `packages/opencode-model-router-x/src/model-discovery.js`

```javascript
class ModelDiscovery {
  constructor() {
    this.providers = {
      'openai': { endpoint: 'https://api.openai.com/v1/models', headers: { 'Authorization': 'Bearer {key}' } },
      'anthropic': { endpoint: 'https://api.anthropic.com/v1/models', headers: { 'x-api-key': '{key}', 'anthropic-version': '2023-06-01' } },
      'google': { endpoint: 'https://generativelanguage.googleapis.com/v1beta/models?key={key}' },
      'groq': { endpoint: 'https://api.groq.com/openai/v1/models', headers: { 'Authorization': 'Bearer {key}' } },
      'cerebras': { endpoint: 'https://api.cerebras.ai/v1/models', headers: { 'Authorization': 'Bearer {key}' } },
      'nvidia': { endpoint: 'https://integrate.api.nvidia.com/v1/models', headers: { 'Authorization': 'Bearer {key}' } }
    };

    this.discoveryCache = new Map(); // provider -> { models, hash, timestamp }
    this.lastPollTime = null;
  }

  /**
   * Poll all providers for new models
   * Should be called ONCE when opening a new chat
   */
  async pollOnce() {
    const results = {};
    const newModels = [];

    for (const [providerId, config] of Object.entries(this.providers)) {
      try {
        const models = await this.fetchModels(providerId);
        const cache = this.discoveryCache.get(providerId);

        if (!cache) {
          // First poll - store all models
          this.discoveryCache.set(providerId, {
            models,
            hash: this.hashModels(models),
            timestamp: Date.now()
          });
        } else {
          // Check for changes
          const newHash = this.hashModels(models);
          if (newHash !== cache.hash) {
            // Models added/removed - return new ones
            const diff = this.detectChanges(cache.models, models);
            newModels.push(...diff);
            this.discoveryCache.set(providerId, {
              models,
              hash: newHash,
              timestamp: Date.now()
            });
          }
        }

        results[providerId] = models;
      } catch (error) {
        console.error(`[ModelDiscovery] Failed to poll ${providerId}:`, error.message);
      }
    }

    this.lastPollTime = Date.now();

    if (newModels.length > 0) {
      console.log(`[ModelDiscovery] Discovered ${newModels.length} new models:`, newModels);
      await this.triggerAssessment(newModels);
    }

    return { results, newModels };
  }

  /**
   * Optional periodic polling (if frequent updates detected)
   */
  async startPeriodicPolling(intervalHours = 4) {
    setInterval(async () => {
      console.log('[ModelDiscovery] Periodic poll check');
      await this.pollOnce();
    }, intervalHours * 60 * 60 * 1000);
  }

  async fetchModels(providerId) {
    const config = this.providers[providerId];
    const apiKey = this.getApiKey(providerId);

    if (!apiKey) {
      throw new Error(`No API key configured for ${providerId}`);
    }

    // Format headers
    const headers = {};
    for (const [key, value] of Object.entries(config.headers)) {
      headers[key] = value.replace('{key}', apiKey);
    }

    const response = await fetch(config.endpoint, { headers });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // Normalize response format
    return this.normalizeResponse(providerId, data);
  }

  normalizeResponse(providerId, data) {
    // Different providers return different formats
    if (providerId === 'google') {
      return data.models?.map(m => ({
        id: m.name,
        contextTokens: m.inputTokenLimit,
        outputTokens: m.outputTokenLimit,
        methods: m.supportedGenerationMethods
      })) || [];
    }

    if (providerId === 'openai') {
      return data.data?.filter(m => m.object === 'model').map(m => ({
        id: m.id,
        contextTokens: m.context_window || m.max_tokens || 128000,
        deprecated: m.deleted || false
      })) || [];
    }

    // Anthropic, Groq, Cerebras, NVIDIA use OpenAI-compatible format
    return data.data?.map(m => ({
      id: m.id,
      contextTokens: m.context_window || 128000,
      deprecated: false
    })) || [];
  }

  detectChanges(oldModels, newModels) {
    const oldIds = new Set(oldModels.map(m => m.id));
    const newModels Detected = newModels.filter(m => !oldIds.has(m.id));
    return newModelsDetected;
  }

  hashModels(models) {
    const sortedIds = models.map(m => m.id).sort();
    return this.simpleHash(sortedIds.join('|'));
  }

  simpleHash(text) {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  getApiKey(providerId) {
    // Read from environment
    const keyMap = {
      'openai': process.env.OPENAI_API_KEY,
      'anthropic': process.env.ANTHROPIC_API_KEY,
      'google': process.env.GOOGLE_API_KEY,
      'groq': process.env.GROQ_API_KEYS,
      'cerebras': process.env.CEREBRAS_API_KEYS,
      'nvidia': process.env.NVIDIA_API_KEYS
    };
    return keyMap[providerId];
  }

  /**
   * Trigger assessment workflow for new models
   */
  async triggerAssessment(newModels) {
    const assessor = new NewModelAssessor();
    for (const model of newModels) {
      await assessor.assess(model);
    }
  }
}
```

### 2.3 NewModelAssessor

**File**: `packages/opencode-model-router-x/src/new-model-assessor.js`

```javascript
class NewModelAssessor {
  constructor() {
    this.benchmarks = [
      { name: 'HumanEval', type: 'coding', problems: 164 },
      { name: 'MBPP', type: 'coding', problems: 974 },
      { name: 'SWE-bench', type: 'multi-file', problems: 2294 }
    ];
  }

  /**
   * Assessment workflow
   */
  async assess(model) {
    console.log(`[NewModelAssessor] Starting assessment for: ${model.id}`);

    // Phase 1: Run benchmarks
    const benchmarkScores = await this.runBenchmarks(model);
    console.log(`[NewModelAssessor] Benchmark scores:`, benchmarkScores);

    // Phase 2: Get 4-pillar metrics
    const metrics = await this.get4PillarMetrics(model);
    console.log(`[NewModelAssessor] 4-Pillar metrics:`, metrics);

    // Phase 3: Compare to existing models
    const comparison = this.compareWithExisting(model, benchmarkScores, metrics);
    console.log(`[NewModelAssessor] Comparison:`, comparison);

    // Phase 4: Determine placement in 6-layer hierarchy
    const placement = this.determinePlacement(comparison);
    console.log(`[NewModelAssessor] Recommended placement:`, placement);

    // Phase 5: Update all files
    await this.updateFiles(model, placement, benchmarkScores, metrics);

    return { benchmarkScores, metrics, comparison, placement };
  }

  async runBenchmarks(model) {
    const scores = {};

    for (const benchmark of this.benchmarks) {
      const score = await this.runBenchmark(model, benchmark);
      scores[benchmark.name] = score;
    }

    return scores;
  }

  async runBenchmark(model, benchmark) {
    // TODO: Implement actual benchmark runner
    // For now, return placeholder
    return {
      passRate: 0.75, // Placeholder
      normalizedScore: 0.75,
      details: { total: benchmark.problems, passed: Math.floor(benchmark.problems * 0.75) }
    };
  }

  async get4PillarMetrics(model) {
    return {
      accuracy: null, // From benchmarks
      latency: await this.measureLatency(model),
      cost: this.estimateCost(model),
      robustness: await this.measureRobustness(model)
    };
  }

  compareWithExisting(model, benchmarkScores, metrics) {
    // Z-score standardization
    const zScores = {};
    for (const [benchmark, score] of Object.entries(benchmarkScores)) {
      zScores[benchmark] = this.calculateZScore(score.normalizedScore, benchmark);
    }

    return {
      zScores,
      overallRank: this.calculateRank(zScores, metrics)
    };
  }

  calculateRank(zScores, metrics) {
    // Weighted ranking
    const BENCHMARK_WEIGHT = 0.6;
    const LATENCY_WEIGHT = -0.2;
    const COST_WEIGHT = -0.2;
    const SCORE = 0.5 * (zScores['HumanEval'] + zScores['MBPP']) +
                   0.5 * zScores['SWE-bench'] +
                   LATENCY_WEIGHT * (metrics.latency / 1000) +
                   COST_WEIGHT * (metrics.cost / 1000);
    return SCORE;
  }

  determinePlacement(comparison) {
    // Map rank to 6-layer hierarchy
    // Higher rank = higher layer (better model)
    const rank = comparison.overallRank;

    if (rank > 2.0) return { layer: 6, modelClass: 'best' };
    if (rank > 1.5) return { layer: 5, modelClass: 'excellent' };
    if (rank > 1.0) return { layer: 4, modelClass: 'good' };
    if (rank > 0.5) return { layer: 3, modelClass: 'fair' };
    if (rank > 0.0) return { layer: 2, modelClass: 'poor' };
    return { layer: 1, modelClass: 'experimental' };
  }

  async updateFiles(model, placement, benchmarkScores, metrics) {
    // Step 1: Update model scoring matrix
    await this.updateScoringMatrix(model, placement, benchmarkScores, metrics);

    // Step 2: Update fallback tables
    await this.updateFallbackTables(model, placement);

    // Step 3: Update opencode.json
    await this.updateProviderConfig(model);

    console.log(`[NewModelAssessor] Files updated for: ${model.id}`);
  }

  async updateScoringMatrix(model, placement, benchmarkScores, metrics) {
    // TODO: Implement markdown file update
    console.log(`[NewModelAssessor] Would update: model-scoring-matrix-2025-v2.md`);
  }

  async updateFallbackTables(model, placement) {
    // TODO: Implement fallback table update
    console.log(`[NewModelAssessor] Would update: fallback tables`);
  }

  async updateProviderConfig(model) {
    // TODO: Implement opencode.json update
    console.log(`[NewModelAssessor] Would update: opencode.json`);
  }

  async measureLatency(model) {
    // Estimate based on provider
    if (model.id.includes('groq')) return 450; // tokens/second
    if (model.id.includes('cerebras')) return 300;
    if (model.id.includes('nvidia')) return 200;
    return 100; // Default
  }

  estimateCost(model) {
    // TODO: Get from provider documentation
    return 0.005; // Placeholder
  }

  async measureRobustness(model) {
    // Self-consistency evaluation
    return 0.8; // Placeholder
  }
}
```

---

## Phase 1: Integration with Orchestration

### File: `packages/opencode-model-router-x/src/orchestration-controller.js`

```diff
  class OrchestrationController {
    constructor() {
      this.globalModelContext = new GlobalModelContext();
      this.stuckBugDetector = new StuckBugDetector();
      this.reversionManager = new ReversionManager();
      this.manualOverrideController = new ManualOverrideController();
      this.rateLimitAdapter = new RateLimitAdapter(rotators, costCalculator);

+     // Dynamic exploration components
+     this.explorationController = new DynamicExplorationController();
+     this.modelDiscovery = new ModelDiscovery();

      // Strategy chain (in order of priority)
      this.strategies = [
        new ProjectStartStrategy(),
        new ManualOverrideStrategy(this.manualOverrideController),
        new PerspectiveSwitchStrategy(rotators, this.stuckBugDetector),
        new FallbackLayerStrategy()
      ];
    }

+   /**
+    * Initialize on new chat
+    */
+   async initializeOnNewChat() {
+     // Poll for new models once
+     await this.modelDiscovery.pollOnce();
+
+     // Initialize exploration memory
+     await this.explorationController.memory.initialize();
+   }

    async route(request) {
      const taskId = request.taskId || this.generateTaskId(request);

+     // Check dynamic exploration first
+     const explorationSelection = await this.explorationController.selectModelForTask(request);
+     if (explorationSelection && explorationSelection.isExploration) {
+       return explorationSelection;
+     }

      // Check for manual override first
      const manualOverride = this.manualOverrideController.getOverride(taskId);
      if (manualOverride) {
        return manualOverride;
      }

      // ... rest of existing logic
    }

    async handleResult(taskId, selection, result) {
      // Record failure if error occurred
      if (result.error) {
        this.stuckBugDetector.recordFailure(taskId, result.error, result.context);
      }

+     // Gather metrics for exploration
+     if (selection.isExploration) {
+       const metrics = await this.explorationController.gatherMetrics(
+         request,
+         selection,
+         result
+       );
+       console.log(`[Exploration] Metrics gathered:`, metrics);
+     }

      // Check if we should revert model selection
      if (await this.reversionManager.shouldRevert(taskId, selection, result)) {
        const reverted = await this.reversionManager.revert(taskId);
        if (reverted) {
          await this.globalModelContext.popOverride();
        }
      }
    }
  }
```

---

## Deliverables Summary

| Component | File | Priority |
| :--- | :--- | :--- |
| DynamicExplorationController | `src/dynamic-exploration-controller.js` | P0 |
| ModelPerformanceTracker | `src/model-performance-tracker.js` | P0 |
| ThompsonSamplingRouter | `src/thompson-sampling-router.js` | P0 |
| ModelComprehensionMemory | `src/model-comprehension-memory.js` | P0 |
| ModelDiscovery | `src/model-discovery.js` | P0 |
| NewModelAssessor | `src/new-model-assessor.js` | P1 |
| Orchestration Integration | `src/orchestration-controller.js` | P0 |
| SQLite Schema | `model-comprehension.db` | P0 |
| Tests | `tests/dynamic-exploration/*.test.js` | P1 |

---

## Success Criteria

1. **Exploration Activation**: Mode can be toggled on/off with configurable budget
2. **Thompson Sampling**: Models selected proportional to posterior distribution
3. **Performance Tracking**: All 4-pillar metrics tracked and aggregated
4. **Model Discovery**: Polls once on new chat start
5. **New Model Assessment**: Full workflow from discovery to doc updates
6. **Integration**: Works seamlessly with existing orchestration strategies
7. **Memory Persistence**: Model comprehension data persists across sessions

---

## Implementation Phases

| Phase | Duration | Focus |
| :--- | :--- | :--- |
| 1. Exploration Core | 3-4 days | Controller, Tracker, Thompson Sampler, Memory |
| 2. Discovery & Assessment | 2-3 days | Model polling, benchmark runner, assessor |
| 3. Integration | 2 days | Wire into orchestration controller |
| 4. Testing | 2-3 days | Unit tests, integration tests |
| 5. Monitoring | 1 day | Dashboard metrics for model performance |

**Total**: 10-13 days

---

## Next Steps

→ Implement Phase 1 (Exploration Core)
→ Set up SQLite database with schema
→ Define benchmark test suite
→ Update opencode.json provider registration
→ Monitor via OpenCode Dashboard
