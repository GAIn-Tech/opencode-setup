/**
 * Default provider quota configurations
 * These can be overridden via environment variables or config files
 */
const defaultProviderQuotas = {
    anthropic: {
        providerId: 'anthropic',
        quotaType: 'monthly',
        quotaLimit: 1000000,  // 1M tokens
        quotaPeriod: 'month',
        warningThreshold: 0.8,
        criticalThreshold: 0.95
    },
    openai: {
        providerId: 'openai',
        quotaType: 'monthly',
        quotaLimit: 1000000,  // 1M tokens
        quotaPeriod: 'month',
        warningThreshold: 0.8,
        criticalThreshold: 0.95
    },
    google: {
        providerId: 'google',
        quotaType: 'monthly',
        quotaLimit: 1000000,  // 1M tokens
        quotaPeriod: 'month',
        warningThreshold: 0.8,
        criticalThreshold: 0.95
    },
    cerebras: {
        providerId: 'cerebras',
        quotaType: 'request-based',
        quotaLimit: 10000,    // 10K requests
        quotaPeriod: null,
        warningThreshold: 0.8,
        criticalThreshold: 0.95
    },
    'antigravity': {
        providerId: 'antigravity',
        quotaType: 'request-based',
        quotaLimit: 5000,     // 5K requests
        quotaPeriod: null,
        warningThreshold: 0.7,
        criticalThreshold: 0.9
    }
};

/**
 * Model-to-provider mapping
 */
const modelProviderMap = {
    // Anthropic models
    'claude-3-opus': 'anthropic',
    'claude-3-sonnet': 'anthropic',
    'claude-3-haiku': 'anthropic',
    'claude-3-5-sonnet': 'anthropic',
    
    // OpenAI models
    'gpt-4': 'openai',
    'gpt-4-turbo': 'openai',
    'gpt-4o': 'openai',
    'gpt-3.5-turbo': 'openai',
    
    // Google models
    'gemini-pro': 'google',
    'gemini-ultra': 'google',
    
    // Cerebras models
    "llama-3.3-70b-versatile": 'cerebras',
    "llama-3.3-70b-versatile": 'cerebras'
};

/**
 * Load provider quotas from environment or config
 */
function loadProviderQuotas(customConfig = {}) {
    const quotas = {};
    
    for (const [providerId, defaults] of Object.entries(defaultProviderQuotas)) {
        const envPrefix = `QUOTA_${providerId.toUpperCase()}_`;
        
        quotas[providerId] = {
            ...defaults,
            ...customConfig[providerId],
            quotaLimit: parseInt(process.env[`${envPrefix}LIMIT`]) || 
                       customConfig[providerId]?.quotaLimit || 
                       defaults.quotaLimit,
            warningThreshold: parseFloat(process.env[`${envPrefix}WARNING`]) || 
                             customConfig[providerId]?.warningThreshold || 
                             defaults.warningThreshold,
            criticalThreshold: parseFloat(process.env[`${envPrefix}CRITICAL`]) || 
                              customConfig[providerId]?.criticalThreshold || 
                              defaults.criticalThreshold
        };
    }
    
    return quotas;
}

/**
 * Get provider for a given model
 */
function getProviderForModel(modelId) {
    return modelProviderMap[modelId] || 'unknown';
}

module.exports = {
    defaultProviderQuotas,
    modelProviderMap,
    loadProviderQuotas,
    getProviderForModel
};
