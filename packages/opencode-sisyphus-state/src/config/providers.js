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
        tokenLimitPerMinute: 200000,
        requestLimitPerMinute: 80,
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
    'claude-opus-4-6': 'anthropic',
    'claude-sonnet-4-5': 'anthropic',
    'claude-haiku-4-5': 'anthropic',

    // OpenAI models
    'gpt-4o': 'openai',
    'gpt-4o-mini': 'openai',
    'o1': 'openai',

    // Google models
    'gemini-2.0-pro': 'google',
    'gemini-2.0-flash': 'google',
    'antigravity-gemini-2.0-pro': 'google',
    'antigravity-gemini-2.0-flash': 'google',

    // Groq/NVIDIA/Cerebras
    'llama-3.3-70b': 'nvidia',
    'llama-3.3-70b-versatile': 'groq',
    'cerebras/llama-3.3-70b-versatile': 'cerebras',

    // DeepSeek
    'deepseek-chat': 'deepseek',
    'deepseek-coder': 'deepseek'
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
