'use strict';

const path = require('node:path');
const { Reporter } = require('./reporter');

const DEFAULT_SUITE_PATH = path.join(__dirname, 'test-suite.json');

/**
 * Default cost rates per 1K tokens by model name.
 * Override via options.costRates when constructing Harness.
 */
const DEFAULT_COST_RATES = {
  'gpt-4':           { input: 0.03,   output: 0.06   },
  'gpt-4o':          { input: 0.005,  output: 0.015  },
  'gpt-3.5-turbo':   { input: 0.0005, output: 0.0015 },
  'claude-opus-4':   { input: 0.015,  output: 0.075  },
  'claude-sonnet-4': { input: 0.003,  output: 0.015  },
  'claude-haiku':    { input: 0.00025,output: 0.00125 },
  'default':         { input: 0.005,  output: 0.015  },
};

// ─── Result Validators ───────────────────────────────────────────────

/**
 * Check if a model response matches the expected result shape defined in a test case.
 * @param {string} response - The model's text response
 * @param {object} expected - The expected_result_shape from test-suite.json
 * @returns {{ passed: boolean, reason: string }}
 */
function validateResponse(response, expected) {
  if (!response || typeof response !== 'string') {
    return { passed: false, reason: 'Empty or non-string response' };
  }

  const normalized = response.toLowerCase();

  switch (expected.match) {
    case 'contains': {
      const found = normalized.includes(expected.value.toLowerCase());
      return {
        passed: found,
        reason: found
          ? `Response contains "${expected.value}"`
          : `Response missing "${expected.value}"`,
      };
    }

    case 'all_present': {
      const missing = expected.value.filter(
        (kw) => !normalized.includes(kw.toLowerCase())
      );
      return {
        passed: missing.length === 0,
        reason:
          missing.length === 0
            ? 'All keywords present'
            : `Missing keywords: ${missing.join(', ')}`,
      };
    }

    case 'any_present': {
      const found = expected.value.filter((kw) =>
        normalized.includes(kw.toLowerCase())
      );
      return {
        passed: found.length > 0,
        reason:
          found.length > 0
            ? `Found keywords: ${found.join(', ')}`
            : `None of the expected keywords found`,
      };
    }

    case 'code_check': {
      const { must_contain = [], must_not_contain = [] } = expected.value;
      const missingRequired = must_contain.filter(
        (token) => !normalized.includes(token.toLowerCase())
      );
      const foundForbidden = must_not_contain.filter((token) =>
        normalized.includes(token.toLowerCase())
      );
      const passed = missingRequired.length === 0 && foundForbidden.length === 0;
      const reasons = [];
      if (missingRequired.length > 0)
        reasons.push(`Missing: ${missingRequired.join(', ')}`);
      if (foundForbidden.length > 0)
        reasons.push(`Forbidden found: ${foundForbidden.join(', ')}`);
      return {
        passed,
        reason: passed ? 'Code structure valid' : reasons.join('; '),
      };
    }

    default:
      return { passed: false, reason: `Unknown match type: ${expected.match}` };
  }
}

// ─── Percentile helper ───────────────────────────────────────────────

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedArr.length) - 1;
  return sortedArr[Math.max(0, idx)];
}

// ─── Harness Class ───────────────────────────────────────────────────

class Harness {
  /**
   * @param {object} [options]
   * @param {string} [options.suitePath] - Path to test-suite.json
   * @param {object} [options.costRates] - Override cost rates { modelName: { input, output } }
   */
  constructor(options = {}) {
    this.suitePath = options.suitePath || DEFAULT_SUITE_PATH;
    this.costRates = { ...DEFAULT_COST_RATES, ...(options.costRates || {}) };
    this.reporter = new Reporter();
    this._suite = null;
  }

  /**
   * Lazily load the test suite.
   * @returns {Array<object>}
   */
  loadSuite() {
    if (!this._suite) {
      this._suite = require(this.suitePath);
    }
    return this._suite;
  }

  /**
   * Get cost rate for a model (falls back to 'default').
   * @param {string} model
   * @returns {{ input: number, output: number }}
   */
  getCostRate(model) {
    return this.costRates[model] || this.costRates['default'];
  }

  /**
   * Estimate the cost of a single call.
   * @param {string} model
   * @param {number} inputTokens
   * @param {number} outputTokens
   * @returns {number} Cost in USD
   */
  estimateCost(model, inputTokens, outputTokens) {
    const rate = this.getCostRate(model);
    return (inputTokens / 1000) * rate.input + (outputTokens / 1000) * rate.output;
  }

