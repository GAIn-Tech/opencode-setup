'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_DB_PATH = './assessments.db';
const MAX_ASSESSMENT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_ASSESSMENT_TIMEOUT_MS = MAX_ASSESSMENT_TIMEOUT_MS;
const DEFAULT_PROMPT_TIMEOUT_MS = 15 * 1000;
const BENCHMARK_TYPES = ['humaneval', 'mbpp', 'latency'];

const Z_SCORE_REFERENCE = {
  humaneval: { mean: 0.70, std: 0.15 },
  mbpp: { mean: 0.75, std: 0.12 },
  latency: { mean: 1200, std: 400, invert: true }
};

const LATENCY_PROMPTS = [
  'Summarize the benefits of test-driven development in 3 bullet points.',
  'Write a JavaScript function that deduplicates an array while preserving order.',
  'Explain the difference between consistency and availability in distributed systems.',
  'Given a list of integers, describe an O(n) approach to find the max subarray sum.',
  'Provide a concise checklist for reviewing a pull request before merge.'
];

const HUMANEVAL_SUBSET = [
  {
    id: 'humaneval-001',
    entryPoint: 'add',
    prompt: 'Write a Python function add(a: int, b: int) -> int that returns the sum of two integers.',
    tests: [
      { args: [1, 2], expected: 3 },
      { args: [-10, 4], expected: -6 },
      { args: [0, 0], expected: 0 }
    ]
  },
  {
    id: 'humaneval-002',
    entryPoint: 'factorial',
    prompt: 'Write a Python function factorial(n: int) -> int that returns n! for n >= 0.',
    tests: [
      { args: [0], expected: 1 },
      { args: [1], expected: 1 },
      { args: [5], expected: 120 }
    ]
  },
  {
    id: 'humaneval-003',
    entryPoint: 'is_palindrome',
    prompt: 'Write a Python function is_palindrome(text: str) -> bool that returns True when text is a palindrome after lowercasing and removing spaces.',
    tests: [
      { args: ['level'], expected: true },
      { args: ['Never odd or even'], expected: true },
      { args: ['OpenCode'], expected: false }
    ]
  },
  {
    id: 'humaneval-004',
    entryPoint: 'fibonacci',
    prompt: 'Write a Python function fibonacci(n: int) -> int that returns the nth Fibonacci number with fibonacci(0)=0 and fibonacci(1)=1.',
    tests: [
      { args: [0], expected: 0 },
      { args: [1], expected: 1 },
      { args: [7], expected: 13 }
    ]
  },
  {
    id: 'humaneval-005',
    entryPoint: 'reverse_words',
    prompt: 'Write a Python function reverse_words(text: str) -> str that reverses each word in place while preserving word order.',
    tests: [
      { args: ['hello world'], expected: 'olleh dlrow' },
      { args: ['a b c'], expected: 'a b c' },
      { args: ['model manager'], expected: 'ledom reganam' }
    ]
  },
  {
    id: 'humaneval-006',
    entryPoint: 'longest_common_prefix',
    prompt: 'Write a Python function longest_common_prefix(words: list[str]) -> str that returns the longest shared prefix of all words.',
    tests: [
      { args: [['flower', 'flow', 'flight']], expected: 'fl' },
      { args: [['dog', 'racecar', 'car']], expected: '' },
      { args: [['single']], expected: 'single' }
    ]
  },
  {
    id: 'humaneval-007',
    entryPoint: 'count_vowels',
    prompt: 'Write a Python function count_vowels(text: str) -> int that returns the number of vowels in the input string.',
    tests: [
      { args: ['abc'], expected: 1 },
      { args: ['OpenCode'], expected: 4 },
      { args: ['rhythm'], expected: 0 }
    ]
  },
  {
    id: 'humaneval-008',
    entryPoint: 'flatten_list',
    prompt: 'Write a Python function flatten_list(values: list[list[int]]) -> list[int] that flattens a list of integer lists.',
    tests: [
      { args: [[[1, 2], [3], [4, 5]]], expected: [1, 2, 3, 4, 5] },
      { args: [[[], [1], []]], expected: [1] },
      { args: [[[7]]], expected: [7] }
    ]
  },
  {
    id: 'humaneval-009',
    entryPoint: 'unique_sorted',
    prompt: 'Write a Python function unique_sorted(values: list[int]) -> list[int] that returns sorted unique integers.',
    tests: [
      { args: [[3, 1, 2, 3, 2]], expected: [1, 2, 3] },
      { args: [[5, 5, 5]], expected: [5] },
      { args: [[-1, 2, -1, 0]], expected: [-1, 0, 2] }
    ]
  },
  {
    id: 'humaneval-010',
    entryPoint: 'merge_intervals',
    prompt: 'Write a Python function merge_intervals(intervals: list[list[int]]) -> list[list[int]] that merges overlapping closed intervals.',
    tests: [
      { args: [[[1, 3], [2, 6], [8, 10]]], expected: [[1, 6], [8, 10]] },
      { args: [[[1, 4], [5, 6]]], expected: [[1, 4], [5, 6]] },
      { args: [[[1, 5], [2, 3]]], expected: [[1, 5]] }
    ]
  }
];

