'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Minimal JSON Schema validator for draft-07
 * Validates central-config structure
 */
function validateSchema(config, schema) {
  const errors = [];

  // Check required properties
  if (schema.required) {
    for (const prop of schema.required) {
      if (!(prop in config)) {
        errors.push(`Missing required property: ${prop}`);
      }
    }
  }

  // Check schema_version format
  if (config.schema_version && !/^\d+\.\d+\.\d+$/.test(config.schema_version)) {
    errors.push(`Invalid schema_version format: ${config.schema_version}`);
  }

  // Check config_version is integer
  if (typeof config.config_version !== 'number' || config.config_version < 1) {
    errors.push(`Invalid config_version: must be integer >= 1`);
  }

  // Check rl.override_min_confidence
  if (config.rl) {
    if (!('override_min_confidence' in config.rl)) {
      errors.push(`Missing rl.override_min_confidence`);
    } else {
      const val = config.rl.override_min_confidence;
      if (typeof val !== 'number' || val < 0.5 || val > 0.99) {
        errors.push(`Invalid rl.override_min_confidence: must be 0.5-0.99, got ${val}`);
      }
    }
  }

  // Check sections structure
  if (config.sections && typeof config.sections === 'object') {
    for (const [sectionName, section] of Object.entries(config.sections)) {
      if (typeof section !== 'object' || Array.isArray(section)) {
        errors.push(`Section ${sectionName} must be an object`);
        continue;
      }

      for (const [paramName, param] of Object.entries(section)) {
        if (typeof param !== 'object' || Array.isArray(param)) {
          errors.push(`Parameter ${sectionName}.${paramName} must be an object`);
          continue;
        }

        // Check required fields
        if (!('value' in param)) {
          errors.push(`Missing value in ${sectionName}.${paramName}`);
        }
        if (!('locked' in param) || typeof param.locked !== 'boolean') {
          errors.push(`Invalid locked in ${sectionName}.${paramName}`);
        }
        if (!('rl_allowed' in param) || typeof param.rl_allowed !== 'boolean') {
          errors.push(`Invalid rl_allowed in ${sectionName}.${paramName}`);
        }
      }
    }
  }

  return errors;
}

/**
 * Load and validate central-config.json
 * @param {string} configPath - Path to central-config.json
 * @returns {object} Loaded and validated config
 * @throws {Error} If validation fails
 */
function loadCentralConfig(configPath) {
  if (!configPath) {
    // Try default locations
    const defaultPaths = [
      path.join(process.cwd(), 'opencode-config', 'central-config.json'),
      path.join(__dirname, '../../..', 'opencode-config', 'central-config.json'),
    ];

    for (const p of defaultPaths) {
      if (fs.existsSync(p)) {
        configPath = p;
        break;
      }
    }

    if (!configPath) {
      throw new Error('central-config.json not found in default locations');
    }
  }

  if (!fs.existsSync(configPath)) {
    throw new Error(`central-config.json not found at ${configPath}`);
  }

  let config;
  try {
    const content = fs.readFileSync(configPath, 'utf8');
    config = JSON.parse(content);
  } catch (err) {
    throw new Error(`Failed to parse central-config.json: ${err.message}`);
  }

  // Load schema
  const schemaPath = path.join(path.dirname(configPath), 'central-config.schema.json');
  let schema;
  try {
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    schema = JSON.parse(schemaContent);
  } catch (err) {
    throw new Error(`Failed to load schema: ${err.message}`);
  }

  // Validate
  const errors = validateSchema(config, schema);
  if (errors.length > 0) {
    throw new Error(`Schema validation failed:\n${errors.join('\n')}`);
  }

  return config;
}

/**
 * Clamp a value to hard bounds
 * @param {*} value - Value to clamp
 * @param {object} hard - Hard bounds {min, max}
 * @returns {*} Clamped value
 */
function clampToHardBounds(value, hard) {
  if (!hard || (hard.min === undefined && hard.max === undefined)) {
    return value;
  }

  if (typeof value !== 'number') {
    return value;
  }

  let clamped = value;
  if (hard.min !== undefined && clamped < hard.min) {
    clamped = hard.min;
  }
  if (hard.max !== undefined && clamped > hard.max) {
    clamped = hard.max;
  }

  return clamped;
}