  /**
   * Run a single test case against a model adapter function.
   *
   * @param {string} model - Model name identifier
   * @param {object} testCase - A single test case from the suite
   * @param {function} adapter - async (prompt, options) => { response, inputTokens, outputTokens }
   * @returns {Promise<object>} Individual test result
   */
  async runTest(model, testCase, adapter) {
    const startTime = performance.now();
    let result;

    try {
      result = await adapter(testCase.prompt, {
        model,
        max_tokens: testCase.max_tokens || 512,
      });
    } catch (err) {
      const elapsed = performance.now() - startTime;
      return {
        test_id: testCase.id,
        model,
        passed: false,
        reason: `Adapter error: ${err.message}`,
        latency_ms: Math.round(elapsed * 100) / 100,
        cost_usd: 0,
        category: testCase.category,
        complexity_tier: testCase.complexity_tier,
      };
    }

    const elapsed = performance.now() - startTime;
    const { response, inputTokens = 0, outputTokens = 0 } = result;
    const validation = validateResponse(response, testCase.expected_result_shape);
    const cost = this.estimateCost(model, inputTokens, outputTokens);

    return {
      test_id: testCase.id,
      model,
      passed: validation.passed,
      reason: validation.reason,
      latency_ms: Math.round(elapsed * 100) / 100,
      cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
      category: testCase.category,
      complexity_tier: testCase.complexity_tier,
    };
  }

  /**
   * Run the full benchmark suite against a model.
   *
   * @param {string} model - Model name
   * @param {function} adapter - async (prompt, options) => { response, inputTokens, outputTokens }
   * @param {object} [options]
   * @param {Array<object>} [options.testSuite] - Override test suite (defaults to built-in)
   * @param {number} [options.concurrency=1] - Max concurrent test runs
   * @returns {Promise<object>} Benchmark result summary
   */
  async runBenchmark(model, adapter, options = {}) {
    const suite = options.testSuite || this.loadSuite();
    const concurrency = options.concurrency || 1;
    const results = [];

    // Run tests with basic concurrency control
    for (let i = 0; i < suite.length; i += concurrency) {
      const batch = suite.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map((tc) => this.runTest(model, tc, adapter))
      );
      results.push(...batchResults);
    }

