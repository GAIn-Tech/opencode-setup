'use strict';

const {
  validateModelName,
  validateModelExists,
  validateChainOrder,
  getModelInfo,
  listKnownModels,
} = require('./validators');

// ─── FallbackDoctor ──────────────────────────────────────────────────────────
// Diagnostic-only tool for validating OpenCode fallback model chains.
// Does NOT modify any configuration — read-only analysis.

class FallbackDoctor {
  /**
   * @param {object} [config] - Optional config with fallback chain
   * @param {string[]} [config.models] - Fallback model chain
   */
  constructor(config) {
    this._config = config || null;
    this._lastDiagnosis = null;
  }

  /**
   * Run full diagnostics on a config object's fallback chain.
   * @param {object} [config] - Config with .models array. Uses constructor config if omitted.
   * @returns {{ healthy: boolean, modelCount: number, issues: Issue[], suggestions: string[], chain: ChainResult }}
   */
  diagnose(config) {
    const cfg = config || this._config;
    if (!cfg || !cfg.models || !Array.isArray(cfg.models)) {
      const result = {
        healthy: false,
        modelCount: 0,
        issues: [{ severity: 'error', code: 'NO_CHAIN', message: 'No fallback chain found in config. Expected config.models to be an array.' }],
        suggestions: ['Provide a config object with a .models array of model identifiers.'],
        chain: null,
      };
      this._lastDiagnosis = result;
      return result;
    }

    const chainResult = this.validateChain(cfg.models);
    const result = {
      healthy: chainResult.valid,
      modelCount: cfg.models.length,
      issues: chainResult.issues,
      suggestions: chainResult.suggestions,
      chain: chainResult,
    };

    this._lastDiagnosis = result;
    return result;
  }

  /**
   * Validate a fallback model chain.
   * Runs syntax, existence, ordering, and duplicate checks.
   * @param {string[]} models - Ordered array of model identifiers
   * @returns {{ valid: boolean, issues: Issue[], suggestions: string[], details: object }}
   */
  validateChain(models) {
    if (!Array.isArray(models)) {
      return {
        valid: false,
        issues: [{ severity: 'error', code: 'INVALID_INPUT', message: 'models must be an array' }],
        suggestions: ['Pass an array of model name strings.'],
        details: {},
      };
    }

    const allIssues = [];
    const syntaxResults = {};
    const existenceResults = {};

    // ── Phase 1: Per-model validation ──
    for (const model of models) {
      // Syntax check
      const syntax = validateModelName(model);
      syntaxResults[model] = syntax;
      if (!syntax.valid) {
        for (const msg of syntax.issues) {
          allIssues.push({ severity: 'error', code: 'SYNTAX', model, message: msg });
        }
      }

      // Existence check (only if syntax is valid)
      if (syntax.valid) {
        const exists = validateModelExists(model);
        existenceResults[model] = exists;
        if (!exists.valid) {
          for (const msg of exists.issues) {
            allIssues.push({
              severity: 'warning',
              code: 'UNKNOWN_MODEL',
              model,
              message: msg,
              suggestion: exists.suggestion,
            });
          }
        }
      }
    }

    // ── Phase 2: Chain-level validation ──
    const ordering = validateChainOrder(models);
    if (!ordering.valid) {
      for (const msg of ordering.issues) {
        allIssues.push({ severity: 'error', code: 'ORDERING', message: msg });
      }
    }

    // ── Phase 3: Additional heuristic checks ──
    // Check: at least one Anthropic model
    const hasAnthropic = models.some((m) => m.startsWith('anthropic/'));
    if (!hasAnthropic) {
      allIssues.push({
        severity: 'warning',
        code: 'NO_ANTHROPIC',
        message: 'No Anthropic models in fallback chain. Anthropic-primary ordering is recommended.',
      });
    }

    // Check: chain length sanity
    if (models.length < 2) {
      allIssues.push({
        severity: 'warning',
        code: 'SHORT_CHAIN',
        message: `Fallback chain has only ${models.length} model(s). Recommend at least 3 for resilience.`,
      });
    }

    if (models.length > 20) {
      allIssues.push({
        severity: 'info',
        code: 'LONG_CHAIN',
        message: `Fallback chain has ${models.length} models. Consider trimming to reduce latency from cascading failures.`,
      });
    }

    // ── Build suggestions ──
    const suggestions = this.suggestFix(allIssues);
    if (ordering.suggestedOrder) {
      suggestions.push(`Suggested chain order: ${ordering.suggestedOrder.join(' -> ')}`);
    }

    return {
      valid: allIssues.filter((i) => i.severity === 'error').length === 0,
      issues: allIssues,
      suggestions,
      details: {
        syntax: syntaxResults,
        existence: existenceResults,
        ordering,
        modelCount: models.length,
        providers: [...new Set(models.map((m) => m.split('/')[0]))],
      },
    };
  }

