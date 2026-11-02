/**
 * MetaInstructionParser - Extracts orchestration directives from user prompts
 *
 * Allows users to control execution parameters without invoking commands.
 * Directives can be embedded in prompts using structured syntax.
 *
 * Supported formats:
 * - [meta: swarm=3 depth=2 parallel=true]
 * - // meta: swarm=3, depth=2
 * - :::meta swarm=3; depth=2; parallel=true
 * - "meta:" prefix in JSON-like structure
 *
 * Supported parameters:
 * - swarm: number of parallel agents (1-10)
 * - depth: multi-step execution depth (1-5)
 * - parallel: enable parallel execution (true/false)
 * - timeout: execution timeout in seconds (30-600)
 * - retry: max retry attempts (0-5)
 * - model: force specific model/provider
 * - agent: force specific agent type
 * - skills: comma-separated skill list
 * - priority: task priority (low/normal/high/critical)
 * - budget: context budget in tokens (1000-100000)
 */

class MetaInstructionParser {
  constructor(config = {}) {
    this.config = {
      maxSwarm: config.maxSwarm || 10,
      maxDepth: config.maxDepth || 5,
      maxTimeout: config.maxTimeout || 600,
      maxRetry: config.maxRetry || 5,
      maxBudget: config.maxBudget || 100000,
      ...config
    };

    // Regex patterns for different directive formats
    this.patterns = [
      // [meta: key=value key=value]
      /\[meta:\s*([^\]]+)\]/gi,
      // // meta: key=value
      /\/\/\s*meta:\s*([^\n]+)/gi,
      // :::meta key=value
      /:::meta\s+([^\n]+)/gi,
      // { meta: { key: value } } JSON style
      /\{\s*meta:\s*\{([^}]+)\}\s*\}/gi,
      // meta:: key=value (prefixed)
      /^meta::\s*(.+)$/gim,
    ];
  }

  /**
   * Parse a user prompt for embedded meta-instructions
   * @param {string} prompt - User input prompt
   * @returns {Object} Parsed execution config
   */
  parse(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      return this.getDefaultConfig();
    }

    const extractedParams = {};
    let foundAny = false;

    for (const pattern of this.patterns) {
      const matches = [...prompt.matchAll(pattern)];
      
      for (const match of matches) {
        const content = match[1] || match[0];
        const parsed = this.parseContent(content);
        
        for (const [key, value] of Object.entries(parsed)) {
          if (value !== undefined && value !== null) {
            extractedParams[key] = value;
            foundAny = true;
          }
        }
      }
    }

    if (!foundAny) {
      return this.getDefaultConfig();
    }

    return this.normalizeAndValidate(extractedParams);
  }

  /**
   * Parse key=value pairs from content
   */
  parseContent(content) {
    const result = {};
    
    // Handle both comma and space separators
    const pairs = content.split(/[,\n]+/).map(s => s.trim()).filter(Boolean);
    
    for (const pair of pairs) {
      // Split on = or :
      const separator = pair.includes('=') ? '=' : ':';
      const [key, ...valueParts] = pair.split(separator);
      
      if (key) {
        const normalizedKey = key.trim().toLowerCase();
        const rawValue = valueParts.join(separator).trim();
        result[normalizedKey] = this.parseValue(normalizedKey, rawValue);
      }
    }
    
    return result;
  }

  /**
   * Parse value based on parameter type
   */
  parseValue(key, rawValue) {
    if (rawValue === undefined || rawValue === '') {
      return undefined;
    }

    // Handle boolean values
    if (['true', 'false', 'yes', 'no', 'on', 'off'].includes(rawValue.toLowerCase())) {
      return ['true', 'yes', 'on'].includes(rawValue.toLowerCase());
    }

    // Handle numeric values
    if (['swarm', 'depth', 'timeout', 'retry', 'budget', 'priority'].includes(key)) {
      const num = parseInt(rawValue, 10);
      if (!isNaN(num)) {
        return num;
      }
    }

    // Handle arrays (comma-separated)
    if (key === 'skills' || key === 'agents') {
      return rawValue.split(',').map(s => s.trim()).filter(Boolean);
    }

    // Handle priority enum
    if (key === 'priority') {
      const valid = ['low', 'normal', 'high', 'critical'];
      if (valid.includes(rawValue.toLowerCase())) {
        return rawValue.toLowerCase();
      }
    }

    // Return as string for other values
    return rawValue;
  }

  /**
   * Normalize and validate parameters against config limits
   */
  normalizeAndValidate(params) {
    const validated = {};
    const defaults = this.getDefaultConfig();

    // Swarm size
    if (params.swarm !== undefined) {
      validated.swarm = Math.max(1, Math.min(this.config.maxSwarm, params.swarm));
    } else {
      validated.swarm = defaults.swarm;
    }

    // Execution depth
    if (params.depth !== undefined) {
      validated.depth = Math.max(1, Math.min(this.config.maxDepth, params.depth));
    } else {
      validated.depth = defaults.depth;
    }

    // Parallel execution
    if (params.parallel !== undefined) {
      validated.parallel = params.parallel;
    } else {
      validated.parallel = defaults.parallel;
    }

    // Timeout
    if (params.timeout !== undefined) {
      validated.timeout = Math.max(30, Math.min(this.config.maxTimeout, params.timeout));
    } else {
      validated.timeout = defaults.timeout;
    }

    // Retry attempts
    if (params.retry !== undefined) {
      validated.retry = Math.max(0, Math.min(this.config.maxRetry, params.retry));
    } else {
      validated.retry = defaults.retry;
    }

    // Context budget
    if (params.budget !== undefined) {
      validated.budget = Math.max(1000, Math.min(this.config.maxBudget, params.budget));
    } else {
      validated.budget = defaults.budget;
    }

    // String parameters (no validation needed)
    if (params.model) validated.model = params.model;
    if (params.agent) validated.agent = params.agent;
    if (params.provider) validated.provider = params.provider;
    if (params.priority) validated.priority = params.priority;
    if (params.skills) validated.skills = Array.isArray(params.skills) ? params.skills : [params.skills];
    if (params.agents) validated.agents = Array.isArray(params.agents) ? params.agents : [params.agents];

    // Add metadata
    validated._meta = {
      parsed: true,
      original: params,
      timestamp: new Date().toISOString()
    };

    return validated;
  }

  /**
   * Get default configuration
   */
  getDefaultConfig() {
    return {
      swarm: 1,
      depth: 1,
      parallel: false,
      timeout: 120,
      retry: 0,
      budget: 50000,
      priority: 'normal',
      _meta: {
        parsed: false,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Check if a prompt contains meta-instructions
   */
  hasMetaInstructions(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      return false;
    }

    for (const pattern of this.patterns) {
      if (pattern.test(prompt)) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Extract and remove meta-instructions from prompt
   * Returns { config, cleanPrompt }
   */
  extract(prompt) {
    const config = this.parse(prompt);
    
    let cleanPrompt = prompt;
    for (const pattern of this.patterns) {
      cleanPrompt = cleanPrompt.replace(pattern, '');
    }
    
    // Clean up extra whitespace
    cleanPrompt = cleanPrompt.replace(/\n{3,}/g, '\n\n').trim();
    
    return { config, cleanPrompt };
  }
}

/**
 * ExecutionConfigAdapter - Applies parsed meta-config to execution behavior
 *
 * Transforms parsed meta-instructions into execution parameters
 * that can be passed to agents, subagents, and workflow executors.
 */
class ExecutionConfigAdapter {
  constructor(parser = null) {
    this.parser = parser || new MetaInstructionParser();
  }

  /**
   * Adapt meta-config to agent execution parameters
   */
  adaptToAgentParams(config) {
    const params = {
      // Timeout settings
      timeout: config.timeout * 1000, // Convert to ms
      executionTimeout: config.timeout * 1000,
      
      // Retry configuration
      maxRetries: config.retry,
      retryEnabled: config.retry > 0,
      
      // Context budget
      maxTokens: config.budget,
      contextBudget: config.budget,
      
      // Priority
      priority: this.mapPriority(config.priority),
      
      // Model override (if specified)
      ...(config.model && { preferredModel: config.model }),
      ...(config.provider && { preferredProvider: config.provider }),
    };
    
    return params;
  }

  /**
   * Adapt meta-config to subagent/worker configuration
   */
  adaptToSubagentConfig(config) {
    return {
      // Swarm configuration
      swarmSize: config.swarm,
      useSwarm: config.swarm > 1,
      
      // Execution depth
      maxDepth: config.depth,
      
      // Parallel execution
      parallelExecution: config.parallel,
      
      // Override skills if specified
      ...(config.skills && { requiredSkills: config.skills }),
      ...(config.agents && { agentTypes: config.agents }),
    };
  }

  /**
   * Adapt meta-config to workflow step configuration
   */
  adaptToWorkflowConfig(config) {
    return {
      // Parallel step execution
      parallel: config.parallel || config.swarm > 1,
      
      // Step retry
      retry: config.retry,
      
      // Step timeout
      timeout: config.timeout,
      
      // Budget allocation per step
      budgetPerStep: Math.floor(config.budget / (config.depth || 1)),
      
      // Priority boost
      priorityBoost: this.getPriorityBoost(config.priority),
    };
  }

  /**
   * Map priority string to numeric value
   */
  mapPriority(priority) {
    const mapping = {
      'low': 1,
      'normal': 5,
      'high': 8,
      'critical': 10
    };
    return mapping[priority] || 5;
  }

  /**
   * Get priority boost multiplier
   */
  getPriorityBoost(priority) {
    const boosts = {
      'low': 0.5,
      'normal': 1.0,
      'high': 1.5,
      'critical': 2.0
    };
    return boosts[priority] || 1.0;
  }

  /**
   * Full adaptation: parse prompt and return all adapted configs
   */
  fullAdapt(prompt) {
    const extracted = this.parser.extract(prompt);
    
    return {
      original: prompt,
      cleanPrompt: extracted.cleanPrompt,
      rawConfig: extracted.config,
      agentParams: this.adaptToAgentParams(extracted.config),
      subagentConfig: this.adaptToSubagentConfig(extracted.config),
      workflowConfig: this.adaptToWorkflowConfig(extracted.config),
      hasMeta: extracted.config._meta?.parsed || false
    };
  }
}

module.exports = {
  MetaInstructionParser,
  ExecutionConfigAdapter
};