/**
 * Get effective value for a single parameter
 * Implements: defaults → central-config → RL state → hard clamp
 * 
 * @param {*} dashboardValue - Value from central-config (dashboard)
 * @param {object} param - Parameter metadata {soft, hard, locked, rl_allowed}
 * @param {*} rlValue - Value from RL state (if any)
 * @param {number} rlConfidence - Confidence of RL value (0-1)
 * @param {number} globalConfidence - Global override_min_confidence threshold
 * @returns {object} {effective, diff, metadata}
 */
function getEffectiveValue(dashboardValue, param, rlValue, rlConfidence, globalConfidence) {
  let effective = dashboardValue;
  let source = 'dashboard';
  let applied = false;

  // Check if RL override should be applied
  if (
    rlValue !== undefined &&
    param.rl_allowed &&
    !param.locked &&
    rlConfidence >= globalConfidence
  ) {
    // Apply RL value but clamp to soft bounds first
    let rlClamped = rlValue;
    if (param.soft && typeof rlValue === 'number') {
      if (param.soft.min !== undefined && rlClamped < param.soft.min) {
        rlClamped = param.soft.min;
      }
      if (param.soft.max !== undefined && rlClamped > param.soft.max) {
        rlClamped = param.soft.max;
      }
    }
    effective = rlClamped;
    source = 'rl';
    applied = true;
  } else {
    // Dashboard value: clamp to soft bounds if available
    if (param.soft && typeof dashboardValue === 'number') {
      if (param.soft.min !== undefined && effective < param.soft.min) {
        effective = param.soft.min;
      }
      if (param.soft.max !== undefined && effective > param.soft.max) {
        effective = param.soft.max;
      }
    }
  }

  // Always clamp to hard bounds
  const finalValue = clampToHardBounds(effective, param.hard);
  const hardClamped = finalValue !== effective;

  return {
    effective: finalValue,
    diff: finalValue !== dashboardValue,
    metadata: {
      source,
      applied,
      hardClamped,
      rlConfidence: rlConfidence || 0,
      dashboardValue,
      rlValue: rlValue !== undefined ? rlValue : null,
    },
  };
}

/**
 * Pure merge function: defaults → central-config → RL state → hard clamp
 * 
 * @param {object} options
 *   - defaults: Default values (not used in this implementation, for future)
 *   - central: Central config object (from loadCentralConfig)
 *   - rlState: RL state object {section.param: {value, confidence}}
 *   - globalConfidence: Global override_min_confidence (from central.rl.override_min_confidence)
 * @returns {object} Merged config with effective values
 */
function mergeCentralConfig({ defaults = {}, central, rlState = {}, globalConfidence = 0.85 }) {
  if (!central || !central.sections) {
    throw new Error('Invalid central config: missing sections');
  }

  const result = {
    schema_version: central.schema_version,
    config_version: central.config_version,
    rl: central.rl,
    sections: {},
  };

  // Process each section and parameter
  for (const [sectionName, section] of Object.entries(central.sections)) {
    result.sections[sectionName] = {};

    for (const [paramName, param] of Object.entries(section)) {
      const dashboardValue = param.value;

      // Look for RL override
      const rlKey = `${sectionName}.${paramName}`;
      const rlOverride = rlState[rlKey];
      const rlValue = rlOverride ? rlOverride.value : undefined;
      const rlConfidence = rlOverride ? rlOverride.confidence : 0;

      // Get effective value
      const { effective, diff, metadata } = getEffectiveValue(
        dashboardValue,
        param,
        rlValue,
        rlConfidence,
        globalConfidence
      );

      result.sections[sectionName][paramName] = {
        value: effective,
        diff,
        metadata,
        // Preserve original metadata
        locked: param.locked,
        rl_allowed: param.rl_allowed,
        soft: param.soft,
        hard: param.hard,
      };
    }
  }

  return result;
}

module.exports = {
  loadCentralConfig,
  mergeCentralConfig,
  getEffectiveValue,
  clampToHardBounds,
  validateSchema,
};
