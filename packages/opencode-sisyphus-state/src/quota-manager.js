const { v4: uuidv4 } = require('uuid');

/**
 * Manages provider quotas and tracks API usage
 * Provides quota-aware model selection for orchestration
 */
class ProviderQuotaManager {
  constructor(store) {
    this.store = store;
    this.db = store.db;
  }

  /**
   * Configure quota for a provider
   */
  configureQuota(providerId, config) {
    const stmt = this.db.prepare(`
      INSERT INTO provider_quotas 
      (provider_id, quota_type, quota_limit, quota_period, warning_threshold, critical_threshold)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(provider_id) DO UPDATE SET
        quota_type = excluded.quota_type,
        quota_limit = excluded.quota_limit,
        quota_period = excluded.quota_period,
        warning_threshold = excluded.warning_threshold,
        critical_threshold = excluded.critical_threshold,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(
      providerId,
      config.quotaType,
      config.quotaLimit,
      config.quotaPeriod || null,
      config.warningThreshold || 0.8,
      config.criticalThreshold || 0.95
    );

    console.log(`[QuotaManager] Configured quota for ${providerId}: ${config.quotaLimit} ${config.quotaType}`);
  }

  /**
   * Get quota configuration for a provider
   */
  getQuota(providerId) {
    const stmt = this.db.prepare('SELECT * FROM provider_quotas WHERE provider_id = ?');
    return stmt.get(providerId);
  }

  /**
   * Record API usage
   */
  recordUsage({ providerId, modelId, tokensInput = 0, tokensOutput = 0, sessionId, costEstimate }) {
    const stmt = this.db.prepare(`
      INSERT INTO api_usage 
      (usage_id, provider_id, session_id, model_id, tokens_input, tokens_output, cost_estimate)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      uuidv4(),
      providerId,
      sessionId || null,
      modelId || null,
      tokensInput,
      tokensOutput,
      costEstimate || null
    );

    // Update snapshot asynchronously (don't block)
    this._updateSnapshot(providerId);
  }

  /**
   * Get current usage for a provider in the current period
   */
  getCurrentUsage(providerId) {
    const quota = this.getQuota(providerId);
    if (!quota) return null;

    let periodStart;
    const now = new Date();

    if (quota.quota_period === 'month') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (quota.quota_period === 'day') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else {
      periodStart = new Date(0); // All time for request-based
    }

    const stmt = this.db.prepare(`
      SELECT 
        COALESCE(SUM(tokens_total), 0) as tokens_used,
        COALESCE(SUM(cost_estimate), 0) as total_cost,
        COUNT(*) as request_count
      FROM api_usage
      WHERE provider_id = ? AND timestamp >= ?
    `);

    return stmt.get(providerId, periodStart.toISOString());
  }

  /**
   * Get quota status with thresholds
   */
  getQuotaStatus(providerId) {
    const quota = this.getQuota(providerId);
    if (!quota) return null;

    const usage = this.getCurrentUsage(providerId);
    const tokensUsed = usage?.tokens_used || 0;
    const requestCount = usage?.request_count || 0;
    const quotaType = quota.quota_type || 'request-based';
    const usageUsed = quotaType === 'request-based' ? requestCount : tokensUsed;
    
    // Handle request-based or unlimited quotas
    const hasLimit = quota.quota_limit && quota.quota_limit > 0;
    const percentUsed = hasLimit ? usageUsed / quota.quota_limit : 0;
    const usageRemaining = hasLimit ? Math.max(0, quota.quota_limit - usageUsed) : Infinity;
    const requestsRemaining = quotaType === 'request-based' ? usageRemaining : Infinity;
    const tokensRemaining = quotaType === 'request-based' ? Infinity : usageRemaining;
    const isExhausted = hasLimit ? percentUsed >= 1.0 : false;
    
    // Determine status based on thresholds
    let status = 'healthy';
    if (isExhausted) {
      status = 'exhausted';
    } else if (hasLimit && percentUsed >= quota.critical_threshold) {
      status = 'critical';
    } else if (hasLimit && percentUsed >= quota.warning_threshold) {
      status = 'warning';
    }

    return {
      providerId,
      tokensUsed,
      tokensRemaining,
      quotaLimit: quota.quota_limit,
      percentUsed,
      status,
      isExhausted,
      warningThreshold: quota.warning_threshold,
      criticalThreshold: quota.critical_threshold,
      requestCount,
      requestsRemaining,
      quotaType,
      usageUsed,
      usageRemaining,
      totalCost: usage?.total_cost || 0
    };
  }

/**
 * Setup provider (alias for configureQuota for consistency)
 */
  setupProvider(providerId, config = {}) {
    // Load defaults if using built-in provider
    const defaultProviders = require('./config/default-providers');
    const defaults = defaultProviders[providerId] || {};

    const mergedConfig = {
      quotaType: config.quotaType || defaults.quotaType || 'request-based',
      quotaLimit: config.quotaLimit || defaults.quotaLimit || null,
      quotaPeriod: config.quotaPeriod || defaults.quotaPeriod || null,
      warningThreshold: config.warningThreshold || defaults.warningThreshold || 0.8,
      criticalThreshold: config.criticalThreshold || defaults.criticalThreshold || 0.95
    };

    this.configureQuota(providerId, mergedConfig);
  }

