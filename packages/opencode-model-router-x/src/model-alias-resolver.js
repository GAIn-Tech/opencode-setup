'use strict';

/**
 * Model Alias Resolver
 * 
 * Redirects unstable/raw model IDs to preferred stable alternatives.
 * Primary use case: redirect raw Gemini models to antigravity versions.
 */

const MODEL_ALIASES = {
  // Raw Gemini → Antigravity Gemini
  'google/gemini-3-pro': 'antigravity/antigravity-gemini-3-pro',
  'google/gemini-3-flash': 'antigravity/antigravity-gemini-3-flash',
  'google/gemini-3-flash-8b': 'antigravity/antigravity-gemini-3-flash-8b',
  'gemini-3-pro': 'antigravity/antigravity-gemini-3-pro',
  'gemini-3-flash': 'antigravity/antigravity-gemini-3-flash',
  'gemini-3-flash-8b': 'antigravity/antigravity-gemini-3-flash-8b',
  
  // Legacy aliases
  'gemini-2.5-pro': 'antigravity/antigravity-gemini-3-pro',
  'gemini-2.5-flash': 'antigravity/antigravity-gemini-3-flash',
};

/**
 * Resolve model alias to preferred model ID
 * 
 * @param {string} modelId - Original model ID
 * @returns {string} - Resolved model ID (alias target or original)
 */
function resolveModelAlias(modelId) {
  if (!modelId) return modelId;
  return MODEL_ALIASES[modelId] || modelId;
}

/**
 * Check if a model has an alias
 * 
 * @param {string} modelId - Model ID to check
 * @returns {boolean} - True if model has an alias
 */
function hasAlias(modelId) {
  return modelId in MODEL_ALIASES;
}

/**
 * Get all aliases for a target model
 * 
 * @param {string} targetModelId - Target model ID
 * @returns {string[]} - Array of model IDs that alias to this target
 */
function getAliasesFor(targetModelId) {
  return Object.entries(MODEL_ALIASES)
    .filter(([_, target]) => target === targetModelId)
    .map(([alias]) => alias);
}

module.exports = {
  MODEL_ALIASES,
  resolveModelAlias,
  hasAlias,
  getAliasesFor,
};
