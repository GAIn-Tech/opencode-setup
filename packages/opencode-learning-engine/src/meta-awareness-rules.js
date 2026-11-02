'use strict';

const DOMAIN_KEYS = {
  DELEGATION: 'delegation_compliance',
  TOOL_SELECTION: 'tool_selection_quality',
  VERIFICATION: 'verification_discipline',
  PHASE: 'phase_adherence',
  TODO: 'todo_management',
  COMMUNICATION: 'communication_style',
  DECOMPOSITION: 'task_decomposition_quality',
  SKILL_LOADING: 'skill_loading_appropriateness',
  RECOVERY: 'failure_recovery_quality',
};

// Hyper-parameter naming expects /^[a-z][a-z0-9_]*$/.
// Domain keys are metric identifiers; domain slugs are stable param suffixes.
const DOMAIN_SLUGS = Object.freeze({
  [DOMAIN_KEYS.DELEGATION]: 'delegation',
  [DOMAIN_KEYS.TOOL_SELECTION]: 'tool_selection',
  [DOMAIN_KEYS.VERIFICATION]: 'verification',
  [DOMAIN_KEYS.PHASE]: 'phase',
  [DOMAIN_KEYS.TODO]: 'todo',
  [DOMAIN_KEYS.COMMUNICATION]: 'communication',
  [DOMAIN_KEYS.DECOMPOSITION]: 'decomposition',
  [DOMAIN_KEYS.SKILL_LOADING]: 'skill_loading',
  [DOMAIN_KEYS.RECOVERY]: 'recovery',
});

const DOMAIN_WEIGHT_BOUNDS = Object.freeze({
  // Soft bounds are guidance; hard bounds are MUST NOT rules.
  soft: { min: 0.8, max: 2.0 },
  hard: { min: 0.5, max: 2.5 },
});

const DEFAULT_DOMAIN_WEIGHTS = {
  [DOMAIN_KEYS.DELEGATION]: 1.2,
  [DOMAIN_KEYS.TOOL_SELECTION]: 1.2,
  [DOMAIN_KEYS.VERIFICATION]: 1.5,
  [DOMAIN_KEYS.PHASE]: 1.1,
  [DOMAIN_KEYS.TODO]: 1.0,
  [DOMAIN_KEYS.COMMUNICATION]: 0.8,
  [DOMAIN_KEYS.DECOMPOSITION]: 1.3,
  [DOMAIN_KEYS.SKILL_LOADING]: 1.0,
  [DOMAIN_KEYS.RECOVERY]: 1.1,
};

function clampDomainWeight(value, fallback) {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  if (typeof num !== 'number' || !Number.isFinite(num)) return fallback;
  if (num < DOMAIN_WEIGHT_BOUNDS.hard.min) return DOMAIN_WEIGHT_BOUNDS.hard.min;
  if (num > DOMAIN_WEIGHT_BOUNDS.hard.max) return DOMAIN_WEIGHT_BOUNDS.hard.max;
  return num;
}

function normalizeWorkflowType(value) {
  if (typeof value !== 'string' || value.trim() === '') return 'general';
  let key = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  if (!key) key = 'general';
  if (!/^[a-z]/.test(key)) key = `t_${key}`;
  key = key.replace(/[^a-z0-9_]/g, '_');
  if (!/^[a-z][a-z0-9_]*$/.test(key)) return 'general';
  return key;
}

function buildDomainWeightHyperParameters({ workflowTypes = [] } = {}) {
  const uniqueWorkflows = Array.from(new Set((workflowTypes || [])
    .filter((w) => typeof w === 'string' && w.trim())
    .map(normalizeWorkflowType)));

  const params = [];
  for (const domainKey of Object.values(DOMAIN_KEYS)) {
    const slug = DOMAIN_SLUGS[domainKey] || normalizeWorkflowType(domainKey);
    const defaultWeight = clampDomainWeight(DEFAULT_DOMAIN_WEIGHTS[domainKey] ?? 1.0, 1.0);
    const base = {
      current_value: defaultWeight,
      learning_config: {
        adaptation_strategy: 'ema',
        triggers: {
          outcome_type: 'feedback',
          min_samples: 25,
          confidence_threshold: 0.85,
        },
        bounds: {
          soft: { ...DOMAIN_WEIGHT_BOUNDS.soft },
          hard: { ...DOMAIN_WEIGHT_BOUNDS.hard },
        },
        exploration_policy: {
          enabled: false,
          epsilon: 0,
          annealing_rate: 1,
        },
      },
      grouping: {
        group_by_task_type: false,
        group_by_complexity: false,
        aggregate_function: 'mean',
      },
      individual_tracking: {
        per_session: false,
        per_task: true,
      },
    };

    params.push({
      ...base,
      name: `domain_weight_${slug}`,
    });

    for (const wf of uniqueWorkflows) {
      params.push({
        ...base,
        name: `domain_weight_${slug}_${wf}`,
      });
    }
  }

  return params;
}

function complexityMultiplier(complexity) {
  const key = String(complexity || 'moderate').toLowerCase();
  if (key === 'trivial' || key === 'simple') return 0.7;
  if (key === 'complex' || key === 'extreme' || key === 'critical') return 1.25;
  return 1.0;
}

function addDelta(target, domain, delta, reason, event) {
  if (!target[domain]) {
    target[domain] = [];
  }
  target[domain].push({
    delta,
    reason,
    timestamp: event?.timestamp || new Date().toISOString(),
    event_type: event?.event_type || 'unknown',
  });
}