  /**
 * Get healthy providers (not exhausted, sorted by usage)
 */
  getHealthyProviders() {
    const stmt = this.db.prepare('SELECT provider_id FROM provider_quotas');
    const providers = stmt.all();

    return providers
      .map(p => this.getQuotaStatus(p.provider_id))
      .filter(status => !status.isExhausted)
      .sort((a, b) => a.percentUsed - b.percentUsed);
  }

  /**
 * Suggest best fallback provider from a list
 */
  suggestFallback(providerIds) {
    const statuses = providerIds
      .map(id => ({ id, status: this.getQuotaStatus(id) }))
      .filter(s => s.status && !s.status.isExhausted);

    // Sort by percent used (ascending - least used first)
    statuses.sort((a, b) => a.status.percentUsed - b.status.percentUsed);

    return statuses[0]?.id || null;
  }

  /**
   * Get all providers and their statuses
   */
  getAllStatuses() {
    const stmt = this.db.prepare('SELECT provider_id FROM provider_quotas');
    const providers = stmt.all();
    return providers.map(p => this.getQuotaStatus(p.provider_id));
  }

  /**
   * Check if provider has capacity for estimated tokens
   */
  hasCapacity(providerId, estimatedTokens) {
    const status = this.getQuotaStatus(providerId);
    if (!status) return true; // No quota configured = unlimited

    if (status.quotaType === 'request-based') {
      return !status.isExhausted &&
             (status.requestsRemaining >= 1 || status.percentUsed < status.criticalThreshold);
    }

    return !status.isExhausted &&
           (status.tokensRemaining >= estimatedTokens ||
            status.percentUsed < status.criticalThreshold);
  }

  /**
   * Log routing decision (alias for recordRoutingDecision for test compatibility)
   */
  logRoutingDecision(decisionData) {
    return this.recordRoutingDecision(decisionData);
  }

  /**
   * Record a routing decision for audit trail
   */
  recordRoutingDecision({ decisionId, sessionId, taskId, requestedCategory, requestedSkills,
                         originalSelection, finalSelection, fallbackApplied, quotaFactors, reason }) {
    const stmt = this.db.prepare(`
      INSERT INTO routing_decisions 
      (decision_id, session_id, task_id, requested_category, requested_skills,
       original_selection, final_selection, quota_factors, fallback_applied, reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      decisionId || uuidv4(),
      sessionId || null,
      taskId || null,
      requestedCategory || null,
      requestedSkills ? JSON.stringify(requestedSkills) : null,
      originalSelection || null,
      finalSelection,
      quotaFactors ? JSON.stringify(quotaFactors) : null,
      fallbackApplied ? 1 : 0,
      reason || null
    );
  }

  /**
   * Update quota snapshot (internal)
   */
  _updateSnapshot(providerId) {
    const quota = this.getQuota(providerId);
    if (!quota) return;

    const status = this.getQuotaStatus(providerId);
    const now = new Date();

    let periodStart, periodEnd;
    if (quota.quota_period === 'month') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (quota.quota_period === 'day') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      periodEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    } else {
      periodStart = new Date(0);
      periodEnd = new Date(8640000000000000);
    }

    const stmt = this.db.prepare(`
      INSERT INTO quota_snapshots 
      (snapshot_id, provider_id, period_start, period_end, tokens_used, tokens_remaining, percent_used, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const snapshotUsed = status.quotaType === 'request-based' ? status.requestCount : status.tokensUsed;
    const snapshotRemaining = status.quotaType === 'request-based' ? status.requestsRemaining : status.tokensRemaining;

    stmt.run(
      uuidv4(),
      providerId,
      periodStart.toISOString(),
      periodEnd.toISOString(),
      snapshotUsed,
      snapshotRemaining,
      status.percentUsed,
      status.status
    );
  }
}

module.exports = { ProviderQuotaManager };