const MBPP_SUBSET = [
  {
    id: 'mbpp-001',
    entryPoint: 'square_sum',
    prompt: 'Write a Python function square_sum(n: int) -> int that returns 1^2 + 2^2 + ... + n^2.',
    tests: [
      { args: [1], expected: 1 },
      { args: [3], expected: 14 },
      { args: [5], expected: 55 }
    ]
  },
  {
    id: 'mbpp-002',
    entryPoint: 'filter_even',
    prompt: 'Write a Python function filter_even(values: list[int]) -> list[int] that returns only even numbers in the same order.',
    tests: [
      { args: [[1, 2, 3, 4]], expected: [2, 4] },
      { args: [[7, 9]], expected: [] },
      { args: [[0, -2, 5]], expected: [0, -2] }
    ]
  },
  {
    id: 'mbpp-003',
    entryPoint: 'rotate_left',
    prompt: 'Write a Python function rotate_left(values: list[int], steps: int) -> list[int] that rotates the list left by steps.',
    tests: [
      { args: [[1, 2, 3, 4], 1], expected: [2, 3, 4, 1] },
      { args: [[1, 2, 3, 4], 4], expected: [1, 2, 3, 4] },
      { args: [[1, 2, 3], 5], expected: [3, 1, 2] }
    ]
  },
  {
    id: 'mbpp-004',
    entryPoint: 'char_frequency',
    prompt: 'Write a Python function char_frequency(text: str, char: str) -> int that counts how many times char occurs in text.',
    tests: [
      { args: ['banana', 'a'], expected: 3 },
      { args: ['OpenCode', 'o'], expected: 1 },
      { args: ['test', 'z'], expected: 0 }
    ]
  },
  {
    id: 'mbpp-005',
    entryPoint: 'remove_duplicates',
    prompt: 'Write a Python function remove_duplicates(values: list[int]) -> list[int] that removes duplicates while preserving first occurrence order.',
    tests: [
      { args: [[1, 2, 2, 3, 1]], expected: [1, 2, 3] },
      { args: [[4, 4, 4]], expected: [4] },
      { args: [[5, 6, 7]], expected: [5, 6, 7] }
    ]
  },
  {
    id: 'mbpp-006',
    entryPoint: 'clamp',
    prompt: 'Write a Python function clamp(value: int, low: int, high: int) -> int that keeps value inside the inclusive range [low, high].',
    tests: [
      { args: [5, 1, 10], expected: 5 },
      { args: [-1, 0, 3], expected: 0 },
      { args: [15, 0, 10], expected: 10 }
    ]
  },
  {
    id: 'mbpp-007',
    entryPoint: 'transpose_matrix',
    prompt: 'Write a Python function transpose_matrix(matrix: list[list[int]]) -> list[list[int]] that returns the matrix transpose.',
    tests: [
      { args: [[ [1, 2], [3, 4] ]], expected: [[1, 3], [2, 4]] },
      { args: [[ [1, 2, 3] ]], expected: [[1], [2], [3]] },
      { args: [[ [5], [6] ]], expected: [[5, 6]] }
    ]
  },
  {
    id: 'mbpp-008',
    entryPoint: 'to_celsius',
    prompt: 'Write a Python function to_celsius(fahrenheit: float) -> float that converts Fahrenheit to Celsius rounded to 2 decimals.',
    tests: [
      { args: [32], expected: 0.0 },
      { args: [212], expected: 100.0 },
      { args: [68], expected: 20.0 }
    ]
  },
  {
    id: 'mbpp-009',
    entryPoint: 'chunk_list',
    prompt: 'Write a Python function chunk_list(values: list[int], size: int) -> list[list[int]] that chunks values into lists of at most size.',
    tests: [
      { args: [[1, 2, 3, 4, 5], 2], expected: [[1, 2], [3, 4], [5]] },
      { args: [[1, 2, 3], 5], expected: [[1, 2, 3]] },
      { args: [[1, 2, 3, 4], 1], expected: [[1], [2], [3], [4]] }
    ]
  },
  {
    id: 'mbpp-010',
    entryPoint: 'word_lengths',
    prompt: 'Write a Python function word_lengths(text: str) -> list[int] that returns the length of each whitespace-separated word.',
    tests: [
      { args: ['hello world'], expected: [5, 5] },
      { args: ['a bb ccc'], expected: [1, 2, 3] },
      { args: [''], expected: [] }
    ]
  }
];

