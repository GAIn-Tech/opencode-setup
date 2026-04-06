'use strict';

/**
 * opencode-runtime-authority
 * 
 * Single source of truth for runtime agent/category/model resolution.
 * Provides provenance tracking so every resolution can explain where it came from.
 * 
 * Precedence chain (highest to lowest):
 * 1. Environment variables (OPENCODE_AGENT_{NAME}_MODEL, OPENCODE_CATEGORY_{NAME}_MODEL)
 * 2. Home config (~/.config/opencode/oh-my-opencode.json)
 * 3. Repo config (opencode-config/oh-my-opencode.json)
 * 4. Defaults (hardcoded fallbacks)
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

// Source identifiers for provenance tracking
const SOURCES = {
  ENV_OVERRIDE: 'env-override',
  HOME_CONFIG: 'home-config',
  REPO_CONFIG: 'repo-config',
  DEFAULT: 'default',
  NOT_FOUND: 'not-found'
};

// Default fallback models when no config is available
const DEFAULT_AGENT_MODELS = {
  atlas: { modelId: 'kimi-k2.5', provider: 'moonshotai' },
  hephaestus: { modelId: 'gpt-5.3-codex', provider: 'openai' },
  librarian: { modelId: 'gemini-2.5-flash', provider: 'google' },
  metis: { modelId: 'gpt-5.2', provider: 'openai' },
  momus: { modelId: 'glm-5', provider: 'z-ai' },
  oracle: { modelId: 'gpt-5.3-codex', provider: 'openai' },
  prometheus: { modelId: 'kimi-k2.5', provider: 'moonshotai' },
  sisyphus: { modelId: 'gpt-5.3-codex', provider: 'openai' },
  explore: { modelId: 'gemini-2.5-flash', provider: 'google' },
  'multimodal-looker': { modelId: 'gemini-2.5-flash', provider: 'google' }
};

const DEFAULT_CATEGORY_MODELS = {
  'visual-engineering': { modelId: 'gpt-5.2', provider: 'openai' },
  'ultrabrain': { modelId: 'gpt-5.3-codex', provider: 'openai' },
  'deep': { modelId: 'glm-5', provider: 'z-ai' },
  'artistry': { modelId: 'gpt-5.2', provider: 'openai' },
  'quick': { modelId: 'gemini-2.5-flash', provider: 'google' },
  'unspecified-low': { modelId: 'kimi-k2.5', provider: 'moonshotai' },
  'unspecified-high': { modelId: 'gpt-5.3-codex', provider: 'openai' },
  'writing': { modelId: 'gemini-2.5-flash', provider: 'google' }
};

/**
 * Resolve the home directory config path
 */
function getHomeConfigPath() {
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  return path.join(home, '.config', 'opencode', 'oh-my-opencode.json');
}

/**
 * Resolve the repo config path
 */
function getRepoConfigPath() {
  // Try to find repo config relative to current working directory
  const cwd = process.cwd();
  const possiblePaths = [
    path.join(cwd, 'opencode-config', 'oh-my-opencode.json'),
    path.join(cwd, '..', 'opencode-config', 'oh-my-opencode.json'),
    path.join(__dirname, '..', '..', '..', 'opencode-config', 'oh-my-opencode.json')
  ];
  
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return path.join(cwd, 'opencode-config', 'oh-my-opencode.json');
}

/**
 * Safely read and parse a JSON config file
 */
function readConfigFile(configPath) {
  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    return null;
  }
}

/**
 * Normalize model ID by removing provider prefix if present
 */
function normalizeModelId(modelId) {
  if (!modelId || typeof modelId !== 'string') return modelId;
  // Remove provider prefix like "openai/", "google/", "nvidia/", etc.
  const parts = modelId.split('/');
  return parts.length > 1 ? parts[parts.length - 1] : modelId;
}

/**
 * Parse model string into modelId and provider
 * Handles formats like "openai/gpt-5.2" or just "gpt-5.2"
 */
function parseModelString(modelStr) {
  if (!modelStr || typeof modelStr !== 'string') {
    return { modelId: null, provider: null };
  }
  
  const parts = modelStr.split('/');
  if (parts.length === 1) {
    return { modelId: parts[0], provider: null };
  }
  
  return {
    provider: parts[0],
    modelId: parts.slice(1).join('/')
  };
}

/**
 * Get environment variable override for an agent
 */
