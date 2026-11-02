const { v4: uuidv4 } = require('uuid');

/**
 * Creates a quota-aware routing handler
 * This handler checks provider quotas before making routing decisions
 * and applies fallback logic when quotas are exhausted
 */
function createQuotaAwareRouterHandler(quotaManager, baseRouter) {
    return async (input) => {
        const {
            category,
            skills = [],
            taskComplexity = 'medium',
            requestedProvider = null,
            allowFallback = true,
            sessionId = null,
            taskId = null
        } = input;

        let selectedModel;
        let originalSelection;
        let fallbackApplied = false;
        let reason = null;
        const quotaFactors = [];

        // If a specific provider was requested, check its quota first
        if (requestedProvider) {
            const status = await quotaManager.getQuotaStatus(requestedProvider);
            
            if (!status || status.percentUsed >= 1.0) {
                if (!allowFallback) {
                    throw new Error(`Provider ${requestedProvider} quota exhausted and fallback not allowed`);
                }
                
                quotaFactors.push({
                    provider: requestedProvider,
                    reason: 'exhausted',
                    percentUsed: status ? status.percentUsed : 1.0
                });
                
                fallbackApplied = true;
                reason = `Requested provider ${requestedProvider} quota exhausted, applying fallback`;
                selectedModel = await selectFallbackModel(quotaManager, baseRouter, category, skills);
            } else if (status.percentUsed >= status.criticalThreshold) {
                quotaFactors.push({
                    provider: requestedProvider,
                    reason: 'critical',
                    percentUsed: status.percentUsed
                });
                
                fallbackApplied = true;
                reason = `Requested provider ${requestedProvider} at critical threshold (${(status.percentUsed * 100).toFixed(1)}%), using fallback`;
                selectedModel = await selectFallbackModel(quotaManager, baseRouter, category, skills);
            } else {
                // Provider is healthy, use base router
                selectedModel = await baseRouter.selectModel({
                    category,
                    skills,
                    provider: requestedProvider,
                    complexity: taskComplexity
                });
            }
        } else {
            // No provider specified, get all healthy providers
            const healthyProviders = await quotaManager.getHealthyProviders();
            
            if (healthyProviders.length === 0) {
                throw new Error('All providers quota exhausted');
            }

            // Let base router select best model from healthy providers
            const providerIds = healthyProviders
                .map((p) => p.providerId || p.provider_id)
                .filter(Boolean);

            selectedModel = await baseRouter.selectModel({
                category,
                skills,
                allowedProviders: providerIds,
                complexity: taskComplexity
            });

            // Check if we're approaching any warning thresholds
            const allStatuses = await Promise.all(
                providerIds.map(providerId => quotaManager.getQuotaStatus(providerId))
            );

            for (const status of allStatuses) {
                if (status && status.percentUsed >= status.warningThreshold) {
                    quotaFactors.push({
                        provider: status.providerId,
                        reason: status.percentUsed >= status.criticalThreshold ? 'critical' : 'warning',
                        percentUsed: status.percentUsed
                    });
                }
            }

            if (quotaFactors.length > 0) {
                reason = `Selection made with quota constraints: ${quotaFactors.map(f => 
                    `${f.provider} at ${(f.percentUsed * 100).toFixed(1)}%`
                ).join(', ')}`;
            }
        }

        // Log the routing decision
        const decisionId = uuidv4();
        await quotaManager.logRoutingDecision({
            decisionId,
            sessionId,
            taskId,
            requestedCategory: category,
            requestedSkills: skills,
            originalSelection: typeof originalSelection === 'object' ? JSON.stringify(originalSelection) : originalSelection,
            finalSelection: typeof selectedModel === 'object' ? JSON.stringify(selectedModel) : selectedModel,
            quotaFactors,
            fallbackApplied,
            reason
        });

        return {
            model: selectedModel,
            decisionId,
            fallbackApplied,
            quotaFactors,
            reason
        };
    };
}

/**
 * Select a fallback model when primary provider is exhausted
 */
async function selectFallbackModel(quotaManager, baseRouter, category, skills) {
    const healthyProviders = await quotaManager.getHealthyProviders();
    
    if (healthyProviders.length === 0) {
        throw new Error('No healthy providers available for fallback');
    }

    // Sort by percent used (ascending) to get the healthiest provider
    const sorted = healthyProviders.sort((a, b) => a.percentUsed - b.percentUsed);
    const bestProvider = sorted[0].providerId;

    return await baseRouter.selectModel({
        category,
        skills,
        provider: bestProvider,
        complexity: 'medium'
    });
}

/**
 * Creates a usage tracking handler
 * Call this after successful API calls to record usage
 */
function createUsageTrackingHandler(quotaManager) {
    return async (input) => {
        const {
            providerId,
            modelId,
            sessionId,
            tokensInput = 0,
            tokensOutput = 0,
            costEstimate = null
        } = input;

        await quotaManager.recordUsage({
            providerId,
            modelId,
            sessionId,
            tokensInput,
            tokensOutput,
            costEstimate
        });

        // Check if we're approaching quota limits and should alert
        const status = await quotaManager.getQuotaStatus(providerId);
        if (status && status.percentUsed >= status.warningThreshold) {
            return {
                warning: true,
                severity: status.percentUsed >= status.criticalThreshold ? 'critical' : 'warning',
                message: `Provider ${providerId} quota at ${Math.floor(status.percentUsed * 100)}%`,
                remaining: status.tokensRemaining
            };
        }

        return { warning: false };
    };
}

module.exports = {
    createQuotaAwareRouterHandler,
    createUsageTrackingHandler
};