class ModelAssessor {
  constructor(options = {}) {
    const configuredTimeout = toPositiveInteger(options.timeout, DEFAULT_ASSESSMENT_TIMEOUT_MS);
    this.timeout = Math.min(configuredTimeout, MAX_ASSESSMENT_TIMEOUT_MS);
    this.promptTimeout = toPositiveInteger(options.promptTimeout, DEFAULT_PROMPT_TIMEOUT_MS);

    this.dbPath = path.resolve(options.dbPath || DEFAULT_DB_PATH);
    this.executePrompt = typeof options.executePrompt === 'function' ? options.executePrompt : null;
    this.humanEvalSubset = Array.isArray(options.humanEvalSubset) && options.humanEvalSubset.length > 0
      ? options.humanEvalSubset
      : HUMANEVAL_SUBSET;
    this.mbppSubset = Array.isArray(options.mbppSubset) && options.mbppSubset.length > 0
      ? options.mbppSubset
      : MBPP_SUBSET;
    this.latencyPrompts = Array.isArray(options.latencyPrompts) && options.latencyPrompts.length > 0
      ? options.latencyPrompts
      : LATENCY_PROMPTS;

    this._initializeDatabase();
  }

  async assess(model) {
    const modelId = this._resolveModelId(model);
    const provider = this._resolveProvider(model);
    const startedAt = Date.now();

    const benchmarks = {};
    const failures = [];

    for (const benchmarkType of BENCHMARK_TYPES) {
      const elapsed = Date.now() - startedAt;
      const remaining = this.timeout - elapsed;

      if (remaining <= 0) {
        throw createTimeoutError(this.timeout);
      }

      try {
        benchmarks[benchmarkType] = await withTimeout(
          this.runBenchmark(model, benchmarkType),
          remaining,
          `Assessment exceeded timeout of ${this.timeout}ms`,
          'ASSESSMENT_TIMEOUT'
        );
      } catch (error) {
        if (error && error.code === 'ASSESSMENT_TIMEOUT') {
          throw error;
        }

        benchmarks[benchmarkType] = this._buildFailureBenchmarkResult(benchmarkType, error);
        failures.push(benchmarkType);
      }
    }

    const duration = Date.now() - startedAt;
    const payload = {
      modelId,
      provider,
      timestamp: startedAt,
      benchmarks,
      zScore: this.calculateScore(benchmarks),
      duration,
      failures
    };

    await this.storeResults(model, payload);
    return payload;
  }

