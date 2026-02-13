const { randomUUID } = require('crypto');

function createOrchestrationId(prefix = 'id') {
  if (typeof randomUUID === 'function') {
    return `${prefix}_${randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function pickSessionId(context = {}, fallbackSessionId = null) {
  return context.session_id || context.sessionId || fallbackSessionId || null;
}

function normalizeQuotaSignal(signal = {}) {
  return {
    provider_id: signal.provider_id || signal.providerId || 'unknown',
    percent_used: signal.percent_used ?? signal.percentUsed ?? 0,
    warning_threshold: signal.warning_threshold ?? signal.warningThreshold ?? 0.75,
    critical_threshold: signal.critical_threshold ?? signal.criticalThreshold ?? 0.95,
    fallback_applied: signal.fallback_applied ?? signal.fallbackApplied ?? false,
    rotator_risk: signal.rotator_risk ?? signal.rotatorRisk ?? 0,
  };
}

function getQuotaSignal(context = {}) {
  return normalizeQuotaSignal(context.quota_signal || context.quotaSignal || {});
}

module.exports = {
  createOrchestrationId,
  pickSessionId,
  normalizeQuotaSignal,
  getQuotaSignal,
};
