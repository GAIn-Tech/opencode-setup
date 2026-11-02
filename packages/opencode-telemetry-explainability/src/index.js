/**
 * Telemetry Explainability - Metadata and provenance for routing/delegation decisions
 *
 * Task 6: Harden telemetry/metadata for routing/delegation explainability
 *
 * This module provides:
 * - Validation of telemetry payload completeness
 * - Human-readable explanations for routing/delegation decisions
 * - Provenance formatting for authority chain tracking
 * - Minimum metadata requirements for critical paths
 *
 * CRITICAL: All routing/delegation events MUST include enough provenance
 * to explain why decisions happened. No silent fallback on critical seams.
 */

// ---------------------------------------------------------------------------
// METADATA REQUIREMENTS
// ---------------------------------------------------------------------------

/**
 * Required metadata fields by event type
 *
 * These fields are the MINIMUM required for explainability.
 * Missing fields indicate incomplete telemetry that cannot be traced.
 */
const METADATA_REQUIREMENTS = Object.freeze({
  routing: {
    required: [
      'model_id',           // Which model was selected
      'provider',           // Which provider serves the model
      'decision_reason',    // Why this model was chosen
      'authority_source'    // Where the decision came from (env_var, home_config, repo_config, default)
    ],
    recommended: [
      'category',           // Category that triggered routing (if applicable)
      'agent_name',         // Agent that triggered routing (if applicable)
      'provenance'          // Full provenance chain
    ]
  },
  delegation: {
    required: [
      'agent_name',         // Which agent was delegated to
      'category',           // Which category was used
      'model_id',           // Which model the agent will use
      'authority_source'    // Where the delegation config came from
    ],
    recommended: [
      'task_type',          // Type of task being delegated
      'file_path',          // File being worked on (if applicable)
      'provenance'          // Full provenance chain
    ]
  },
  tool_invocation: {
    required: [
      'tool_name',          // Which tool was invoked
      'tool_category',      // Category of tool (execution, file, search, etc.)
      'session_id'          // Which session invoked the tool
    ],
    recommended: [
      'agent_name',         // Which agent invoked the tool
      'model_id',           // Which model the agent was using
      'cost_estimate'       // Estimated cost of invocation
    ]
  }
});

/**
 * Provenance source types
 *
 * These match the authority resolver's precedence chain.
 */
const PROVENANCE_SOURCES = Object.freeze({
  ENV_VAR: 'env_var',           // Environment variable override
  HOME_CONFIG: 'home_config',   // ~/.config/opencode/*.json
  REPO_CONFIG: 'repo_config',   // ./opencode-config/*.json
  DEFAULT: 'default'            // Hardcoded default fallback
});

// ---------------------------------------------------------------------------
// VALIDATION FUNCTIONS
// ---------------------------------------------------------------------------

/**
 * Get required metadata fields for an event type
 *
 * @param {string} eventType - Event type (routing, delegation, tool_invocation)
 * @returns {string[]} Array of required field names
 */
function getRequiredMetadataFields(eventType) {
  const requirements = METADATA_REQUIREMENTS[eventType];
  if (!requirements) {
    return [];
  }
  return [...requirements.required];
}

/**
 * Validate a telemetry payload for completeness
 *
 * @param {object} payload - Telemetry payload to validate
 * @returns {{valid: boolean, missing: string[], warnings: string[]}}
 */
