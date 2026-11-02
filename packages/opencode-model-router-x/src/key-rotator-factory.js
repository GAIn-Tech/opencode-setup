'use strict';

const { IntelligentRotator } = require('./key-rotator');

/**
 * KeyRotatorFactory — Centralized initialization for provider rotators.
 * 
 * Maps environment variables to IntelligentRotator instances.
 * Expected format: PROVIDER_API_KEYS="key1,key2,key3"
 */
class KeyRotatorFactory {
    /**
     * Provider ID aliases for rotator lookup.
     * Maps alias names to canonical rotator IDs.
     * Example: 'antigravity' → 'google' (strategies use 'antigravity', rotators use 'google')
     */
    static PROVIDER_ALIASES = {
        antigravity: 'google'
    };

    /**
     * Create rotators for all configured providers.
     * @param {object} env - process.env or similar
     * @returns {object} Map of providerId -> IntelligentRotator
     */
    static createFromEnv(env = process.env) {
        const rotators = {};
    const providers = [
      'nvidia',
      'cerebras',
      'groq',
      'sambanova',
      'openai',
      'anthropic',
      'google'       // Canonical ID for Google/Antigravity provider
    ];

        for (const provider of providers) {
            const envKey = `${provider.toUpperCase()}_API_KEYS`;
            const keysStr = env[envKey] || env[`${provider.toUpperCase()}_API_KEY`];
            
            if (keysStr) {
                const keys = keysStr.split(',').map(k => k.trim()).filter(Boolean);
                if (keys.length > 0) {
                    rotators[provider] = new IntelligentRotator(provider, keys, {
                        strategy: 'round-robin',
                        cooldownMs: 60000 // 1 minute default cooldown
                    });
                }
            }
        }

        return rotators;
    }

    /**
     * Get rotator for a provider ID, handling aliases.
     * @param {object} rotators - Rotator map from createFromEnv()
     * @param {string} providerId - Provider ID or alias
     * @returns {IntelligentRotator|undefined} Rotator instance or undefined
     */
    static getRotator(rotators, providerId) {
        const canonicalId = this.PROVIDER_ALIASES[providerId] || providerId;
        return rotators[canonicalId];
    }

    /**
     * Create a mock rotator for testing.
     */
    static createMock(providerId, count = 2) {
        const keys = Array.from({ length: count }, (_, i) => `mock-key-${providerId}-${i}`);
        return new IntelligentRotator(providerId, keys);
    }

    /**
     * P1: Budget-Aware Key Rotation - Set governor on all rotators
     * @param {object} rotators - Rotator map from createFromEnv()
     * @param {object} governor - Governor instance from opencode-context-governor
     * @param {string} sessionId - Session ID for budget tracking
     */
    static setGovernor(rotators, governor, sessionId = 'default') {
        for (const [providerId, rotator] of Object.entries(rotators)) {
            if (rotator && typeof rotator.setGovernor === 'function') {
                rotator.setGovernor(governor, sessionId);
            }
        }
    }

    /**
     * P3: KeyRotator → Learning - Set learning engine on all rotators
     * @param {object} rotators - Rotator map from createFromEnv()
     * @param {object} learningEngine - Learning engine instance
     */
    static setLearningEngine(rotators, learningEngine) {
        for (const [providerId, rotator] of Object.entries(rotators)) {
            if (rotator && typeof rotator.setLearningEngine === 'function') {
                rotator.setLearningEngine(learningEngine);
            }
        }
    }
}

module.exports = { KeyRotatorFactory };