function getEnvAgentOverride(agentName) {
  const envKey = `OPENCODE_AGENT_${agentName.toUpperCase().replace(/-/g, '_')}_MODEL`;
  const envValue = process.env[envKey];
  if (envValue) {
    const parsed = parseModelString(envValue);
    return {
      modelId: parsed.modelId,
      provider: parsed.provider,
      source: SOURCES.ENV_OVERRIDE,
      provenance: `env:${envKey}`
    };
  }
  return null;
}

/**
 * Get environment variable override for a category
 */
function getEnvCategoryOverride(category) {
  const envKey = `OPENCODE_CATEGORY_${category.toUpperCase().replace(/-/g, '_')}_MODEL`;
  const envValue = process.env[envKey];
  if (envValue) {
    const parsed = parseModelString(envValue);
    return {
      modelId: parsed.modelId,
      provider: parsed.provider,
      source: SOURCES.ENV_OVERRIDE,
      provenance: `env:${envKey}`
    };
  }
  return null;
}

/**
 * Resolve agent model from config
 */
function resolveAgentFromConfig(config, agentName) {
  if (!config || !config.agents) return null;
  
  const agentConfig = config.agents[agentName];
  if (!agentConfig || !agentConfig.model) return null;
  
  const parsed = parseModelString(agentConfig.model);
  return {
    modelId: parsed.modelId,
    provider: parsed.provider,
    source: null, // Will be set by caller
    provenance: null // Will be set by caller
  };
}

/**
 * Resolve category model from config
 */
function resolveCategoryFromConfig(config, category) {
  if (!config || !config.categories) return null;
  
  const categoryConfig = config.categories[category];
  if (!categoryConfig || !categoryConfig.model) return null;
  
  const parsed = parseModelString(categoryConfig.model);
  return {
    modelId: parsed.modelId,
    provider: parsed.provider,
    source: null, // Will be set by caller
    provenance: null // Will be set by caller
  };
}

/**
 * Resolve model for a named agent.
 * 
 * @param {string} agentName - The agent name (e.g., 'atlas', 'librarian')
 * @param {object} options - Optional overrides for testing
 * @param {string} options.repoConfigPath - Override repo config path
 * @param {string} options.homeConfigPath - Override home config path
 * @returns {object} Resolution result with modelId, provider, source, and provenance
 */
function resolveAgentModel(agentName, options = {}) {
  if (!agentName || typeof agentName !== 'string') {
    return {
      modelId: null,
      provider: null,
      source: SOURCES.NOT_FOUND,
      provenance: 'invalid-agent-name',
      error: 'Agent name must be a non-empty string'
    };
  }
  
  const normalizedName = agentName.toLowerCase().trim();
  
  // 1. Check environment variable override
  const envResult = getEnvAgentOverride(normalizedName);
  if (envResult) {
    return envResult;
  }
  
  // 2. Check home config
  const homeConfigPath = options.homeConfigPath || getHomeConfigPath();
  const homeConfig = readConfigFile(homeConfigPath);
  if (homeConfig) {
    const homeResult = resolveAgentFromConfig(homeConfig, normalizedName);
    if (homeResult) {
      homeResult.source = SOURCES.HOME_CONFIG;
      homeResult.provenance = `file:${homeConfigPath}:agents.${normalizedName}.model`;
      return homeResult;
    }
  }
  
  // 3. Check repo config
  const repoConfigPath = options.repoConfigPath || getRepoConfigPath();
  const repoConfig = readConfigFile(repoConfigPath);
  if (repoConfig) {
    const repoResult = resolveAgentFromConfig(repoConfig, normalizedName);
    if (repoResult) {
      repoResult.source = SOURCES.REPO_CONFIG;
      repoResult.provenance = `file:${repoConfigPath}:agents.${normalizedName}.model`;
      return repoResult;
    }
  }
  
  // 4. Fall back to defaults
  const defaultModel = DEFAULT_AGENT_MODELS[normalizedName];
  if (defaultModel) {
    return {
      modelId: defaultModel.modelId,
      provider: defaultModel.provider,
      source: SOURCES.DEFAULT,
      provenance: `default:agents.${normalizedName}`
    };
  }
  
  // Agent not found
  return {
    modelId: null,
    provider: null,
    source: SOURCES.NOT_FOUND,
    provenance: `unknown-agent:${normalizedName}`,
    error: `No model configured for agent: ${normalizedName}`
  };
}