function validateTelemetryPayload(payload) {
  const result = {
    valid: true,
    missing: [],
    warnings: []
  };

  // Reject null/undefined/empty
  if (!payload || typeof payload !== 'object') {
    result.valid = false;
    result.missing.push('payload');
    return result;
  }

  // Check event_type
  const eventType = payload.event_type;
  if (!eventType || !METADATA_REQUIREMENTS[eventType]) {
    result.valid = false;
    result.missing.push('event_type');
    return result;
  }

  // Check required fields
  const requirements = METADATA_REQUIREMENTS[eventType];
  for (const field of requirements.required) {
    if (payload[field] === undefined || payload[field] === null) {
      result.valid = false;
      result.missing.push(field);
    }
  }

  // Check recommended fields (warnings, not errors)
  if (requirements.recommended) {
    for (const field of requirements.recommended) {
      if (payload[field] === undefined || payload[field] === null) {
        result.warnings.push(`Missing recommended field: ${field}`);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// EXPLANATION FUNCTIONS
// ---------------------------------------------------------------------------

/**
 * Generate human-readable explanation for a routing decision
 *
 * @param {object} decision - Routing decision object
 * @returns {string} Human-readable explanation
 */
function explainRoutingDecision(decision) {
  if (!decision) {
    return 'No routing decision provided';
  }

  const parts = [];

  // Model and provider
  if (decision.model_id) {
    parts.push(`Model: ${decision.model_id}`);
  }
  if (decision.provider) {
    parts.push(`Provider: ${decision.provider}`);
  }

  // Decision context
  if (decision.category) {
    parts.push(`Category: ${decision.category}`);
  }
  if (decision.agent_name) {
    parts.push(`Agent: ${decision.agent_name}`);
  }

  // Decision reason
  if (decision.decision_reason) {
    parts.push(`Reason: ${decision.decision_reason}`);
  }

  // Authority source
  if (decision.authority_source) {
    parts.push(`Authority: ${decision.authority_source}`);
  }

  // Provenance
  if (decision.provenance) {
    parts.push(formatProvenance(decision.provenance));
  }

  return parts.join(' | ');
}

/**
 * Generate human-readable explanation for a delegation decision
 *
 * @param {object} decision - Delegation decision object
 * @returns {string} Human-readable explanation
 */
function explainDelegationDecision(decision) {
  if (!decision) {
    return 'No delegation decision provided';
  }

  const parts = [];

  // Agent and category
  if (decision.agent_name) {
    parts.push(`Agent: ${decision.agent_name}`);
  }
  if (decision.category) {
    parts.push(`Category: ${decision.category}`);
  }

  // Model
  if (decision.model_id) {
    parts.push(`Model: ${decision.model_id}`);
  }

  // Task context
  if (decision.task_type) {
    parts.push(`Task: ${decision.task_type}`);
  }
  if (decision.file_path) {
    parts.push(`File: ${decision.file_path}`);
  }

  // Authority source
  if (decision.authority_source) {
    parts.push(`Authority: ${decision.authority_source}`);
  }

  // Provenance
  if (decision.provenance) {
    parts.push(formatProvenance(decision.provenance));
  }

  return parts.join(' | ');
}

/**
 * Format provenance information for display
 *
 * @param {object} provenance - Provenance object
 * @returns {string} Formatted provenance string
 */
function formatProvenance(provenance) {
  if (!provenance || typeof provenance !== 'object') {
    return 'No provenance';
  }

  const source = provenance.source || 'unknown';

  switch (source) {
    case PROVENANCE_SOURCES.ENV_VAR:
      return `From env_var: ${provenance.key || 'unknown'}`;

    case PROVENANCE_SOURCES.HOME_CONFIG:
      const homeFile = provenance.file || 'unknown';
      const homeKey = provenance.key || 'unknown';
      return `From home_config: ${homeFile} → ${homeKey}`;

    case PROVENANCE_SOURCES.REPO_CONFIG:
      const repoFile = provenance.file || 'unknown';
      const repoKey = provenance.key || 'unknown';
      return `From repo_config: ${repoFile} → ${repoKey}`;

    case PROVENANCE_SOURCES.DEFAULT:
      return `From default: ${provenance.reason || 'no config found'}`;

    default:
      return `From: ${source}`;
  }
}

// ---------------------------------------------------------------------------
// EXPORTS
// ---------------------------------------------------------------------------

export {
  METADATA_REQUIREMENTS,
  PROVENANCE_SOURCES,
  getRequiredMetadataFields,
  validateTelemetryPayload,
  explainRoutingDecision,
  explainDelegationDecision,
  formatProvenance
};
