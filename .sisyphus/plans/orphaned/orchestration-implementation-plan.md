# Orchestration Implementation Plan: Dynamic Multi-Model Selection

**Date**: 2026-02-12
**Status**: Master Plan
**Based On**: Model Scoring Matrix v2.0 (`.sisyphus/docs/model-scoring-matrix-2025-v2.md`)

---

## Executive Summary

Implement dynamic model selection for OpenCode orchestration that:
1. **Establishes semantic foundation** at experiment start using high-power models
2. **Detects stuck bugs** and automatically switches to most-different provider
3. **Supports manual overrides** with reversion to original model
4. **Applies globally** to all agents and subtasks
5. **Optimizes tokens** with rate limit : complexity/volume cost ratios
6. **Follows 6-layer fallback** (Groq → Cerebras → NVIDIA → Antigravity → Anthropic → OpenAI)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATION LAYER                               │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  DynamicModelSelector (NEW)                                  │  │
│  │  - ProjectStartStrategy                                     │  │
│  │  - StuckBugDetector (NEW)                                    │  │
│  │  - ManualOverrideController (NEW)                            │  │
│  │  - ReversionManager (NEW)                                    │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    MODEL ROUTER LAYER                                │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  ModelRouter (EXISTING)                                       │  │
│  │  - FallbackLayer (6 layers)                                   │  │
│  │  - IntelligentRotator (per provider)                          │  │
│  │  - TaskClassifier (intent categories)                        │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    INTEGRATION LAYER                                 │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │  IntegrationLayer (EXISTING)                                  │  │
│  │  - QuotaService                                              │  │
│  │  - SkillRLManager                                            │  │
│  │  - SisyphusState                                             │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Core Foundation (Week 1)

### 1.1 Create Model Selection Strategy Interface

**File**: `packages/opencode-model-router-x/src/strategies/model-selection-strategy.js`

```javascript
/**
 * Base interface for model selection strategies
 * All strategies must implement the select(request) method
 */
class ModelSelectionStrategy {
  /**
   * @param {Object} request - Incoming task request
   * @returns {Object} { model, provider, reasoningEffort, estimatedCost }
   */
  select(request) {
    throw new Error('select() must be implemented by subclass');
  }

  /**
   * Estimate token cost for the given model and request
   */
  estimateCost(model, request) {
    throw new Error('estimateCost() must be implemented by subclass');
  }
}

module.exports = ModelSelectionStrategy;
```

### 1.2 Implement 6-Layer Fallback Strategy

**File**: `packages/opencode-model-router-x/src/strategies/fallback-layer-strategy.js`

```javascript
class FallbackLayerStrategy extends ModelSelectionStrategy {
  constructor() {
    super();
    this.layers = {
      1: { provider: 'groq', models: ['llama-3.1-70b', 'llama-3.1-405b'] },
      2: { provider: 'cerebras', models: ['llama-3.1-70b', 'llama-3.1-405b'] },
      3: { provider: 'nvidia', models: ['llama-3.1-70b', 'llama-3.1-405b'] },
      4: { provider: 'antigravity', models: ['gemini-3-flash', 'gemini-3-flash-minimal'] },
      5: { provider: 'anthropic', models: ['claude-sonnet-4.5', 'claude-sonnet-4.5-thinking'] },
      6: { provider: 'openai', models: ['gpt-5.3-codex', 'gpt-5.2'] }
    };
  }

  select(request) {
    const intent = request.intentCategory || detectIntent(request);
    const layer = this.getLayerForIntent(intent);
    const { provider, models } = this.layers[layer];

    // Select from provider's IntelligentRotator
    const rotator = ModelRouter.rotators[provider];
    const model = rotator.selectBestModel(models, request);

    return {
      model,
      provider,
      reasoningEffort: this.getReasoningEffort(intent, model),
      estimatedCost: this.estimateCost(model, request)
    };
  }

  getLayerForIntent(intent) {
    // 10 intent categories mapped to fallback layers
    const intentToLayer = {
      'simple-read': 1,
      'format-transform': 1,
      'documentation': 4,
      'code-generation': 4,
      'code-transform': 1,
      'debugging': 4,
      'architecture': 5,
      'large-context': 6,
      'multimodal': 4,
      'orchestration': 5
    };
    return intentToLayer[intent] || 4;
  }
}
```

---

## Phase 2: Dynamic Selection Features (Week 2)

### 2.1 Project Start Strategy

**File**: `packages/opencode-model-router-x/src/strategies/project-start-strategy.js`

