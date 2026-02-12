'use strict';

// ─── Known Model Registry ────────────────────────────────────────────────────
// Canonical model names across supported providers.
// Format: provider/model or provider/model/variant

const KNOWN_MODELS = new Map([
  // Anthropic
  ['anthropic/claude-opus-4', { provider: 'anthropic', tier: 0, family: 'opus' }],
  ['anthropic/claude-opus-4-0520', { provider: 'anthropic', tier: 0, family: 'opus' }],
  ['anthropic/claude-sonnet-4', { provider: 'anthropic', tier: 1, family: 'sonnet' }],
  ['anthropic/claude-sonnet-4-0514', { provider: 'anthropic', tier: 1, family: 'sonnet' }],
  ['anthropic/claude-sonnet-4-20250514', { provider: 'anthropic', tier: 1, family: 'sonnet' }],
  ['anthropic/claude-3.5-sonnet', { provider: 'anthropic', tier: 2, family: 'sonnet' }],
  ['anthropic/claude-3.5-sonnet-20241022', { provider: 'anthropic', tier: 2, family: 'sonnet' }],
  ['anthropic/claude-3-haiku', { provider: 'anthropic', tier: 3, family: 'haiku' }],
  ['anthropic/claude-3-haiku-20240307', { provider: 'anthropic', tier: 3, family: 'haiku' }],
  ['anthropic/claude-3.5-haiku', { provider: 'anthropic', tier: 3, family: 'haiku' }],
  ['anthropic/claude-3.5-haiku-20241022', { provider: 'anthropic', tier: 3, family: 'haiku' }],

  // OpenAI
  ['openai/gpt-5', { provider: 'openai', tier: 10, family: 'gpt5' }],
  ['openai/gpt-5-mini', { provider: 'openai', tier: 11, family: 'gpt5' }],
  ['openai/gpt-4.1', { provider: 'openai', tier: 10, family: 'gpt4' }],
  ['openai/gpt-4.1-mini', { provider: 'openai', tier: 11, family: 'gpt4' }],
  ['openai/gpt-4.1-nano', { provider: 'openai', tier: 12, family: 'gpt4' }],
  ['openai/gpt-4o', { provider: 'openai', tier: 10, family: 'gpt4' }],
  ['openai/gpt-4o-mini', { provider: 'openai', tier: 11, family: 'gpt4' }],
  ['openai/o3', { provider: 'openai', tier: 10, family: 'o-series' }],
  ['openai/o3-mini', { provider: 'openai', tier: 11, family: 'o-series' }],
  ['openai/o4-mini', { provider: 'openai', tier: 11, family: 'o-series' }],

  // Google Gemini
  ['google/gemini-2.5-pro', { provider: 'google', tier: 10, family: 'gemini' }],
  ['google/gemini-2.5-flash', { provider: 'google', tier: 11, family: 'gemini' }],
  ['google/gemini-2.0-flash', { provider: 'google', tier: 12, family: 'gemini' }],
  ['google/gemini-2.0-flash-lite', { provider: 'google', tier: 13, family: 'gemini' }],

  // Moonshot / Kimi
  ['kimi/k2.5', { provider: 'kimi', tier: 10, family: 'kimi' }],
  ['kimi/k2.5-chat', { provider: 'kimi', tier: 11, family: 'kimi' }],
]);

// Valid providers
const VALID_PROVIDERS = new Set(['anthropic', 'openai', 'google', 'kimi', 'mistral', 'meta', 'deepseek', 'xai']);

// ─── Model Name Syntax ──────────────────────────────────────────────────────
// Accepted formats:
//   provider/model
//   provider/model-variant
//   provider/model-variant-version
//   provider/model/version  (slash-separated version)

const MODEL_NAME_REGEX = /^[a-z][a-z0-9-]*\/[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)?$/;

/**
 * Validate model name syntax.
 * @param {string} name - Model identifier
 * @returns {{ valid: boolean, issues: string[] }}
 */