  /**
   * Generate remediation suggestions from a list of issues.
   * @param {Issue[]} issues
   * @returns {string[]}
   */
  suggestFix(issues) {
    if (!Array.isArray(issues) || issues.length === 0) {
      return ['No issues found. Chain looks healthy.'];
    }

    const suggestions = [];
    const codes = new Set(issues.map((i) => i.code));

    if (codes.has('SYNTAX')) {
      const badModels = issues
        .filter((i) => i.code === 'SYNTAX')
        .map((i) => i.model)
        .filter(Boolean);
      suggestions.push(
        `Fix model name syntax for: ${[...new Set(badModels)].join(', ')}. Use format: provider/model (e.g. anthropic/claude-sonnet-4).`
      );
    }

    if (codes.has('UNKNOWN_MODEL')) {
      const unknown = issues.filter((i) => i.code === 'UNKNOWN_MODEL');
      for (const u of unknown) {
        if (u.suggestion) {
          suggestions.push(`Replace "${u.model}" with "${u.suggestion}" (closest known match).`);
        } else {
          suggestions.push(`Verify model "${u.model}" exists or remove it from the chain.`);
        }
      }
    }

    if (codes.has('ORDERING')) {
      suggestions.push(
        'Reorder chain: place all Anthropic models first (Opus -> Sonnet -> Haiku), then other providers.'
      );
    }

    if (codes.has('NO_ANTHROPIC')) {
      suggestions.push(
        'Add at least one Anthropic model (e.g. anthropic/claude-sonnet-4) as the primary fallback.'
      );
    }

    if (codes.has('SHORT_CHAIN')) {
      suggestions.push(
        'Add more models for resilience. Recommended minimum: 3 models across 2+ providers.'
      );
    }

    // Deduplicate suggestions
    return [...new Set(suggestions)];
  }

  /**
   * Generate a formatted diagnostic report.
   * Runs diagnose() if not already called.
   * @param {object} [config] - Optional config to diagnose
   * @returns {string}
   */
  report(config) {
    const diagnosis = config ? this.diagnose(config) : (this._lastDiagnosis || this.diagnose(this._config));

    const lines = [];
    lines.push('');
    lines.push('=== Fallback Doctor Report ===');
    lines.push('');

    if (!diagnosis || !diagnosis.chain) {
      lines.push('STATUS: ERROR - No valid chain to analyze');
      if (diagnosis && diagnosis.issues) {
        for (const issue of diagnosis.issues) {
          lines.push(`  [${issue.severity.toUpperCase()}] ${issue.message}`);
        }
      }
      lines.push('');
      return lines.join('\n');
    }

    const statusIcon = diagnosis.healthy ? 'OK' : 'ISSUES FOUND';
    lines.push(`STATUS: ${statusIcon}`);
    lines.push(`Models in chain: ${diagnosis.modelCount}`);
    lines.push(`Providers: ${diagnosis.chain.details.providers.join(', ')}`);
    lines.push('');

    const errors = diagnosis.issues.filter((i) => i.severity === 'error');
    const warnings = diagnosis.issues.filter((i) => i.severity === 'warning');
    const infos = diagnosis.issues.filter((i) => i.severity === 'info');

    if (errors.length > 0) {
      lines.push(`Errors (${errors.length}):`);
      for (const e of errors) {
        lines.push(`  [ERR]  ${e.message}`);
      }
      lines.push('');
    }

    if (warnings.length > 0) {
      lines.push(`Warnings (${warnings.length}):`);
      for (const w of warnings) {
        lines.push(`  [WARN] ${w.message}`);
      }
      lines.push('');
    }

    if (infos.length > 0) {
      lines.push(`Info (${infos.length}):`);
      for (const i of infos) {
        lines.push(`  [INFO] ${i.message}`);
      }
      lines.push('');
    }

    if (diagnosis.suggestions.length > 0) {
      lines.push('Suggestions:');
      for (let i = 0; i < diagnosis.suggestions.length; i++) {
        lines.push(`  ${i + 1}. ${diagnosis.suggestions[i]}`);
      }
      lines.push('');
    }

    if (diagnosis.healthy) {
      lines.push('All checks passed. Fallback chain is healthy.');
    }

    lines.push('==============================');
    lines.push('');
    return lines.join('\n');
  }
}

module.exports = { FallbackDoctor, validateModelName, validateModelExists, validateChainOrder, getModelInfo, listKnownModels };