  async runBenchmark(model, benchmarkType) {
    const normalizedType = normalizeBenchmarkType(benchmarkType);

    if (normalizedType === 'humaneval') {
      return this._runCodingBenchmark(model, normalizedType, this.humanEvalSubset);
    }

    if (normalizedType === 'mbpp') {
      return this._runCodingBenchmark(model, normalizedType, this.mbppSubset);
    }

    if (normalizedType === 'latency') {
      return this._runLatencyBenchmark(model);
    }

    throw new Error(`Unsupported benchmark type: ${benchmarkType}`);
  }

  calculateScore(results) {
    const benchmarkResults = results && results.benchmarks ? results.benchmarks : results;
    if (!benchmarkResults || typeof benchmarkResults !== 'object') {
      return 0;
    }

    const zScores = [];

    if (benchmarkResults.humaneval && Number.isFinite(benchmarkResults.humaneval.score)) {
      zScores.push(this._calculateZScore(benchmarkResults.humaneval.score, Z_SCORE_REFERENCE.humaneval));
    }

    if (benchmarkResults.mbpp && Number.isFinite(benchmarkResults.mbpp.score)) {
      zScores.push(this._calculateZScore(benchmarkResults.mbpp.score, Z_SCORE_REFERENCE.mbpp));
    }

    if (benchmarkResults.latency && Number.isFinite(benchmarkResults.latency.avgMs)) {
      zScores.push(this._calculateZScore(benchmarkResults.latency.avgMs, Z_SCORE_REFERENCE.latency));
    }

    if (zScores.length === 0) {
      return 0;
    }

    const total = zScores.reduce((accumulator, value) => accumulator + value, 0);
    return round(total / zScores.length, 6);
  }

