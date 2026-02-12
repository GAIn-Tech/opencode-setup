'use strict';

/**
 * Reporter — Formats benchmark results as JSON or CSV.
 * Zero external dependencies; uses Node stdlib only.
 */

class Reporter {
  /**
   * Convert benchmark results to a formatted JSON string.
   *
   * @param {object|Array<object>} results - Single benchmark or comparison rankings
   * @param {object} [options]
   * @param {boolean} [options.pretty=true] - Pretty-print JSON
   * @param {boolean} [options.includeDetails=false] - Include per-test details
   * @returns {string} JSON string
   */
  toJSON(results, options = {}) {
    const { pretty = true, includeDetails = false } = options;
    const data = this._normalizeResults(results, includeDetails);
    return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  }

  /**
   * Convert benchmark results to CSV format.
   * Produces a summary row per model (not per-test).
   *
   * @param {object|Array<object>} results - Single benchmark or comparison rankings
   * @param {object} [options]
   * @param {string} [options.delimiter=','] - Field delimiter
   * @param {boolean} [options.includeHeader=true] - Include CSV header row
   * @returns {string} CSV string
   */
  toCSV(results, options = {}) {
    const { delimiter = ',', includeHeader = true } = options;
    const rows = this._normalizeResults(results, false);
    const items = Array.isArray(rows) ? rows : [rows];

    if (items.length === 0) return '';

    const columns = [
      'rank',
      'model',
      'success_rate',
      'tests_passed',
      'tests_total',
      'latency_p50_ms',
      'latency_p95_ms',
      'latency_mean_ms',
      'cost_total_usd',
      'cost_per_call_usd',
      'composite_score',
      'timestamp',
    ];

    const lines = [];

    if (includeHeader) {
      lines.push(columns.join(delimiter));
    }

    for (const item of items) {
      const row = columns.map((col) => {
        const val = item[col];
        if (val === undefined || val === null) return '';
        // Escape strings containing delimiter or quotes
        if (typeof val === 'string' && (val.includes(delimiter) || val.includes('"'))) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return String(val);
      });
      lines.push(row.join(delimiter));
    }

    return lines.join('\n');
  }

  /**
   * Generate a per-test detailed CSV (one row per test per model).
   *
   * @param {object|Array<object>} results - Benchmark results with details
   * @param {object} [options]
   * @param {string} [options.delimiter=',']
   * @returns {string} Detailed CSV string
   */
  toDetailedCSV(results, options = {}) {
    const { delimiter = ',' } = options;
    const items = Array.isArray(results) ? results : [results];

    const columns = [
      'model',
      'test_id',
      'category',
      'complexity_tier',
      'passed',
      'reason',
      'latency_ms',
      'cost_usd',
    ];

    const lines = [columns.join(delimiter)];

    for (const benchmark of items) {
      const details = benchmark.details || benchmark.rankings?.flatMap((r) => r.details || []) || [];
      for (const d of details) {
        const row = columns.map((col) => {
          const val = d[col];
          if (val === undefined || val === null) return '';
          if (typeof val === 'boolean') return val ? '1' : '0';
          if (typeof val === 'string' && (val.includes(delimiter) || val.includes('"'))) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return String(val);
        });
        lines.push(row.join(delimiter));
      }
    }

    return lines.join('\n');
  }

  /**
   * Generate a concise text summary suitable for terminal output.
   *
   * @param {object} comparison - Output from Harness.compareModels()
   * @returns {string} Formatted text table
   */
  toText(comparison) {
    const rankings = comparison.rankings || [comparison];
    const lines = [];

    lines.push('');
    lines.push('=== OpenCode Eval Harness Results ===');
    lines.push(`Models evaluated: ${rankings.length}`);
    lines.push(`Test suite size: ${comparison.test_suite_size || rankings[0]?.tests_total || '?'}`);
    lines.push(`Timestamp: ${comparison.timestamp || new Date().toISOString()}`);
    lines.push('');

    // Header
    const hdr = padRow([
      'Rank', 'Model', 'Success', 'P95 (ms)', 'Mean (ms)',
      '$/call', 'Score',
    ]);
    lines.push(hdr);
    lines.push('-'.repeat(hdr.length));

    for (const r of rankings) {
      lines.push(
        padRow([
          r.rank || '-',
          r.model,
          `${(r.success_rate * 100).toFixed(1)}%`,
          r.latency_p95_ms,
          r.latency_mean_ms,
          `$${r.cost_per_call_usd?.toFixed(6) || '0'}`,
          r.composite_score?.toFixed(4) || '-',
        ])
      );
    }

    lines.push('');
    if (comparison.best_model) {
      lines.push(`Best model: ${comparison.best_model}`);
    }
    lines.push('');

    return lines.join('\n');
  }

  // ─── Internal ────────────────────────────────────────────────────

  /**
   * Normalize results into a flat array of per-model summaries.
   * Strips per-test details unless requested.
   */
  _normalizeResults(results, includeDetails = false) {
    if (!results) return [];

    // Comparison result
    if (results.rankings) {
      return results.rankings.map((r) => {
        if (!includeDetails) {
          const { details, ...rest } = r;
          return rest;
        }
        return r;
      });
    }

    // Array of benchmark results
    if (Array.isArray(results)) {
      return results.map((r) => {
        if (!includeDetails) {
          const { details, ...rest } = r;
          return rest;
        }
        return r;
      });
    }

    // Single benchmark result
    if (!includeDetails) {
      const { details, ...rest } = results;
      return rest;
    }
    return results;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

const COL_WIDTHS = [6, 20, 9, 10, 10, 12, 8];

function padRow(values) {
  return values
    .map((v, i) => String(v).padEnd(COL_WIDTHS[i] || 12))
    .join('  ');
}

// ─── Convenience Functions ───────────────────────────────────────────

const _reporter = new Reporter();

function toJSON(results, options) {
  return _reporter.toJSON(results, options);
}

function toCSV(results, options) {
  return _reporter.toCSV(results, options);
}

function toDetailedCSV(results, options) {
  return _reporter.toDetailedCSV(results, options);
}

function toText(comparison) {
  return _reporter.toText(comparison);
}

module.exports = { Reporter, toJSON, toCSV, toDetailedCSV, toText };
