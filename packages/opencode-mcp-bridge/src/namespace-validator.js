/**
 * Tool Namespacing Validator
 *
 * Validates tool names against the {service}_{resource}_{action} convention.
 *
 * @module opencode-tool-namespacing
 */

const path = require('path');
const fs = require('fs');

/**
 * Regex pattern for valid namespaced tool names.
 * Three or more lowercase snake_case segments: {service}_{resource}_{action}[_{subaction}]
 */
const NAMESPACE_PATTERN = /^[a-z][a-z0-9]*(_[a-z][a-z0-9]*){2,}$/;

/**
 * Validate a single tool name against the namespacing convention.
 *
 * @param {string} toolName - Tool name to validate
 * @param {object} [options]
 * @param {boolean} [options.allowLegacy] - Allow single-segment legacy names
 * @returns {{ valid: boolean, errors: string[], suggestion: string|null }}
 */
function validateToolName(toolName, options = {}) {
  const { allowLegacy = false } = options;
  const errors = [];
  let suggestion = null;

  if (!toolName || typeof toolName !== 'string') {
    return {
      valid: false,
      errors: ['Tool name must be a non-empty string'],
      suggestion: null
    };
  }

  // Allow legacy single-segment names during transition
  if (allowLegacy && !toolName.includes('_')) {
    return {
      valid: true,
      errors: [],
      suggestion: `Consider migrating "${toolName}" to {service}_{resource}_{action} format`
    };
  }

  if (NAMESPACE_PATTERN.test(toolName)) {
    return { valid: true, errors: [], suggestion: null };
  }

  // Generate suggestion
  suggestion = generateSuggestion(toolName);
  errors.push(`Tool name "${toolName}" does not follow {service}_{resource}_{action} convention`);

  return { valid: false, errors, suggestion };
}

/**
 * Validate multiple tool names.
 *
 * @param {string[]} toolNames - Array of tool names to validate
 * @param {object} [options]
 * @param {boolean} [options.allowLegacy] - Allow single-segment legacy names
 * @returns {{ valid: boolean, results: Array<{name: string, valid: boolean, errors: string[], suggestion: string|null}> }}
 */
function validateToolNames(toolNames, options = {}) {
  const results = toolNames.map(name => {
    const validation = validateToolName(name, options);
    return { name, ...validation };
  });

  const valid = results.every(r => r.valid);

  return { valid, results };
}

/**
 * Generate a namespaced suggestion for a non-compliant tool name.
 *
 * @param {string} toolName - Non-compliant tool name
 * @returns {string|null} Suggested namespaced name
 */
function generateSuggestion(toolName) {
  if (!toolName || typeof toolName !== 'string') return null;

  // If it's PascalCase like GotoDefinition → goto_definition (2 words) or GotoDefinitionFile → goto_definition_file (3 words)
  const pascalParts = toolName.match(/[A-Z][a-z0-9]*/g);
  if (pascalParts && pascalParts.length >= 2) {
    const lowerParts = pascalParts.map(s => s.toLowerCase());
    if (lowerParts.length >= 3) {
      return lowerParts.join('_');
    }
    // 2 words: add default service prefix
    return `unknown_${lowerParts.join('_')}`;
  }

  // If it has some underscores but wrong format
  const parts = toolName.split('_').filter(Boolean);
  if (parts.length === 1) {
    return `unknown_${toolName.toLowerCase()}_execute`;
  }
  if (parts.length === 2) {
    return `${parts[0].toLowerCase()}_${parts[1].toLowerCase()}_execute`;
  }
  if (parts.length >= 3) {
    return parts.slice(0, 3).map(p => p.toLowerCase()).join('_');
  }

  return null;
}

/**
 * Load namespacing config from file.
 *
 * @param {string} [configPath] - Path to tool-namespacing.json
 * @returns {object} Namespacing configuration
 */
function loadNamespacingConfig(configPath = null) {
  const defaultPath = path.resolve(__dirname, '../../../opencode-config/tool-namespacing.json');
  const filePath = configPath || defaultPath;

  if (!fs.existsSync(filePath)) {
    return {
      convention: '{service}_{resource}_{action}',
      validation: { pattern: NAMESPACE_PATTERN.source }
    };
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {
      convention: '{service}_{resource}_{action}',
      validation: { pattern: NAMESPACE_PATTERN.source }
    };
  }
}

module.exports = {
  validateToolName,
  validateToolNames,
  generateSuggestion,
  loadNamespacingConfig,
  NAMESPACE_PATTERN
};