/**
 * Resolve model for a category (synchronous, config-based).
 * This is the backward-compatible version that existing callers use.
 * For Thompson Sampling routing, use resolveCategoryModelAsync() instead.
 * 
 * @param {string} category - The category name (e.g., 'deep', 'quick')
 * @param {object} options - Optional overrides for testing
 * @param {string} options.repoConfigPath - Override repo config path
 * @param {string} options.homeConfigPath - Override home config path
 * @returns {object} Resolution result with modelId, provider, source, and provenance
 */
function resolveCategoryModel(category, options = {}) {
  if (!category || typeof category !== 'string') {
    return {
      modelId: null,
      provider: null,
      source: SOURCES.NOT_FOUND,
      provenance: 'invalid-category-name',
      error: 'Category must be a non-empty string'
    };
  }
  
  const normalizedCategory = category.toLowerCase().trim();
  
  // 1. Check environment variable override
  const envResult = getEnvCategoryOverride(normalizedCategory);
  if (envResult) {
    return envResult;
  }
  
  // 2. Check home config
  const homeConfigPath = options.homeConfigPath || getHomeConfigPath();
  const homeConfig = readConfigFile(homeConfigPath);
  if (homeConfig) {
    const homeResult = resolveCategoryFromConfig(homeConfig, normalizedCategory);
    if (homeResult) {
      homeResult.source = SOURCES.HOME_CONFIG;
      homeResult.provenance = `file:${homeConfigPath}:categories.${normalizedCategory}.model`;
      return homeResult;
    }
  }
  
  // 3. Check repo config
  const repoConfigPath = options.repoConfigPath || getRepoConfigPath();
  const repoConfig = readConfigFile(repoConfigPath);
  if (repoConfig) {
    const repoResult = resolveCategoryFromConfig(repoConfig, normalizedCategory);
    if (repoResult) {
      repoResult.source = SOURCES.REPO_CONFIG;
      repoResult.provenance = `file:${repoConfigPath}:categories.${normalizedCategory}.model`;
      return repoResult;
    }
  }
  
  // 4. Fall back to defaults
  const defaultModel = DEFAULT_CATEGORY_MODELS[normalizedCategory];
  if (defaultModel) {
    return {
      modelId: defaultModel.modelId,
      provider: defaultModel.provider,
      source: SOURCES.DEFAULT,
      provenance: `default:categories.${normalizedCategory}`
    };
  }
  
  // Category not found
  return {
    modelId: null,
    provider: null,
    source: SOURCES.NOT_FOUND,
    provenance: `unknown-category:${normalizedCategory}`,
    error: `No model configured for category: ${normalizedCategory}`
  };
}

/**
 * Resolve model for a category with optional Thompson Sampling routing (async).
 * Use this when you have a ModelRouter instance and want dynamic model selection.
 * Falls back to config-based resolution if modelRouter is unavailable or fails.
 * 
 * @param {string} category - The category name (e.g., 'deep', 'quick')
 * @param {object} options - Optional overrides for testing
 * @param {string} options.repoConfigPath - Override repo config path
 * @param {string} options.homeConfigPath - Override home config path
 * @param {object} options.modelRouter - Optional ModelRouter instance for Thompson Sampling routing
 * @returns {Promise<object>} Resolution result with modelId, provider, source, and provenance
 */
async function resolveCategoryModelAsync(category, options = {}) {
  if (!category || typeof category !== 'string') {
    return {
      modelId: null,
      provider: null,
      source: SOURCES.NOT_FOUND,
      provenance: 'invalid-category-name',
      error: 'Category must be a non-empty string'
    };
  }
  
  const normalizedCategory = category.toLowerCase().trim();
  
  // 0. If ModelRouter is provided, try Thompson Sampling route first
  if (options.modelRouter && typeof options.modelRouter.routeAsync === 'function') {
    try {
      const routeResult = await options.modelRouter.routeAsync({ category: normalizedCategory });
      if (routeResult && routeResult.model) {
        return {
          modelId: routeResult.modelId || routeResult.model.id,
          provider: routeResult.model.provider,
          source: 'thompson-sampling',
          provenance: `thompson-sampling:category=${normalizedCategory}`,
          _routeResult: routeResult // Pass through full result for advanced consumers
        };
      }
    } catch (e) {
      // fail-open: fall through to config-based resolution
      console.warn(`[resolveCategoryModelAsync] Thompson Sampling route failed, falling back: ${e.message}`);
    }
  }
  
  // Fall back to synchronous config-based resolution
  return resolveCategoryModel(category, options);
}