```javascript
class ProjectStartStrategy extends ModelSelectionStrategy {
  constructor() {
    super();
    this.highPowerModels = [
      'Claude Opus 4.6',
      'Claude Sonnet 4.5 Thinking (Max)',
      'GPT-5.3 Codex'
    ];
  }

  select(request) {
    if (!this.isProjectStart(request)) {
      return null; // Fall back to default strategy
    }

    // Always use highest reasoning mode at project start
    return {
      model: 'Claude Sonnet 4.5 Thinking (Max)',
      provider: 'anthropic',
      reasoningEffort: 'max',
      estimatedCost: this.estimateCost('Claude Sonnet 4.5 Thinking (Max)', request),
      reason: 'semantic-foundation'
    };
  }

  isProjectStart(request) {
    return (
      request.taskId === 'initial-planning' ||
      request.context.historyLength < 5 ||
      request.sessionType === 'new'
    );
  }
}
```

### 2.2 Stuck Bug Detector

**File**: `packages/opencode-model-router-x/src/stuck-bug-detector.js`

```javascript
class StuckBugDetector {
  constructor() {
    this.failureHistory = new Map(); // taskId -> failure records
    this.thresholds = {
      maxFailures: 3,
      maxTimeSeconds: 300, // 5 minutes
      similarityThreshold: 0.85 // Cosine similarity for bug patterns
    };
  }

  recordFailure(taskId, error, context) {
    if (!this.failureHistory.has(taskId)) {
      this.failureHistory.set(taskId, []);
    }

    const history = this.failureHistory.get(taskId);
    history.push({
      timestamp: Date.now(),
      error: error.message,
      errorType: error.constructor.name,
      stack: error.stack,
      contextHash: this.hashContext(context),
      embedding: await this.getErrorEmbedding(error, context)
    });
  }

  isStuck(taskId, currentError, context) {
    const history = this.failureHistory.get(taskId);
    if (!history || history.length < 2) {
      return false;
    }

    const recentFailures = history.slice(-this.thresholds.maxFailures);
    const timeSinceFirst = (Date.now() - recentFailures[0].timestamp) / 1000;
    const totalFailures = history.length;

    // Check time threshold
    if (timeSinceFirst > this.thresholds.maxTimeSeconds && totalFailures >= this.thresholds.maxFailures) {
      return { stuck: true, reason: 'time-threshold', severity: 'high' };
    }

    // Check semantic similarity (are we hitting the same bug?)
    const currentEmbedding = await this.getErrorEmbedding(currentError, context);
    const maxSimilarity = Math.max(...recentFailures.map(f =>
      this.cosineSimilarity(currentEmbedding, f.embedding)
    ));

    if (maxSimilarity >= this.thresholds.similarityThreshold && totalFailures >= this.thresholds.maxFailures) {
      return { stuck: true, reason: 'semantic-similarity', severity: 'medium' };
    }

    return { stuck: false };
  }

  async getErrorEmbedding(error, context) {
    // Simplified: hash error message + context for now
    // TODO: Integrate actual embedding service when available
    const text = `${error.message}|${context.taskId}|${context.filePaths.join(',')}`;
    return this.simpleHash(text);
  }

  cosineSimilarity(vec1, vec2) {
    const dot = vec1.reduce((a, b) => a + b, 0);
    const norm1 = Math.sqrt(vec1.reduce((a, b) => a + b * b, 0));
    const norm2 = Math.sqrt(vec2.reduce((a, b) => a + b * b, 0));
    return dot / (norm1 * norm2);
  }
}
```

### 2.3 Perspective Switch Strategy

**File**: `packages/opencode-model-router-x/src/strategies/perspective-switch-strategy.js`

