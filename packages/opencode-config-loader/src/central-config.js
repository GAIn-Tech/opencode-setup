'use strict';

const fs = require('fs');

/**
 * Load and validate central-config.json.
 * Reads JSON file, validates required fields, returns parsed object.
 * No external validation libraries — manual field checking only.
 *
 * @param {string} filePath - Path to central-config.json
 * @returns {object} Parsed and validated config
 * @throws {Error} If file unreadable or required fields missing
 */
function loadCentralConfig(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read config file at ${filePath}: ${err.message}`);
  }

  let config;
  try {
    config = JSON.parse(content);
  } catch (err) {
    throw new Error(`Invalid JSON in ${filePath}: ${err.message}`);
  }

  // Validate required top-level fields
  const missing = [];
  if (!('schema_version' in config)) missing.push('schema_version');
  if (!('config_version' in config)) missing.push('config_version');
  if (!('sections' in config)) missing.push('sections');

  if (!config.rl || typeof config.rl !== 'object') {
    missing.push('rl');
  } else if (!('override_min_confidence' in config.rl)) {
    missing.push('rl.override_min_confidence');
  }

  if (missing.length > 0) {
    throw new Error(
      `Central config validation failed — missing required field(s): ${missing.join(', ')}`
    );
  }

  return config;
}

/**
 * Clamp a numeric value within hard bounds.
 * Non-numeric values pass through unchanged.
 *
 * @param {*} value
 * @param {object|null} hard - { min, max } or null
 * @returns {*} Clamped value
 */
function clampToHardBounds(value, hard) {
  if (!hard || typeof value !== 'number') return value;
  let v = value;
  if (hard.min !== undefined && v < hard.min) v = hard.min;
  if (hard.max !== undefined && v > hard.max) v = hard.max;
  return v;
}

/**
 * Pure merge function: central-config values → RL overrides → hard clamp.
 *
 * @param {object} opts
 *   - defaults  {object}  Plain key-value fallback defaults (reserved for future use)
 *   - central   {object}  Full central-config.json object (with rl + sections)
 *   - rlState   {object}  RL-proposed values keyed by "section.key" → { value, confidence }
 * @returns {{ effective, diff, metadata }}
 *   - effective  {object}  Nested section → key → final value
 *   - diff       {Array}   Array of { path, from, to, reason } for each change from central value
 *   - metadata   {object}  { merged_at, rl_applied_count, locked_count }
 */
function mergeCentralConfig({ defaults = {}, central, rlState = {} }) {
  if (!central || !central.sections) {
    throw new Error('Invalid central config: missing sections');
  }

  const threshold = (central.rl && central.rl.override_min_confidence) || 0.85;
  const effective = {};
  const diff = [];
  let rlApplied = 0;
  let lockedCount = 0;

  for (const [sectionName, section] of Object.entries(central.sections)) {
    effective[sectionName] = {};

    for (const [paramName, param] of Object.entries(section)) {
      const centralValue = param.value;
      const rlKey = `${sectionName}.${paramName}`;
      const rlEntry = rlState[rlKey];
      let finalValue = centralValue;
      let reason = null;

      // Count locked fields
      if (param.locked) {
        lockedCount++;
      }

      // Attempt RL override
      if (
        rlEntry !== undefined &&
        param.rl_allowed &&
        !param.locked &&
        rlEntry.confidence >= threshold
      ) {
        finalValue = rlEntry.value;
        reason = 'rl_override';
        rlApplied++;
      }

      // Clamp within hard bounds (applies to both RL and dashboard values)
      const clamped = clampToHardBounds(finalValue, param.hard);
      if (clamped !== finalValue) {
        reason = reason ? `${reason}+hard_clamp` : 'hard_clamp';
        finalValue = clamped;
      }

      // Also clamp the original dashboard value for comparison
      const clampedCentral = clampToHardBounds(centralValue, param.hard);

      effective[sectionName][paramName] = finalValue;

      // Record diff if effective differs from (clamped) central value
      if (finalValue !== clampedCentral) {
        diff.push({
          path: rlKey,
          from: centralValue,
          to: finalValue,
          reason: reason || 'unknown',
        });
      }
    }
  }

  return {
    effective,
    diff,
    metadata: {
      merged_at: new Date().toISOString(),
      rl_applied_count: rlApplied,
      locked_count: lockedCount,
    },
  };
}

module.exports = {
  loadCentralConfig,
  mergeCentralConfig,
  clampToHardBounds,
};