    return this.measure(model, results);
  }

  /**
   * Aggregate individual test results into a benchmark summary.
   *
   * @param {string} model
   * @param {Array<object>} results - Array of individual test results
   * @returns {object} Aggregated benchmark result
   */
  measure(model, results) {
    const total = results.length;
    const passed = results.filter((r) => r.passed).length;
    const successRate = total > 0 ? passed / total : 0;

    const latencies = results.map((r) => r.latency_ms).sort((a, b) => a - b);
    const costs = results.map((r) => r.cost_usd);
    const totalCost = costs.reduce((sum, c) => sum + c, 0);

    const latencyMean =
      latencies.length > 0
        ? latencies.reduce((sum, l) => sum + l, 0) / latencies.length
        : 0;

    // Breakdown by category
    const categories = {};
    for (const r of results) {
      if (!categories[r.category]) {
        categories[r.category] = { total: 0, passed: 0 };
      }
      categories[r.category].total++;
      if (r.passed) categories[r.category].passed++;
    }

    const categoryBreakdown = {};
    for (const [cat, data] of Object.entries(categories)) {
      categoryBreakdown[cat] = {
        success_rate: data.total > 0 ? data.passed / data.total : 0,
        total: data.total,
        passed: data.passed,
      };
    }

    // Breakdown by complexity tier
    const tiers = {};
    for (const r of results) {
      const tier = `tier_${r.complexity_tier}`;
      if (!tiers[tier]) {
        tiers[tier] = { total: 0, passed: 0 };
      }
      tiers[tier].total++;
      if (r.passed) tiers[tier].passed++;
    }

    const tierBreakdown = {};
    for (const [tier, data] of Object.entries(tiers)) {
      tierBreakdown[tier] = {
        success_rate: data.total > 0 ? data.passed / data.total : 0,
        total: data.total,
        passed: data.passed,
      };
    }

    return {
      model,
      success_rate: Math.round(successRate * 10000) / 10000,
      tests_total: total,
      tests_passed: passed,
      latency_p50_ms: Math.round(percentile(latencies, 50) * 100) / 100,
      latency_p95_ms: Math.round(percentile(latencies, 95) * 100) / 100,
      latency_mean_ms: Math.round(latencyMean * 100) / 100,
      cost_total_usd: Math.round(totalCost * 1_000_000) / 1_000_000,
      cost_per_call_usd:
        total > 0
          ? Math.round((totalCost / total) * 1_000_000) / 1_000_000
          : 0,
      category_breakdown: categoryBreakdown,
      tier_breakdown: tierBreakdown,
      details: results,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Compare multiple models by running benchmarks and ranking them.
   *
   * @param {Array<{name: string, adapter: function}>} models
   *   Each entry: { name: "gpt-4", adapter: async (prompt, opts) => {...} }
   * @param {object} [options]
   * @param {Array<object>} [options.testSuite] - Override test suite
   * @param {number} [options.concurrency=1] - Concurrency per model
   * @returns {Promise<object>} Comparison result with rankings
   */
  async compareModels(models, options = {}) {
    const benchmarks = [];

    for (const { name, adapter } of models) {
      const result = await this.runBenchmark(name, adapter, options);
      benchmarks.push(result);
    }

    // Rank by composite score: success_rate * 0.7 + (1 / cost_per_call_normalized) * 0.3
    const maxCost = Math.max(...benchmarks.map((b) => b.cost_per_call_usd || 0.001));

    const ranked = benchmarks
      .map((b) => {
        const costEfficiency = 1 - (b.cost_per_call_usd / (maxCost || 1));
        const compositeScore =
          b.success_rate * 0.7 + costEfficiency * 0.3;
        return {
          ...b,
          cost_efficiency: Math.round(costEfficiency * 10000) / 10000,
          composite_score: Math.round(compositeScore * 10000) / 10000,
        };
      })
      .sort((a, b) => b.composite_score - a.composite_score)
      .map((b, idx) => ({ ...b, rank: idx + 1 }));

    return {
      comparison_id: `cmp_${Date.now()}`,
      models_evaluated: models.length,
      test_suite_size: this.loadSuite().length,
      rankings: ranked,
      best_model: ranked[0]?.model || null,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Create a mock adapter for testing the harness itself (no real API calls).
   * Useful for verifying the harness works before plugging in real models.
   *
   * @param {object} [options]
   * @param {number} [options.successProbability=0.8] - Chance of generating a "passing" response
   * @param {number} [options.latencyMs=100] - Simulated latency in ms
   * @param {number} [options.avgTokens=150] - Average output tokens
   * @returns {function} Mock adapter
   */
  static createMockAdapter(options = {}) {
    const {
      successProbability = 0.8,
      latencyMs = 100,
      avgTokens = 150,
    } = options;

    // Pre-built responses that match test suite expectations
    const passResponses = {
      'arithmetic-basic': 'The answer is 4.',
      'js-closure-explain':
        'A closure is a function that retains access to its outer scope variables even after the outer function has returned. This allows the inner function to reference variables from the enclosing scope.',
      'string-reverse':
        'function reverseString(str) { return str.split("").reverse().join(""); }',
      'bug-detection':
        'The bug is an off-by-one error: `i <= arr.length` should be `i < arr.length`. When i equals arr.length, arr[i] is undefined, leading to NaN.',
      'json-parse':
        'const data = JSON.parse(\'{"name": "Alice", "age": 30}\'); const name = data.name;',
      'regex-email': '/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/',
      'sql-select':
        'SELECT * FROM users WHERE age > 25 ORDER BY name ASC;',
      'time-complexity':
        'Binary search has a time complexity of O(log n) because it halves the search space with each comparison.',
      'refactor-extract':
        'function circleArea(r) { return Math.PI * r * r; }\nconst area1 = circleArea(r1);\nconst area2 = circleArea(r2);\nconst area3 = circleArea(r3);',
      'api-design':
        'POST /users\nRequest body: { "name": "string", "email": "string" }\nResponse: 201 Created\n{ "id": "uuid", "name": "...", "email": "..." }',
    };

    return async (prompt, opts) => {
      // Simulate latency with jitter
      const jitter = (Math.random() - 0.5) * latencyMs * 0.4;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(10, latencyMs + jitter))
      );

      // Determine if this should pass
      const shouldPass = Math.random() < successProbability;

      // Try to find matching response
      let response = 'I cannot determine the answer to this question.';
      if (shouldPass) {
        const testId = Object.keys(passResponses).find((id) =>
          prompt.toLowerCase().includes(id.replace(/-/g, ' ').substring(0, 8))
        );
        // Use keyword-based matching for the mock
        if (prompt.includes('2 + 2') || prompt.includes('2+2'))
          response = passResponses['arithmetic-basic'];
        else if (prompt.includes('closure'))
          response = passResponses['js-closure-explain'];
        else if (prompt.includes('reverse'))
          response = passResponses['string-reverse'];
        else if (prompt.includes('bug') || prompt.includes('Find the bug'))
          response = passResponses['bug-detection'];
        else if (prompt.includes('JSON'))
          response = passResponses['json-parse'];
        else if (prompt.includes('regular expression') || prompt.includes('regex'))
          response = passResponses['regex-email'];
        else if (prompt.includes('SQL') || prompt.includes('SELECT'))
          response = passResponses['sql-select'];
        else if (prompt.includes('time complexity') || prompt.includes('binary search'))
          response = passResponses['time-complexity'];
        else if (prompt.includes('Refactor') || prompt.includes('helper'))
          response = passResponses['refactor-extract'];
        else if (prompt.includes('REST API') || prompt.includes('endpoint'))
          response = passResponses['api-design'];
        else response = testId ? passResponses[testId] : response;
      }

      const inputTokens = Math.ceil(prompt.length / 4);
      const outputTokens = Math.ceil(
        avgTokens + (Math.random() - 0.5) * avgTokens * 0.5
      );

      return { response, inputTokens, outputTokens };
    };
  }
}

// ─── Exports ─────────────────────────────────────────────────────────

module.exports = { Harness, validateResponse, DEFAULT_COST_RATES };