```javascript
class PerspectiveSwitchStrategy extends ModelSelectionStrategy {
  constructor(rotator, stuckBugDetector) {
    super();
    this.rotator = rotator;
    this.stuckBugDetector = stuckBugDetector;
    this.providerFamilies = {
      'anthropic': ['claude'],
      'google': ['gemini'],
      'openai': ['gpt', 'codex'],
      'meta': ['llama'],
      'deepseek': ['deepseek']
    };
  }

  select(request) {
    const { taskId, currentModel, currentProvider, error, context } = request;

    const stuckResult = this.stuckBugDetector.isStuck(taskId, error, context);
    if (!stuckResult.stuck) {
      return null; // Not stuck, fall back to default
    }

    // Find MOST DIFFERENT provider family
    const currentFamily = this.getCurrentFamily(currentModel);
    const mostDifferentProvider = this.findMostDifferentProvider(currentFamily);

    return {
      model: this.selectHighPowerModel(mostDifferentProvider),
      provider: mostDifferentProvider,
      reasoningEffort: 'max',
      estimatedCost: this.estimateCost(model, request),
      reason: 'perspective-switch',
      meta: {
        originalModel: currentModel,
        originalProvider: currentProvider,
        stuckReason: stuckResult.reason,
        stuckSeverity: stuckResult.severity
      }
    };
  }

  findMostDifferentProvider(currentFamily) {
    // Distance matrix (simplified for now)
    const distances = {
      'anthropic': { 'google': 1.0, 'openai': 0.8, 'meta': 0.9, 'deepseek': 0.85 },
      'google': { 'anthropic': 1.0, 'openai': 0.7, 'meta': 0.8, 'deepseek': 0.75 },
      'openai': { 'google': 0.7, 'anthropic': 0.8, 'meta': 0.6, 'deepseek': 0.9 },
      'meta': { 'anthropic': 0.9, 'google': 0.8, 'openai': 0.6, 'deepseek': 0.7 },
      'deepseek': { 'anthropic': 0.85, 'google': 0.75, 'openai': 0.9, 'meta': 0.7 }
    };

    const possibleProviders = Object.keys(distances[currentFamily]);
    const maxDistance = Math.max(...possibleProviders.map(p => distances[currentFamily][p]));
    return possibleProviders.find(p => distances[currentFamily][p] === maxDistance);
  }

  selectHighPowerModel(provider) {
    const highPowerModels = {
      'anthropic': 'Claude Opus 4.6',
      'google': 'Gemini 3 Pro Thinking (High)',
      'openai': 'GPT-5.3 Codex',
      'meta': 'Llama 3.1 405B (NVIDIA)',
      'deepseek': 'DeepSeek-V3.2'
    };
    return highPowerModels[provider] || 'Claude Opus 4.6';
  }
}
```

### 2.4 Reversion Manager

**File**: `packages/opencode-model-router-x/src/reversion-manager.js`

```javascript
class ReversionManager {
  constructor() {
    this.overrideStack = new Map(); // taskId -> stack of model overrides
  }

  pushOverride(taskId, selection) {
    if (!this.overrideStack.has(taskId)) {
      this.overrideStack.set(taskId, []);
    }
    this.overrideStack.get(taskId).push(selection);
  }

  async shouldRevert(taskId, selection, result) {
    const stack = this.overrideStack.get(taskId);
    if (!stack || stack.length === 0) {
      return false;
    }

    const currentOverride = stack[stack.length - 1];

    // Revert if:
    // 1. Result was successful (perspective gathered successfully)
    // 2. Override reason was 'perspective-switch'
    // 3. No manual override in effect

    return (
      (result.success || result.partialSuccess) &&
      currentOverride.reason === 'perspective-switch' &&
      !currentOverride.manualOverride
    );
  }

  async revert(taskId) {
    const stack = this.overrideStack.get(taskId);
    if (!stack || stack.length === 0) {
      return null;
    }

    const current = stack.pop();
    const previous = stack.length > 0 ? stack[stack.length - 1] : null;

    // If stack is empty, return to default fallback behavior
    if (stack.length === 0) {
      this.overrideStack.delete(taskId);
      return { revertTo: 'default', from: current };
    }

    return {
      revertTo: previous.model,
      revertToProvider: previous.provider,
      from: current.model,
      fromProvider: current.provider
    };
  }
}
```

### 2.5 Manual Override Controller

**File**: `packages/opencode-model-router-x/src/manual-override-controller.js`

```javascript
class ManualOverrideController {
  constructor() {
    this.activeOverrides = new Map(); // taskId -> override selection
  }

  setOverride(taskId, model, provider, reasoningEffort) {
    this.activeOverrides.set(taskId, {
      model,
      provider,
      reasoningEffort,
      timestamp: Date.now(),
      manualOverride: true
    });
  }

  getOverride(taskId) {
    return this.activeOverrides.get(taskId) || null;
  }

  clearOverride(taskId) {
    this.activeOverrides.delete(taskId);
  }

  hasOverride(taskId) {
    return this.activeOverrides.has(taskId);
  }
}
```

---

## Phase 3: Global Scope & Agent Propagation (Week 2-3)

### 3.1 Create Global Model Context

**File**: `packages/opencode-model-router-x/src/global-model-context.js`

