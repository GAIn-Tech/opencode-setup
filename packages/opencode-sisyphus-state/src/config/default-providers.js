/**
 * Default provider configurations for quota tracking
 * Users can override these via their own config
 */
module.exports = {
  // Anthropic providers
  anthropic: {
    quotaType: 'request-based',  // Unlimited tokens, pay per request
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
    // For budget tracking, not hard limits
    defaultMonthlyBudget: null  // null = no budget limit
  },

  // OpenAI providers
  openai: {
    quotaType: 'request-based',
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
    defaultMonthlyBudget: null
  },

  // Google/Gemini
  google: {
    quotaType: 'monthly',
    quotaLimit: 1000000000,  // 1B tokens for free tier
    quotaPeriod: 'month',
    warningThreshold: 0.8,
    criticalThreshold: 0.95
  },

  // Grok/xAI
  grok: {
    quotaType: 'request-based',
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
    defaultMonthlyBudget: null
  },

  // Cohere
  cohere: {
    quotaType: 'monthly',
    quotaLimit: 1000000,  // 1M tokens
    quotaPeriod: 'month',
    warningThreshold: 0.75,  // More conservative
    criticalThreshold: 0.90
  },

  // Mistral
  mistral: {
    quotaType: 'monthly',
    quotaLimit: 5000000,  // 5M tokens
    quotaPeriod: 'month',
    warningThreshold: 0.8,
    criticalThreshold: 0.95
  },

  // Azure OpenAI
  azure: {
    quotaType: 'request-based',
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
    defaultMonthlyBudget: null
  },

  // Local/self-hosted (no quotas)
  local: {
    quotaType: 'request-based',
    warningThreshold: 1.0,  // Never warn
    criticalThreshold: 1.0,  // Never critical
    defaultMonthlyBudget: null
  },

  // NVIDIA (kimi-k2.5, glm4.7)
  nvidia: {
    quotaType: 'request-based',
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
    defaultMonthlyBudget: null
  },

  // Zen (kimi-k2.5-pro, glm5)
  zen: {
    quotaType: 'request-based',
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
    defaultMonthlyBudget: null
  },

  // MiniMax
  minimax: {
    quotaType: 'request-based',
    warningThreshold: 0.8,
    criticalThreshold: 0.95,
    defaultMonthlyBudget: null
  },

  // Antigravity (Google via Antigravity proxy)
  antigravity: {
    quotaType: 'request-based',
    quotaLimit: 5000,
    warningThreshold: 0.7,
    criticalThreshold: 0.9,
    defaultMonthlyBudget: null
  }
};
