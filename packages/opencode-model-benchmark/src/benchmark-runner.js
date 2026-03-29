/**
 * ModelBenchmarkRunner - Executes benchmark suites against models
 * 
 * Supports: HumanEval, MBPP, SWE-bench lite
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Benchmark configurations
const BENCHMARKS = {
  humaneval: {
    name: 'HumanEval',
    description: 'Python code completion benchmark',
    testFile: join(__dirname, 'benchmarks', 'humaneval-v2-one-forward.json'),
    timeout: 30,
    metrics: ['pass@1', 'pass@10', 'pass@100']
  },
  mbpp: {
    name: 'MBPP',
    description: 'Mostly Basic Python Problems',
    testFile: join(__dirname, 'benchmarks', 'mbpp.json'),
    timeout: 30,
    metrics: ['pass@1', 'pass@10']
  },
  'swe-bench-lite': {
    'name': 'SWE-bench Lite',
    'description': 'Software engineering benchmark (subset)',
    testFile: join(__dirname, 'benchmarks', 'swe-bench-lite.json'),
    timeout: 120,
    metrics: ['resolve_rate']
  }
};

export class ModelBenchmarkRunner {
  constructor(options = {}) {
    this.dbPath = options.dbPath || join(__dirname, '..', '..', 'data', 'benchmark-results.db');
    this.results = [];
    this.benchmarks = options.benchmarks || Object.keys(BENCHMARKS);
    this.modelClient = options.modelClient || null;
    this.evaluator = options.evaluator || null;
    this.db = options.db || null;
    this._sandbox = null;
    this._dbInitPromise = Promise.resolve();

    if (!this.db && options.dbPath) {
      this._dbInitPromise = this.initializeDatabase(options.dbPath);
    }
  }

  async initializeDatabase(dbPath) {
    try {
      const { Database } = await import('bun:sqlite');
      this.db = new Database(dbPath);
      this.db.run(
        'CREATE TABLE IF NOT EXISTS benchmark_results (id INTEGER PRIMARY KEY AUTOINCREMENT, model_id TEXT, benchmark TEXT, timestamp TEXT, summary TEXT, problems TEXT)'
      );
    } catch {
      this.db = null;
    }
  }

  async ensureDatabase() {
    await this._dbInitPromise;
    return this.db;
  }

  /**
   * Run a single benchmark against a model
   */
  async runBenchmark(modelId, benchmarkName, options = {}) {
    const config = BENCHMARKS[benchmarkName];
    if (!config) {
      throw new Error(`Unknown benchmark: ${benchmarkName}`);
    }

    console.log(`Running ${config.name} against ${modelId}...`);
    
    const results = {
      modelId,
      benchmark: benchmarkName,
      timestamp: new Date().toISOString(),
      problems: [],
      summary: {}
    };

    // Load benchmark problems (would connect to actual benchmark data)
    const problems = await this.loadProblems(benchmarkName);
    
    for (const problem of problems) {
      const result = await this.evaluateProblem(modelId, problem, config);
      results.problems.push(result);
    }

    // Calculate metrics
    results.summary = this.calculateMetrics(results.problems, config.metrics);
    
    // Store results
    await this.storeResults(results);
    
    return results;
  }

  /**
   * Load benchmark problems
   */
  async loadProblems(benchmarkName) {
    const config = BENCHMARKS[benchmarkName];
    if (!config) {
      return this.getBuiltInProblems();
    }

    try {
      const raw = await fs.readFile(config.testFile, 'utf8');
      const parsed = JSON.parse(raw);
      const records = Array.isArray(parsed)
        ? parsed
        : parsed.problems || parsed.tasks || parsed.items || [];

      const normalized = records
        .map((problem, index) => this.normalizeProblem(problem, index))
        .filter(Boolean);

      if (normalized.length > 0) {
        return normalized;
      }
    } catch {
      // Fall through to built-in problems when benchmark files are unavailable.
    }

    return this.getBuiltInProblems();
  }

  normalizeProblem(problem, index) {
    if (!problem || typeof problem !== 'object') {
      return null;
    }

    const taskId = problem.task_id || problem.taskId || `${index + 1}`;
    const prompt = problem.prompt || problem.text || problem.question || '';
    const test = problem.test || problem.tests || problem.assertion || '';
    const entryPoint = problem.entry_point || problem.entryPoint || 'solution';

    if (!prompt || !test) {
      return null;
    }

    return {
      task_id: String(taskId),
      prompt: String(prompt),
      test: String(test),
      language: 'python',
      entry_point: String(entryPoint)
    };
  }

  getBuiltInProblems() {
    return [
      {
        task_id: 'mini-1',
        prompt: 'Write a function reverse_words(text) that reverses the order of words in a space-separated string.',
        test: 'assert reverse_words("hello world") == "world hello"\nassert reverse_words("a b c") == "c b a"',
        language: 'python',
        entry_point: 'reverse_words'
      },
      {
        task_id: 'mini-2',
        prompt: 'Write a function remove_duplicates(items) that preserves order while removing repeated values from a list.',
        test: 'assert remove_duplicates([1, 2, 2, 3, 1]) == [1, 2, 3]\nassert remove_duplicates([]) == []',
        language: 'python',
        entry_point: 'remove_duplicates'
      },
      {
        task_id: 'mini-3',
        prompt: 'Write a function count_vowels(text) that returns the number of vowels in a string.',
        test: 'assert count_vowels("OpenCode") == 4\nassert count_vowels("rhythm") == 0',
        language: 'python',
        entry_point: 'count_vowels'
      },
      {
        task_id: 'mini-4',
        prompt: 'Write a function flatten_once(values) that flattens a list by one level.',
        test: 'assert flatten_once([[1, 2], [3], [], [4, 5]]) == [1, 2, 3, 4, 5]',
        language: 'python',
        entry_point: 'flatten_once'
      }
    ];
  }

  /**
   * Evaluate a single problem against a model
   */
  async evaluateProblem(modelId, problem, config) {
    const startTime = Date.now();
    
    // Simulate evaluation (in production, call the model)
    const result = {
      problemId: problem?.task_id || 'unknown',
      completion: '',
      passed: false,
      error: null,
      latency: Date.now() - startTime
    };

    if (problem?.language === 'python') {
      if (this.modelClient) {
        try {
          const completion = await this.modelClient.complete({
            model: modelId,
            prompt: problem.prompt,
            maxTokens: 500,
            temperature: 0.2
          });
          result.completion = completion?.text || '';
        } catch (error) {
          result.error = error.message || String(error);
        }
      }

      if (this.evaluator) {
        try {
          result.passed = await this.evaluator.evaluate(
            result.completion,
            problem.test,
            problem.language
          );
        } catch (error) {
          result.error = error.message || String(error);
          result.passed = false;
        }
      } else {
        const sandbox = await this.getPythonSandbox();
        if (sandbox) {
          try {
            if (typeof sandbox.evaluate === 'function') {
              result.passed = await sandbox.evaluate(result.completion, problem?.test || '');
            } else {
              await sandbox.run(problem?.test || '');
              result.passed = true;
            }
          } catch (error) {
            result.error = error.message || String(error);
          }
        } else {
          result.passed = false;
        }
      }
    }

    if (!problem?.language || problem.language !== 'python') {
      result.passed = false;
    }

    result.latency = Date.now() - startTime;

    return result;
  }

  async getPythonSandbox() {
    if (this._sandbox) return this._sandbox;
    try {
      const { createPyodideSandbox } = await import('./pyodide-sandbox.js');
      this._sandbox = await createPyodideSandbox();
      return this._sandbox;
    } catch {
      return null;
    }
  }

  /**
   * Calculate benchmark metrics
   */
  calculateMetrics(results, metricNames) {
    const metrics = {};
    const passed = results.filter(r => r.passed).length;
    const total = results.length;

    for (const metric of metricNames) {
      if (metric.startsWith('pass@')) {
        const k = parseInt(metric.split('@')[1]);
        metrics[metric] = this.calculatePassAtK(results, k);
      } else if (metric === 'resolve_rate') {
        metrics[metric] = total > 0 ? passed / total : 0;
      }
    }

    return metrics;
  }

  /**
   * Calculate pass@k metric
   */
  calculatePassAtK(results, k) {
    const n = results.length;
    if (n === 0 || k <= 0) return 0;

    const c = results.filter((result) => result.passed).length;
    if (c === 0) return 0;
    if (k > n) return 1;

    const numerator = this.binomialCoefficient(n - c, k);
    const denominator = this.binomialCoefficient(n, k);
    if (denominator === 0) return 0;

    return 1 - numerator / denominator;
  }

  binomialCoefficient(n, k) {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;

    const m = Math.min(k, n - k);
    let result = 1;
    for (let i = 1; i <= m; i += 1) {
      result = (result * (n - m + i)) / i;
    }

    return result;
  }

  /**
   * Store results to database
   */
  async storeResults(results) {
    const db = await this.ensureDatabase();

    if (db) {
      db.run(
        'INSERT INTO benchmark_results (model_id, benchmark, timestamp, summary, problems) VALUES (?, ?, ?, ?, ?)',
        [
          results.modelId,
          results.benchmark,
          results.timestamp,
          JSON.stringify(results.summary || {}),
          JSON.stringify(results.problems || [])
        ]
      );
      return;
    }

    this.results.push(results);
  }

  /**
   * Get historical results for a model
   */
  async getHistory(modelId, benchmarkName) {
    const db = await this.ensureDatabase();
    if (db) {
      let query =
        'SELECT model_id, benchmark, timestamp, summary, problems FROM benchmark_results WHERE model_id = ?';
      const params = [modelId];

      if (benchmarkName) {
        query += ' AND benchmark = ?';
        params.push(benchmarkName);
      }

      query += ' ORDER BY timestamp ASC';

      const rows = db.query(query).all(...params);
      return rows.map((row) => ({
        modelId: row.model_id,
        benchmark: row.benchmark,
        timestamp: row.timestamp,
        summary: JSON.parse(row.summary || '{}'),
        problems: JSON.parse(row.problems || '[]')
      }));
    }

    return this.results.filter(r => 
      r.modelId === modelId && 
      (!benchmarkName || r.benchmark === benchmarkName)
    );
  }

  /**
   * Compare two models on a benchmark
   */
  async compareModels(modelIds, benchmarkName) {
    const comparisons = [];
    
    for (const modelId of modelIds) {
      const history = await this.getHistory(modelId, benchmarkName);
      if (history.length > 0) {
        const latest = history[history.length - 1];
        comparisons.push({
          modelId,
          benchmark: benchmarkName,
          metrics: latest.summary
        });
      }
    }

    return comparisons;
  }
}

export default ModelBenchmarkRunner;
export { BENCHMARKS };