```javascript
class GlobalModelContext {
  constructor() {
    this.sessionModel = null;
    this.overrideStack = [];
    this.listeners = [];
  }

  // Broadcast model selection to all agents/subtasks
  async broadcast(selection) {
    this.sessionModel = selection;
    await Promise.all(this.listeners.map(l => l.onModelSelection(selection)));
  }

  // Subscribe to model changes
  subscribe(callback) {
    this.listeners.push(callback);
    return () => {
      const idx = this.listeners.indexOf(callback);
      if (idx > -1) this.listeners.splice(idx, 1);
    };
  }

  getCurrent() {
    return this.sessionModel;
  }

  // Push override with reversion capability
  async pushOverride(selection) {
    this.overrideStack.push(this.sessionModel);
    await this.broadcast(selection);
  }

  // Revert to previous model
  async popOverride() {
    if (this.overrideStack.length > 0) {
      const previous = this.overrideStack.pop();
      await this.broadcast(previous);
      return previous;
    }
    return null;
  }
}
```

### 3.2 Update WorkflowExecutor for Model Propagation

**File**: `packages/opencode-sisyphus-state/src/integrations.js`

```diff
 class WorkflowExecutor {
   constructor(store, config = {}) {
     this.store = store;
-    this.router = config.router || null;
+    this.router = config.router || null;
+    this.globalModelContext = config.globalModelContext || new GlobalModelContext();
+    this.subscribeToModelChanges();
   }

+  // Subscribe to global model changes
+  subscribeToModelChanges() {
+    this.globalModelContext.subscribe((selection) => {
+      this.currentModel = selection;
+    });
+  }

   async executeSubtask(step, context) {
     const taskId = `${context.workflowId}:${step.id}`;

+    // Apply current global model selection
+    const modelSelection = this.globalModelContext.getCurrent();
+    if (modelSelection) {
+      step.model = modelSelection.model;
+      step.provider = modelSelection.provider;
+      step.reasoningEffort = modelSelection.reasoningEffort;
+    }

     const agent = this.loadAgent(step.agent);
     return await agent.execute(step, context);
   }
 }
```

---

## Phase 4: Token Efficiency & Cost Optimization (Week 3)

### 4.1 Token Cost Calculator

**File**: `packages/opencode-model-router-x/src/token-cost-calculator.js`

```javascript
class TokenCostCalculator {
  constructor() {
    this.pricing = {
      'llama-groq': { input: 0.00004, output: 0.00004 }, // $0.04/1K tokens (example)
      'llama-cerebras': { input: 0.00008, output: 0.00008 },
      'llama-nvidia': { input: 0.00012, output: 0.00012 },
      'gemini-flash': { input: 0.00015, output: 0.00060 },
      'gemini-flash-minimal': { input: 0.00012, output: 0.00048 },
      'gemini-flash-thinking': { input: 0.00020, output: 0.00080 },
      'claude-sonnet': { input: 0.00300, output: 0.01500 },
      'claude-sonnet-thinking-low': { input: 0.00360, output: 0.01800 },
      'claude-sonnet-thinking-max': { input: 0.00450, output: 0.02250 },
      'claude-opus': { input: 0.01500, output: 0.07500 },
      'claude-opus-thinking-low': { input: 0.01800, output: 0.09000 },
      'claude-opus-thinking-max': { input: 0.02250, output: 0.11250 },
      'gpt-5.2': { input: 0.00250, output: 0.01000 },
      'gpt-5.3-codex': { input: 0.00175, output: 0.01400 },
      'deepseek-v3.2': { input: 0.00040, output: 0.00120 },
      'deepseek-r1': { input: 0.00060, output: 0.00180 }
    };
  }

  calculate(model, inputTokens, outputTokens) {
    const pricing = this.pricing[model];
    if (!pricing) {
      return { cost: null, error: `Unknown pricing for model: ${model}` };
    }

    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    const totalCost = inputCost + outputCost;

    return {
      inputCost,
      outputCost,
      totalCost,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens
    };
  }

  // Calculate efficiency ratio: rate limit budget per token cost
  calculateEfficiencyRatio(model, rateLimitBudget) {
    const pricing = this.pricing[model];
    if (!pricing) return null;

    const avgCostPerToken = (pricing.input + pricing.output) / 2;
    return rateLimitBudget / avgCostPerToken;
  }
}
```

### 4.2 Rate Limit Adapter

**File**: `packages/opencode-model-router-x/src/rate-limit-adapter.js`