  async storeResults(model, results) {
    const modelId = this._resolveModelId(model);
    const provider = this._resolveProvider(model);
    const timestamp = Number.isFinite(Number(results.timestamp)) ? Number(results.timestamp) : Date.now();
    const duration = Number.isFinite(Number(results.duration)) ? Number(results.duration) : 0;
    const zScore = Number.isFinite(Number(results.zScore)) ? Number(results.zScore) : 0;

    this.db.run(
      `
      INSERT INTO model_assessments (
        model_id, provider, timestamp, duration, z_score, results_json
      ) VALUES (?, ?, ?, ?, ?, ?)
      `,
      [modelId, provider, timestamp, duration, zScore, JSON.stringify(results)]
    );

    const benchmarks = results.benchmarks && typeof results.benchmarks === 'object'
      ? results.benchmarks
      : {};

    for (const [benchmarkName, benchmarkResult] of Object.entries(benchmarks)) {
      const score = Number.isFinite(Number(benchmarkResult.score)) ? Number(benchmarkResult.score) : null;
      const passed = Number.isFinite(Number(benchmarkResult.passed)) ? Number(benchmarkResult.passed) : null;
      const total = Number.isFinite(Number(benchmarkResult.total)) ? Number(benchmarkResult.total) : null;

      this.db.run(
        `
        INSERT INTO assessment_benchmarks (
          model_id, benchmark_name, score, passed, total, details_json, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          modelId,
          String(benchmarkName),
          score,
          passed,
          total,
          JSON.stringify(benchmarkResult || {}),
          timestamp
        ]
      );
    }
  }

  async getResults(modelId) {
    const row = this.db.get(
      `
      SELECT results_json
      FROM model_assessments
      WHERE model_id = ?
      ORDER BY timestamp DESC, id DESC
      LIMIT 1
      `,
      [String(modelId || '')]
    );

    if (!row) {
      return null;
    }

    return parseJsonSafely(row.results_json, null);
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }

  async _runCodingBenchmark(model, benchmarkType, problems) {
    const benchmarkProblems = Array.isArray(problems) ? problems.slice(0, 10) : [];
    const details = [];
    let passed = 0;

    for (const problem of benchmarkProblems) {
      const problemStart = Date.now();

      try {
        const response = await withTimeout(
          this._executeBenchmarkPrompt(model, problem.prompt, {
            benchmarkType,
            problemId: problem.id
          }),
          this.promptTimeout,
          `${benchmarkType} problem ${problem.id} timed out`,
          'BENCHMARK_PROMPT_TIMEOUT'
        );
        const evaluation = await this._evaluatePythonProblem(problem, response);
        if (evaluation.passed) {
          passed += 1;
        }

        details.push({
          id: problem.id,
          passed: evaluation.passed,
          latencyMs: Date.now() - problemStart,
          error: evaluation.error || null,
          diagnostics: evaluation.diagnostics || []
        });
      } catch (error) {
        details.push({
          id: problem.id,
          passed: false,
          latencyMs: Date.now() - problemStart,
          error: error instanceof Error ? error.message : String(error),
          diagnostics: []
        });
      }
    }

    const total = benchmarkProblems.length;
    const score = total > 0 ? passed / total : 0;

    return {
      score: round(score, 6),
      passed,
      total,
      details
    };
  }

  async _runLatencyBenchmark(model) {
    const samples = [];

    for (const prompt of this.latencyPrompts.slice(0, 5)) {
      const startedAt = Date.now();

      await withTimeout(
        this._executeBenchmarkPrompt(model, prompt, {
          benchmarkType: 'latency'
        }),
        this.promptTimeout,
        'Latency prompt timed out',
        'BENCHMARK_PROMPT_TIMEOUT'
      );

      samples.push(Date.now() - startedAt);
    }

    const sorted = samples.slice().sort((left, right) => left - right);
    const avgMs = samples.length > 0
      ? samples.reduce((total, value) => total + value, 0) / samples.length
      : 0;

    return {
      avgMs: round(avgMs, 2),
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      samples
    };
  }

  async _executeBenchmarkPrompt(model, prompt, context) {
    const executor = this._resolveExecutor(model);
    const output = await executor(model, prompt, context || {});
    return normalizeOutput(output);
  }

  _resolveExecutor(model) {
    if (this.executePrompt) {
      return this.executePrompt;
    }

    if (model && typeof model.executePrompt === 'function') {
      return async (_model, prompt, context) => model.executePrompt(prompt, context || {});
    }

    if (model && typeof model.generate === 'function') {
      return async (_model, prompt, context) => model.generate(prompt, context || {});
    }

    if (model && typeof model.complete === 'function') {
      return async (_model, prompt, context) => model.complete(prompt, context || {});
    }

    throw new Error('No model execution function available. Provide options.executePrompt(model, prompt, context).');
  }

  async _evaluatePythonProblem(problem, rawOutput) {
    const extractedCode = extractPythonCode(rawOutput);
    if (!extractedCode) {
      return {
        passed: false,
        error: 'No Python code returned by model',
        diagnostics: []
      };
    }

    try {
      return await this._runPythonValidation(problem, extractedCode);
    } catch (error) {
      return {
        passed: false,
        error: error instanceof Error ? error.message : String(error),
        diagnostics: []
      };
    }
  }

  async _runPythonValidation(problem, generatedCode) {
    const script = buildPythonValidationScript(problem, generatedCode);
    const { spawn } = require('child_process');

    const execution = new Promise((resolve, reject) => {
      const child = spawn('python', ['-c', script], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

       child.once('error', (error) => {
         reject(error);
       });

       child.once('close', () => {
         // Clean up data listeners
         child.stdout.removeAllListeners('data');
         child.stderr.removeAllListeners('data');
         
         const trimmed = stdout.trim();
         const payload = parseJsonSafely(trimmed, null);

         if (!payload || typeof payload !== 'object') {
           resolve({
             passed: false,
             error: stderr || 'Unable to parse Python validator output',
             diagnostics: []
           });
           return;
         }

         resolve({
           passed: Boolean(payload.ok),
           error: payload.error || null,
           diagnostics: Array.isArray(payload.diagnostics) ? payload.diagnostics : []
         });
       });
    });

    return withTimeout(
      execution,
      this.promptTimeout,
      `Python validation timed out for ${problem.id}`,
      'BENCHMARK_VALIDATION_TIMEOUT'
    );
  }

  _initializeDatabase() {
    const directory = path.dirname(this.dbPath);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    this.db = createSqliteClient(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS model_assessments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        z_score REAL NOT NULL,
        results_json TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_model_assessments_model_timestamp
        ON model_assessments(model_id, timestamp DESC);

      CREATE TABLE IF NOT EXISTS assessment_benchmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        model_id TEXT NOT NULL,
        benchmark_name TEXT NOT NULL,
        score REAL,
        passed INTEGER,
        total INTEGER,
        details_json TEXT,
        timestamp INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_assessment_benchmarks_model
        ON assessment_benchmarks(model_id, benchmark_name, timestamp DESC);
    `);
  }

  _resolveModelId(model) {
    if (model && typeof model === 'object' && typeof model.id === 'string' && model.id.length > 0) {
      return model.id;
    }

    if (typeof model === 'string' && model.length > 0) {
      return model;
    }

    throw new Error('Model must include a non-empty id');
  }

  _resolveProvider(model) {
    if (model && typeof model === 'object' && typeof model.provider === 'string') {
      return model.provider;
    }

    return '';
  }

  _calculateZScore(value, reference) {
    if (!reference || !Number.isFinite(reference.mean) || !Number.isFinite(reference.std) || reference.std <= 0) {
      return 0;
    }

    if (reference.invert) {
      return (reference.mean - value) / reference.std;
    }

    return (value - reference.mean) / reference.std;
  }

  _buildFailureBenchmarkResult(benchmarkType, error) {
    const message = error instanceof Error ? error.message : String(error);

    if (benchmarkType === 'latency') {
      return {
        avgMs: Number.POSITIVE_INFINITY,
        p50: Number.POSITIVE_INFINITY,
        p95: Number.POSITIVE_INFINITY,
        p99: Number.POSITIVE_INFINITY,
        error: message,
        samples: []
      };
    }

    return {
      score: 0,
      passed: 0,
      total: benchmarkType === 'humaneval' ? 10 : 10,
      error: message,
      details: []
    };
  }
}

function withTimeout(promise, timeoutMs, message, code) {
  let timeoutHandle;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      const error = new Error(message);
      error.code = code;
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutHandle);
  });
}