/**
 * Get the effective configuration snapshot showing all resolved values.
 * Useful for debugging and governance checks. (Synchronous, config-based)
 * 
 * @param {object} options - Optional overrides for testing
 * @returns {object} Snapshot of all agent and category resolutions
 */
function getEffectiveConfig(options = {}) {
  const agents = {};
  const categories = {};
  
  // Resolve all known agents
  for (const agentName of Object.keys(DEFAULT_AGENT_MODELS)) {
    agents[agentName] = resolveAgentModel(agentName, options);
  }
  
  // Resolve all known categories (sync)
  for (const category of Object.keys(DEFAULT_CATEGORY_MODELS)) {
    categories[category] = resolveCategoryModel(category, options);
  }
  
  return {
    timestamp: new Date().toISOString(),
    homeConfigPath: options.homeConfigPath || getHomeConfigPath(),
    repoConfigPath: options.repoConfigPath || getRepoConfigPath(),
    agents,
    categories
  };
}

/**
 * Get the effective configuration snapshot with Thompson Sampling routing (async).
 * Uses resolveCategoryModelAsync for categories when modelRouter is provided.
 * 
 * @param {object} options - Optional overrides for testing
 * @returns {Promise<object>} Snapshot of all agent and category resolutions
 */
async function getEffectiveConfigAsync(options = {}) {
  const agents = {};
  const categories = {};
  
  // Resolve all known agents
  for (const agentName of Object.keys(DEFAULT_AGENT_MODELS)) {
    agents[agentName] = resolveAgentModel(agentName, options);
  }
  
  // Resolve all known categories (async for Thompson Sampling)
  for (const category of Object.keys(DEFAULT_CATEGORY_MODELS)) {
    categories[category] = await resolveCategoryModelAsync(category, options);
  }
  
  return {
    timestamp: new Date().toISOString(),
    homeConfigPath: options.homeConfigPath || getHomeConfigPath(),
    repoConfigPath: options.repoConfigPath || getRepoConfigPath(),
    agents,
    categories
  };
}

/**
 * Export the CATEGORY_TO_MODEL and AGENT_TO_MODEL maps in the format
 * expected by runtime-tool-telemetry.mjs for backwards compatibility. (Sync)
 */
function getTelemetryMaps(options = {}) {
  const categoryToModel = {};
  const agentToModel = {};
  
  for (const [category, resolution] of Object.entries(DEFAULT_CATEGORY_MODELS)) {
    const resolved = resolveCategoryModel(category, options);
    categoryToModel[category] = {
      modelId: resolved.modelId,
      provider: resolved.provider
    };
  }
  
  for (const [agentName, resolution] of Object.entries(DEFAULT_AGENT_MODELS)) {
    const resolved = resolveAgentModel(agentName, options);
    agentToModel[agentName] = {
      modelId: resolved.modelId,
      provider: resolved.provider
    };
  }
  
  return { CATEGORY_TO_MODEL: categoryToModel, AGENT_TO_MODEL: agentToModel };
}

/**
 * Export the CATEGORY_TO_MODEL and AGENT_TO_MODEL maps with Thompson Sampling (async).
 */
async function getTelemetryMapsAsync(options = {}) {
  const categoryToModel = {};
  const agentToModel = {};
  
  for (const [category, resolution] of Object.entries(DEFAULT_CATEGORY_MODELS)) {
    const resolved = await resolveCategoryModelAsync(category, options);
    categoryToModel[category] = {
      modelId: resolved.modelId,
      provider: resolved.provider
    };
  }
  
  for (const [agentName, resolution] of Object.entries(DEFAULT_AGENT_MODELS)) {
    const resolved = resolveAgentModel(agentName, options);
    agentToModel[agentName] = {
      modelId: resolved.modelId,
      provider: resolved.provider
    };
  }
  
  return { CATEGORY_TO_MODEL: categoryToModel, AGENT_TO_MODEL: agentToModel };
}

module.exports = {
  SOURCES,
  resolveAgentModel,
  resolveCategoryModel,
  getEffectiveConfig,
  getTelemetryMaps,
  getHomeConfigPath,
  getRepoConfigPath,
  DEFAULT_AGENT_MODELS,
  DEFAULT_CATEGORY_MODELS
};
