/**
 * Integration handlers for quota-aware routing
 * Integrates with task-orchestrator and routing systems
 */

/**
 * Create quota-aware model selection handler
 * Factors in API usage/quotas when making routing decisions
 */
function createQuotaAwareRouterHandler(quotaManager) {
  return async (input) => {
    const {
      requestedModel,
      requestedProvider,
      estimatedTokens = 1000, // Default estimate
      category,
      skills,
      alternatives = [], // Alternative providers/models
      fallbackModel // Last resort fallback
    } = input;

    const decision = {
      sessionId: input.sessionId,
      taskId: input.taskId,
      requestedCategory: category,
      originalSelection: requestedModel,
      finalSelection: requestedModel,
      fallbackApplied: false,
      quotaFactors: {},
      reason: 'primary_selection_available'
    };

    // Check if primary provider has capacity
    const primaryStatus = quotaManager.getQuotaStatus(requestedProvider);
    const hasPrimaryCapacity = !primaryStatus ||
                               (!primaryStatus.isExhausted &&
                                primaryStatus.tokensRemaining >= estimatedTokens);

    if (hasPrimaryCapacity) {
      // Primary provider has capacity - use it
      quotaManager.recordRoutingDecision({
        ...decision,
        finalSelection: requestedModel,
        reason: 'primary_provider_healthy'
      });

      return {
        provider: requestedProvider,
        model: requestedModel,
        fallbackApplied: false,
        quotaStatus: primaryStatus || { status: 'unlimited' }
      };
    }

    // Primary provider exhausted/critical - try alternatives
    decision.quotaFactors[requestedProvider] = primaryStatus.status;

    // Sort alternatives by quota health
    const rankedAlternatives = alternatives
      .map(alt => {
        const status = quotaManager.getQuotaStatus(alt.provider);
        return {
          ...alt,
          quotaStatus: status,
          viable: !status?.isExhausted && (status?.tokensRemaining || 0) >= estimatedTokens
        };
      })
      .filter(alt => alt.viable)
      .sort((a, b) => {
        // Sort by health: healthy > warning > critical > exhausted
        const healthOrder = { healthy: 0, warning: 1, critical: 2, exhausted: 3, unlimited: -1 };
        const aHealth = healthOrder[a.quotaStatus?.status] ?? 4;
        const bHealth = healthOrder[b.quotaStatus?.status] ?? 4;
        return aHealth - bHealth;
      });

    if (rankedAlternatives.length > 0) {
      const selected = rankedAlternatives[0];

      quotaManager.recordRoutingDecision({
        ...decision,
        finalSelection: selected.model,
        fallbackApplied: true,
        quotaFactors: decision.quotaFactors,
        reason: `primary_exhausted_fallback_to_${selected.provider}`
      });

      return {
        provider: selected.provider,
        model: selected.model,
        fallbackApplied: true,
        originalSelection: requestedModel,
        quotaStatus: selected.quotaStatus,
        reason: `Fallback: ${requestedProvider} exhausted/critical, using ${selected.provider}`
      };
    }

    // All alternatives exhausted - use last resort if configured
    if (fallbackModel && fallbackModel.provider) {
      const fallbackStatus = quotaManager.getQuotaStatus(fallbackModel.provider);

      quotaManager.recordRoutingDecision({
        ...decision,
        finalSelection: fallbackModel.model,
        fallbackApplied: true,
        quotaFactors: decision.quotaFactors,
        reason: 'all_alternatives_exhausted_using_emergency_fallback'
      });

      return {
        provider: fallbackModel.provider,
        model: fallbackModel.model,
        fallbackApplied: true,
        emergency: true,
        originalSelection: requestedModel,
        quotaStatus: fallbackStatus,
        reason: 'All quota-aware options exhausted, using emergency fallback'
      };
    }

    // Complete quota exhaustion - throw error
    quotaManager.recordRoutingDecision({
      ...decision,
      fallbackApplied: false,
      quotaFactors: decision.quotaFactors,
      reason: 'complete_quota_exhaustion'
    });

    throw new Error(
      `API quota exhausted for ${requestedProvider} and all alternatives. ` +
      `Primary status: ${primaryStatus?.status || 'unconfigured'}`
    );
  };
}

/**
 * Create usage recording handler
 * Records API calls back into the quota system
 */
function createUsageRecordingHandler(quotaManager) {
  return async (usage) => {
    quotaManager.recordUsage({
      providerId: usage.provider,
      modelId: usage.model,
      tokensInput: usage.tokensInput,
      tokensOutput: usage.tokensOutput,
      sessionId: usage.sessionId,
      costEstimate: usage.costEstimate
    });

    return { recorded: true };
  };
}

/**
 * Create quota monitoring step handler
 * Checks quotas before executing expensive operations
 */
function createQuotaCheckHandler(quotaManager) {
  return async (input) => {
    const { provider, estimatedTokens, operation } = input;

    const status = quotaManager.getQuotaStatus(provider);

    if (!status) {
      return {
        allowed: true,
        warning: false,
        status: 'unconfigured',
        message: 'No quota configured - operation allowed'
      };
    }

    if (status.isExhausted) {
      return {
        allowed: false,
        warning: true,
        status: 'exhausted',
        message: `Quota exhausted: ${status.tokensUsed}/${status.quotaLimit} tokens used`,
        alternatives: quotaManager.suggestFallback([provider])
      };
    }

    if (status.status === 'critical') {
      return {
        allowed: true,
        warning: true,
        status: 'critical',
        message: `Quota critical: ${(status.percentUsed * 100).toFixed(1)}% used`,
        remaining: status.tokensRemaining
      };
    }

    if (status.status === 'warning') {
      return {
        allowed: true,
        warning: true,
        status: 'warning',
        message: `Quota warning: ${(status.percentUsed * 100).toFixed(1)}% used`,
        remaining: status.tokensRemaining
      };
    }

    return {
      allowed: true,
      warning: false,
      status: 'healthy',
      message: `Quota healthy: ${(status.percentUsed * 100).toFixed(1)}% used`,
      remaining: status.tokensRemaining
    };
  };
}

module.exports = {
  createQuotaAwareRouterHandler,
  createUsageRecordingHandler,
  createQuotaCheckHandler
};