function evaluateMetaAwarenessEvent(event = {}, context = {}) {
  const deltas = {};
  const c = complexityMultiplier(event.complexity || context.complexity);
  const eventType = String(event.event_type || '').toLowerCase();
  const outcome = String(event.outcome || '').toLowerCase();
  const metadata = event.metadata || {};

  if (eventType === 'orchestration.delegation_decision') {
    if (metadata.should_delegate === true && metadata.delegated === true) {
      addDelta(deltas, DOMAIN_KEYS.DELEGATION, 6 * c, 'Delegated when required', event);
    } else if (metadata.should_delegate === true && metadata.delegated !== true) {
      addDelta(deltas, DOMAIN_KEYS.DELEGATION, -10 * c, 'Skipped required delegation', event);
    } else if (metadata.should_delegate === false && metadata.delegated === false) {
      addDelta(deltas, DOMAIN_KEYS.DELEGATION, 2 * c, 'Correct non-delegation', event);
    }
  }

  if (eventType === 'orchestration.tool_invoked') {
    const tool = String(metadata.tool || '');
    const suggested = Array.isArray(metadata.suggested_tools) ? metadata.suggested_tools : [];
    if (suggested.length > 0 && suggested.includes(tool)) {
      addDelta(deltas, DOMAIN_KEYS.TOOL_SELECTION, 4 * c, 'Used suggested tool', event);
    }
    if (metadata.tool_antipattern === true) {
      addDelta(deltas, DOMAIN_KEYS.TOOL_SELECTION, -8 * c, 'Tool anti-pattern detected', event);
    }
  }

  if (eventType === 'orchestration.verification_executed') {
    if (metadata.has_evidence === true) {
      addDelta(deltas, DOMAIN_KEYS.VERIFICATION, 7 * c, 'Verification evidence recorded', event);
    } else {
      addDelta(deltas, DOMAIN_KEYS.VERIFICATION, -8 * c, 'Verification without evidence', event);
    }
  }

  if (eventType === 'orchestration.phase_entered') {
    const validPhases = ['intent_gate', 'assessment', 'exploration', 'implementation', 'completion'];
    if (validPhases.includes(String(metadata.phase || ''))) {
      addDelta(deltas, DOMAIN_KEYS.PHASE, 2 * c, 'Entered expected orchestration phase', event);
    }
    if (metadata.phase_violation === true) {
      addDelta(deltas, DOMAIN_KEYS.PHASE, -9 * c, 'Phase order violation', event);
    }
  }

  if (eventType === 'orchestration.todo_state_changed') {
    if (metadata.todo_quality === 'good') {
      addDelta(deltas, DOMAIN_KEYS.TODO, 5 * c, 'Good todo discipline', event);
    }
    if (metadata.todo_violation === true) {
      addDelta(deltas, DOMAIN_KEYS.TODO, -7 * c, 'Todo management violation', event);
    }
  }

  if (eventType === 'orchestration.communication_observed') {
    if (metadata.style_violation === true) {
      addDelta(deltas, DOMAIN_KEYS.COMMUNICATION, -6 * c, 'Communication style violation', event);
    } else {
      addDelta(deltas, DOMAIN_KEYS.COMMUNICATION, 3 * c, 'Communication style adherence', event);
    }
  }

  if (eventType === 'orchestration.assumption_challenged') {
    addDelta(deltas, DOMAIN_KEYS.DECOMPOSITION, 4 * c, 'Assumption challenged', event);
  }

  if (eventType === 'orchestration.context_gap_detected') {
    if (metadata.resolved === true) {
      addDelta(deltas, DOMAIN_KEYS.DECOMPOSITION, 5 * c, 'Context gap identified and resolved', event);
    } else {
      addDelta(deltas, DOMAIN_KEYS.DECOMPOSITION, -6 * c, 'Unresolved context gap', event);
    }
  }

  if (eventType === 'orchestration.skill_loaded') {
    if (metadata.skill_relevant === true) {
      addDelta(deltas, DOMAIN_KEYS.SKILL_LOADING, 4 * c, 'Relevant skill loaded', event);
    } else if (metadata.skill_relevant === false) {
      addDelta(deltas, DOMAIN_KEYS.SKILL_LOADING, -4 * c, 'Irrelevant skill loaded', event);
    }
    if (metadata.missing_required_skill === true) {
      addDelta(deltas, DOMAIN_KEYS.SKILL_LOADING, -8 * c, 'Required skill not loaded', event);
    }
  }

  if (eventType === 'orchestration.failure_recovery_step') {
    if (outcome === 'recovered' || metadata.recovered === true) {
      addDelta(deltas, DOMAIN_KEYS.RECOVERY, 7 * c, 'Successful failure recovery', event);
    } else if (outcome === 'repeated_failure' || metadata.repeated_failure === true) {
      addDelta(deltas, DOMAIN_KEYS.RECOVERY, -8 * c, 'Repeated failure pattern', event);
    } else {
      addDelta(deltas, DOMAIN_KEYS.RECOVERY, 2 * c, 'Recovery attempt recorded', event);
    }
  }

  if (eventType === 'orchestration.completion_claimed' && metadata.without_verification === true) {
    addDelta(deltas, DOMAIN_KEYS.VERIFICATION, -10 * c, 'Completion claimed without verification', event);
  }

  // Explicit mismatch: verification discipline scored high, but downstream verification failed.
  // Used to calibrate both scoring and domain weight learning.
  if (eventType === 'orchestration.verification_mismatch') {
    addDelta(deltas, DOMAIN_KEYS.VERIFICATION, -12 * c, 'Verification mismatch: claimed high, but tests/build failed', event);
  }

  return deltas;
}

module.exports = {
  DOMAIN_KEYS,
  DOMAIN_SLUGS,
  DOMAIN_WEIGHT_BOUNDS,
  DEFAULT_DOMAIN_WEIGHTS,
  clampDomainWeight,
  normalizeWorkflowType,
  buildDomainWeightHyperParameters,
  evaluateMetaAwarenessEvent,
};