```javascript
class RateLimitAdapter {
  constructor(rotator, costCalculator) {
    this.rotator = rotator;
    this.costCalculator = costCalculator;
    this.taskComplexities = {
      'simple-read': 1.0,
      'format-transform': 1.2,
      'documentation': 1.5,
      'code-generation': 2.5,
      'code-transform': 2.0,
      'debugging': 3.0,
      'architecture': 2.5,
      'orchestration': 2.0
    };
  }

  adapt(model, intent, complexity, volume) {
    const rateLimitBudget = this.getRateLimitBudget(model);
    const taskComplexity = this.taskComplexities[intent] || 1.5;

    // Efficiency ratio: tokens we get per $1 of rate limit budget
    const efficiencyRatio = this.costCalculator.calculateEfficiencyRatio(model, rateLimitBudget);

    // Adjust target rate limit based on task complexity and volume
    const adjustedBudget = (rateLimitBudget * volume) / taskComplexity;

    const costPerToken = this.costCalculator.pricing[model]?.input || 0;

    // Threshold: don't use expensive models for repeated low-complexity tasks
    const expensiveThreshold = 0.01; // $0.01 per 1K tokens
    if (costPerToken > expensiveThreshold && volume > 50 && taskComplexity < 2.0) {
      // Downgrade to cheaper layer
      return this.selectAlternativeCheaper(model, intent);
    }

    return {
      model,
      rateLimitBudget: adjustedBudget,
      efficiencyRatio,
      adjustedForVolume: volume > 50,
      adjustedForComplexity: taskComplexity > 2.0
    };
  }

  getRateLimitBudget(model) {
    // Check rotator for current rate limit status
    const provider = this.getProviderForModel(model);
    const rotator = this.rotator[provider];
    if (!rotator) return Infinity;

    const key = rotator.getBestKey(model);
    if (!key) return Infinity;

    return key.remainingTokens || Infinity;
  }

  selectAlternativeCheaper(model, intent) {
    // Map expensive models to cheaper alternatives for repeated tasks
    const cheapAlternatives = {
      'claude-opus': 'Claude Sonnet 4.5',
      'claude-opus-thinking-max': 'Claude Sonnet 4.5 Thinking (Low)',
      'gpt-5.3-codex': 'Llama 3.1 405B (Groq)',
      'gemini-3-pro': 'Gemini 3 Flash Minimal'
    };

    return cheapAlternatives[model] || 'Llama 3.1 70B (Groq)';
  }
}
```

---

## Phase 5: Orchestration Controller (Week 3)

### 5.1 Main Orchestration Controller

**File**: `packages/opencode-model-router-x/src/orchestration-controller.js`

```javascript
class OrchestrationController {
  constructor() {
    this.globalModelContext = new GlobalModelContext();
    this.stuckBugDetector = new StuckBugDetector();
    this.reversionManager = new ReversionManager();
    this.manualOverrideController = new ManualOverrideController();
    this.rateLimitAdapter = new RateLimitAdapter(rotators, costCalculator);

    // Strategy chain (in order of priority)
    this.strategies = [
      new ProjectStartStrategy(),
      new ManualOverrideStrategy(this.manualOverrideController),
      new PerspectiveSwitchStrategy(rotators, this.stuckBugDetector),
      new FallbackLayerStrategy()
    ];
  }

  /**
   * Main orchestration entry point
   */
  async route(request) {
    const taskId = request.taskId || this.generateTaskId(request);

    // Check for manual override first
    const manualOverride = this.manualOverrideController.getOverride(taskId);
    if (manualOverride) {
      return manualOverride;
    }

    // Run through strategy chain
    for (const strategy of this.strategies) {
      const selection = strategy.select(request);

      if (selection) {
        // Apply rate limit adaptation
        const adapted = this.rateLimitAdapter.adapt(
          selection.model,
          request.intentCategory,
          request.complexity,
          request.volume
        );

        const finalSelection = {
          ...selection,
          ...adapted,
          taskId
        };

        // Broadcast globally if this is a perspective switch
        if (selection.reason === 'perspective-switch' || selection.reason === 'semantic-foundation') {
          await this.globalModelContext.pushOverride(finalSelection);
        }

        return finalSelection;
      }
    }

    // Default: fallback to layer 3 (NVIDIA)
    return {
      model: 'Llama 3.1 405B (NVIDIA)',
      provider: 'nvidia',
      reasoningEffort: 'none',
      estimatedCost: 0,
      taskId
    };
  }

  /**
   * Handle task completion result
   */
  async handleResult(taskId, selection, result) {
    // Record failure if error occurred
    if (result.error) {
      this.stuckBugDetector.recordFailure(taskId, result.error, result.context);
    }

    // Check if we should revert model selection
    if (await this.reversionManager.shouldRevert(taskId, selection, result)) {
      const reverted = await this.reversionManager.revert(taskId);
      if (reverted) {
        await this.globalModelContext.popOverride();
      }
    }
  }

  /**
   * Manual override API
   */
  setManualOverride(taskId, model, provider, reasoningEffort) {
    this.manualOverrideController.setOverride(taskId, model, provider, reasoningEffort);
  }

  clearManualOverride(taskId) {
    this.manualOverrideController.clearOverride(taskId);
  }
}
```