function validateModelName(name) {
  const issues = [];

  if (typeof name !== 'string' || name.length === 0) {
    return { valid: false, issues: ['Model name must be a non-empty string'] };
  }

  // Check basic format
  if (!MODEL_NAME_REGEX.test(name)) {
    issues.push(
      `Invalid model name syntax: "${name}". Expected format: provider/model (e.g. anthropic/claude-sonnet-4)`
    );
  }

  // Check provider segment
  const slashIdx = name.indexOf('/');
  if (slashIdx === -1) {
    issues.push(`Missing provider prefix. Use provider/model format (e.g. openai/gpt-5)`);
  } else {
    const provider = name.slice(0, slashIdx);
    if (!VALID_PROVIDERS.has(provider)) {
      issues.push(
        `Unknown provider "${provider}". Known providers: ${[...VALID_PROVIDERS].join(', ')}`
      );
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * Validate that a model name corresponds to a known model.
 * @param {string} name - Model identifier
 * @returns {{ valid: boolean, issues: string[], suggestion?: string }}
 */
function validateModelExists(name) {
  const issues = [];
  let suggestion;

  if (KNOWN_MODELS.has(name)) {
    return { valid: true, issues: [] };
  }

  // Try fuzzy match — find closest known model
  const provider = name.split('/')[0];
  const providerModels = [...KNOWN_MODELS.keys()].filter((k) => k.startsWith(provider + '/'));

  if (providerModels.length > 0) {
    // Find best Levenshtein-ish match within same provider
    let bestMatch = providerModels[0];
    let bestDist = Infinity;
    for (const candidate of providerModels) {
      const dist = simpleDistance(name, candidate);
      if (dist < bestDist) {
        bestDist = dist;
        bestMatch = candidate;
      }
    }
    suggestion = bestMatch;
    issues.push(
      `Unknown model "${name}". Did you mean "${bestMatch}"? Known ${provider} models: ${providerModels.join(', ')}`
    );
  } else {
    issues.push(
      `Unknown model "${name}". No known models for provider "${provider}".`
    );
  }

  return { valid: false, issues, suggestion };
}

/**
 * Validate fallback chain ordering.
 * Rules:
 *   1. Anthropic models MUST come before non-Anthropic models.
 *   2. Within Anthropic: Opus → Sonnet → Haiku (by tier).
 *   3. No duplicate models in chain.
 *
 * @param {string[]} models - Ordered fallback chain
 * @returns {{ valid: boolean, issues: string[], suggestedOrder?: string[] }}
 */
function validateChainOrder(models) {
  const issues = [];

  if (!Array.isArray(models) || models.length === 0) {
    return { valid: false, issues: ['Fallback chain must be a non-empty array of model names'] };
  }

  // ── Duplicate check ──
  const seen = new Set();
  const duplicates = [];
  for (const m of models) {
    if (seen.has(m)) {
      duplicates.push(m);
    }
    seen.add(m);
  }
  if (duplicates.length > 0) {
    issues.push(`Duplicate models in chain: ${[...new Set(duplicates)].join(', ')}`);
  }

  // ── Anthropic-first check ──
  let lastAnthropicIdx = -1;
  let firstNonAnthropicIdx = -1;

  for (let i = 0; i < models.length; i++) {
    const isAnthropic = models[i].startsWith('anthropic/');
    if (isAnthropic) {
      lastAnthropicIdx = i;
    } else if (firstNonAnthropicIdx === -1) {
      firstNonAnthropicIdx = i;
    }
  }

  if (firstNonAnthropicIdx !== -1 && lastAnthropicIdx > firstNonAnthropicIdx) {
    issues.push(
      `Anthropic models must come before non-Anthropic models. Found Anthropic model at index ${lastAnthropicIdx} after non-Anthropic at index ${firstNonAnthropicIdx}.`
    );
  }

  // ── Anthropic internal ordering: Opus (tier 0) → Sonnet (tier 1-2) → Haiku (tier 3) ──
  const anthropicModels = models.filter((m) => m.startsWith('anthropic/'));
  let prevTier = -1;
  for (const m of anthropicModels) {
    const info = KNOWN_MODELS.get(m);
    if (info) {
      if (info.tier < prevTier) {
        issues.push(
          `Anthropic ordering violation: "${m}" (tier ${info.tier}) appears after a higher-tier model (tier ${prevTier}). Expected order: Opus → Sonnet → Haiku.`
        );
      }
      prevTier = info.tier;
    }
  }

  // ── Build suggested order ──
  const knownInChain = models.filter((m) => KNOWN_MODELS.has(m));
  const unknownInChain = models.filter((m) => !KNOWN_MODELS.has(m));

  const sortedKnown = [...new Set(knownInChain)].sort((a, b) => {
    const infoA = KNOWN_MODELS.get(a);
    const infoB = KNOWN_MODELS.get(b);
    // Anthropic first (tier < 10), then others
    return infoA.tier - infoB.tier;
  });

  const suggestedOrder = [...sortedKnown, ...unknownInChain];

  return {
    valid: issues.length === 0,
    issues,
    suggestedOrder: issues.length > 0 ? suggestedOrder : undefined,
  };
}

/**
 * Get metadata for a known model.
 * @param {string} name
 * @returns {object|null}
 */
function getModelInfo(name) {
  return KNOWN_MODELS.get(name) || null;
}

/**
 * List all known models, optionally filtered by provider.
 * @param {string} [provider]
 * @returns {string[]}
 */
function listKnownModels(provider) {
  if (provider) {
    return [...KNOWN_MODELS.keys()].filter((k) => k.startsWith(provider + '/'));
  }
  return [...KNOWN_MODELS.keys()];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Simple character-level distance for fuzzy matching. */
function simpleDistance(a, b) {
  if (a === b) return 0;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return shorter.length;

  const costs = [];
  for (let i = 0; i <= longer.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= shorter.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (longer[i - 1] !== shorter[j - 1]) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[shorter.length] = lastValue;
  }
  return costs[shorter.length];
}

module.exports = {
  validateModelName,
  validateModelExists,
  validateChainOrder,
  getModelInfo,
  listKnownModels,
  KNOWN_MODELS,
  VALID_PROVIDERS,
};