function createTimeoutError(timeoutMs) {
  const error = new Error(`Assessment exceeded timeout of ${timeoutMs}ms`);
  error.code = 'ASSESSMENT_TIMEOUT';
  return error;
}

function normalizeBenchmarkType(benchmarkType) {
  return String(benchmarkType || '').trim().toLowerCase();
}

function toPositiveInteger(value, fallback) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return fallback;
  }

  return Math.floor(numericValue);
}

function normalizeOutput(output) {
  if (typeof output === 'string') {
    return output;
  }

  if (!output || typeof output !== 'object') {
    return '';
  }

  if (typeof output.response === 'string') {
    return output.response;
  }

  if (typeof output.text === 'string') {
    return output.text;
  }

  if (typeof output.content === 'string') {
    return output.content;
  }

  if (Array.isArray(output.content)) {
    const textParts = output.content
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return '';
        }

        if (typeof entry.text === 'string') {
          return entry.text;
        }

        if (typeof entry.value === 'string') {
          return entry.value;
        }

        return '';
      })
      .filter(Boolean);

    if (textParts.length > 0) {
      return textParts.join('\n');
    }
  }

  return '';
}

function parseJsonSafely(raw, fallback) {
  if (typeof raw !== 'string' || raw.length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch (_error) {
    return fallback;
  }
}

function extractPythonCode(rawOutput) {
  const text = String(rawOutput || '').trim();
  if (!text) {
    return '';
  }

  const fencedPython = text.match(/```python\s*([\s\S]*?)```/i);
  if (fencedPython && fencedPython[1]) {
    return fencedPython[1].trim();
  }

  const fencedGeneric = text.match(/```\s*([\s\S]*?)```/i);
  if (fencedGeneric && fencedGeneric[1]) {
    return fencedGeneric[1].trim();
  }

  return text;
}

function buildPythonValidationScript(problem, generatedCode) {
  return `
import json

problem = json.loads(${JSON.stringify(JSON.stringify(problem))})
generated_code = ${JSON.stringify(generatedCode)}

namespace = {}

try:
    exec(generated_code, namespace, namespace)
except Exception as exc:
    print(json.dumps({"ok": False, "error": f"compile_error: {exc}", "diagnostics": []}))
    raise SystemExit(0)

entry_point = problem.get("entryPoint")
candidate = namespace.get(entry_point)

if not callable(candidate):
    print(json.dumps({"ok": False, "error": f"missing_entry_point: {entry_point}", "diagnostics": []}))
    raise SystemExit(0)

passed = 0
diagnostics = []
tests = problem.get("tests", [])

for index, test_case in enumerate(tests):
    args = test_case.get("args", [])
    kwargs = test_case.get("kwargs", {})
    expected = test_case.get("expected")

    try:
        actual = candidate(*args, **kwargs)
        if actual == expected:
            passed += 1
        else:
            diagnostics.append({
                "test": index,
                "expected": expected,
                "actual": actual
            })
    except Exception as exc:
        diagnostics.append({
            "test": index,
            "error": str(exc)
        })

ok = passed == len(tests)
print(json.dumps({
    "ok": ok,
    "error": None if ok else "test_failures",
    "diagnostics": diagnostics[:3]
}))
`.trim();
}

function percentile(sortedNumbers, percentileValue) {
  if (!Array.isArray(sortedNumbers) || sortedNumbers.length === 0) {
    return 0;
  }

  const position = Math.ceil((percentileValue / 100) * sortedNumbers.length) - 1;
  const index = Math.max(0, Math.min(position, sortedNumbers.length - 1));
  return sortedNumbers[index];
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function createSqliteClient(dbPath) {
  const bunDatabase = tryLoadBunDatabase();
  if (bunDatabase) {
    return new BunSqliteClient(new bunDatabase(dbPath, { create: true }));
  }

  const BetterSqliteDatabase = require('better-sqlite3');
  return new BetterSqliteClient(new BetterSqliteDatabase(dbPath));
}

function tryLoadBunDatabase() {
  try {
    const bunSqlite = require('bun:sqlite');
    if (bunSqlite && typeof bunSqlite.Database === 'function') {
      return bunSqlite.Database;
    }

    return null;
  } catch (_error) {
    return null;
  }
}

class BunSqliteClient {
  constructor(database) {
    this.database = database;
  }

  pragma(statement) {
    this.database.exec(`PRAGMA ${statement}`);
  }

  exec(sql) {
    this.database.exec(sql);
  }

  run(sql, params) {
    this.database.query(sql).run(...normalizeSqlParams(params));
  }

  get(sql, params) {
    return this.database.query(sql).get(...normalizeSqlParams(params)) || null;
  }

  close() {
    this.database.close();
  }
}

class BetterSqliteClient {
  constructor(database) {
    this.database = database;
  }

  pragma(statement) {
    this.database.pragma(statement);
  }

  exec(sql) {
    this.database.exec(sql);
  }

  run(sql, params) {
    this.database.prepare(sql).run(...normalizeSqlParams(params));
  }

  get(sql, params) {
    return this.database.prepare(sql).get(...normalizeSqlParams(params)) || null;
  }

  close() {
    this.database.close();
  }
}

function normalizeSqlParams(params) {
  if (!Array.isArray(params)) {
    return [];
  }

  return params;
}

module.exports = {
  ModelAssessor
};