---

## Phase 6: Testing & Verification (Week 4)

### 6.1 Test Suite Structure

```
packages/opencode-model-router-x/tests/
├── orchestration/
│   ├── project-start.test.js
│   ├── stuck-bug-detector.test.js
│   ├── perspective-switch.test.js
│   ├── reversion-manager.test.js
│   ├── manual-override.test.js
│   └── orchestration-controller.test.js
├── strategies/
│   ├── fallback-layer.test.js
│   └── strategy-chain.test.js
└── integration/
    ├── end-to-end-orchestration.test.js
    └── model-propagation.test.js
```

### 6.2 Test Scenarios

1. **Project Start**: Verify high-power model selected for new experiments
2. **Stuck Bug**: Mock repeated failures → verify provider switch to most different
3. **Manual Override**: User forces model → verify override takes priority
4. **Reversion**: Perspective switch succeeds → verify revert to original
5. **Global Scope**: Spawn subtasks → verify all use same model
6. **Token Efficiency**: High-volume low-complexity → verify downgrade to cheaper

---

## Deliverables Summary

| Deliverable | File | Phase |
| :--- | :--- | :--- |
| Strategy Interface | `src/strategies/model-selection-strategy.js` | 1.1 |
| Fallback Strategy | `src/strategies/fallback-layer-strategy.js` | 1.2 |
| Project Start | `src/strategies/project-start-strategy.js` | 2.1 |
| Stuck Bug Detector | `src/stuck-bug-detector.js` | 2.2 |
| Perspective Switch | `src/strategies/perspective-switch-strategy.js` | 2.3 |
| Reversion Manager | `src/reversion-manager.js` | 2.4 |
| Manual Override | `src/manual-override-controller.js` | 2.5 |
| Global Context | `src/global-model-context.js` | 3.1 |
| Executor Update | `packages/opencode-sisyphus-state/src/integrations.js` | 3.2 |
| Cost Calculator | `src/token-cost-calculator.js` | 4.1 |
| Rate Limit Adapter | `src/rate-limit-adapt er.js` | 4.2 |
| Orchestration Controller | `src/orchestration-controller.js` | 5.1 |
| Test Suite | `tests/orchestration/*.test.js` | 6 |

---

## Success Criteria

1. **Semantic Foundation**: New experiments start with Claude Opus 4.6 or Sonnet 4.5 Thinking (Max)
2. **Auto Stuck Detection**: 3+ similar failures within 5 minutes trigger provider switch
3. **Max Diversity**: Provider switches traverse distance matrix → most different family
4. **Global Scope**: All spawned subtasks inherit model selection
5. **Reversion**: Successful perspective switches revert to original within 2 tasks
6. **Token Efficiency**: High-volume (>50) low-complexity (<2.0) tasks use cheaper models
7. **Manual Override**: User can force any model; takes top priority in strategy chain
8. **6-Layer Fallback**: Default routing follows Groq → Cerebras → NVIDIA → Antigravity → Anthropic → OpenAI

---

## Open Questions For Planning

1. **Embedding Service**: Should we integrate a real embedding service for semantic similarity, or use simplified hash-based detection for MVP?
2. **Distance Matrix**: Should the provider distance matrix be learned from historical performance, or fixed based on architectural differences?
3. **Reversion Timing**: Should reversion be immediate on success, or after 1 additional "stabilizing" task?
4. **Rate Limit Thresholds**: What are suitable thresholds for expensive vs cheap models in token efficiency logic?

---

## Next Steps

→ Execute Phase 1 (Week 1): Core Foundation
→ Refine implementation details for open questions
→ Begin phased rollout with feature flags
→ Monitor orchestration effectiveness via OpenCode Dashboard
