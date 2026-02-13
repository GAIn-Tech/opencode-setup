'use strict';

/**
 * IntelligentRotator — Multi-key rotation with rate-limit header awareness.
 * 
 * Features:
 *  1. Round-robin or health-based key selection.
 *  2. Automatic backoff on 429 (Rate Limit).
 *  3. Header-based proactive throttling (x-ratelimit-*).
 *  4. Telemetry reporting to QuotaManager.
 */
class IntelligentRotator {
    /**
     * @param {string} providerId - e.g. 'nvidia', 'cerebras', 'groq'
     * @param {string[]} keys - Array of API keys
     * @param {object} options
     */
    constructor(providerId, keys = [], options = {}) {
        this.providerId = providerId;
        this.keys = keys.map((key, index) => ({
            id: `key-${providerId}-${index}-${Math.random().toString(36).slice(2, 9)}`,
            value: key,
            status: 'healthy',
            remainingRequests: Infinity,
            remainingTokens: Infinity,
            resetAt: 0,
            lastUsed: 0,
            failureCount: 0
        }));
        
        this.options = {
            strategy: 'round-robin', // 'round-robin' | 'health-first'
            cooldownMs: 60000,
            maxFailures: 3,
            ...options
        };

        this.currentIndex = 0;
    }

    /**
     * Get the next available healthy key.
     * @returns {object|null} { id, value }
     */
    getNextKey() {
        const now = Date.now();
        const healthyKeys = this.keys.filter(k => 
            k.status === 'healthy' && now > k.resetAt
        );

        if (healthyKeys.length === 0) {
            // Check if any keys are in cooldown but might be ready soon
            const candidate = this.keys.sort((a, b) => a.resetAt - b.resetAt)[0];
            if (candidate && now > candidate.resetAt) {
                candidate.status = 'healthy';
                return candidate;
            }
            return null;
        }

        let selected;
        if (this.options.strategy === 'health-first') {
            // Pick key with most remaining tokens/requests
            selected = healthyKeys.sort((a, b) => {
                const aVal = Math.min(a.remainingRequests, a.remainingTokens);
                const bVal = Math.min(b.remainingRequests, b.remainingTokens);
                return bVal - aVal;
            })[0];
        } else {
            // Round-robin
            selected = healthyKeys[this.currentIndex % healthyKeys.length];
            this.currentIndex = (this.currentIndex + 1) % healthyKeys.length;
        }

        selected.lastUsed = now;
        return selected;
    }

    /**
     * Update key status based on response headers.
     * @param {string} keyId 
     * @param {object} headers 
     */
    updateFromHeaders(keyId, headers) {
        const key = this.keys.find(k => k.id === keyId);
        if (!key) return;

        // Standard x-ratelimit or x-nvapi headers
        const remainingRequests = parseInt(
            headers['x-ratelimit-remaining-requests'] || 
            headers['x-ratelimit-remaining'] ||
            headers['x-nvapi-remaining-requests']
        );
        const remainingTokens = parseInt(
            headers['x-ratelimit-remaining-tokens'] ||
            headers['x-nvapi-remaining-tokens']
        );
        const resetRequests = parseInt(
            headers['x-ratelimit-reset-requests'] || 
            headers['x-ratelimit-reset'] ||
            headers['x-nvapi-reset-requests']
        );
        const resetTokens = parseInt(
            headers['x-ratelimit-reset-tokens'] ||
            headers['x-nvapi-reset-tokens']
        );

        if (!isNaN(remainingRequests)) key.remainingRequests = remainingRequests;
        if (!isNaN(remainingTokens)) key.remainingTokens = remainingTokens;
        
        const now = Date.now();
        if (!isNaN(resetRequests)) {
            key.resetAt = Math.max(key.resetAt, now + (resetRequests * 1000));
        }
        if (!isNaN(resetTokens)) {
            key.resetAt = Math.max(key.resetAt, now + (resetTokens * 1000));
        }

        // Proactive throttling
        if (key.remainingRequests < 5 || key.remainingTokens < 1000) {
            key.status = 'throttled';
        } else {
            key.status = 'healthy';
        }
    }

    /**
     * Record a failure (e.g. 429) for a specific key.
     * @param {string} keyId 
     * @param {number} retryAfterMs 
     */
    recordFailure(keyId, retryAfterMs = 0) {
        const key = this.keys.find(k => k.id === keyId);
        if (!key) return;

        key.failureCount++;
        key.resetAt = Date.now() + (retryAfterMs || this.options.cooldownMs);
        
        if (key.failureCount >= this.options.maxFailures) {
            key.status = 'dead';
        } else {
            key.status = 'cooldown';
        }
    }

    /**
     * Record a success for a specific key.
     * @param {string} keyId 
     */
    recordSuccess(keyId) {
        const key = this.keys.find(k => k.id === keyId);
        if (!key) return;

        key.failureCount = 0;
        key.status = 'healthy';
    }

    /**
     * Get aggregate health status for the provider.
     */
    getProviderStatus() {
        const now = Date.now();
        const healthyCount = this.keys.filter(k => k.status === 'healthy').length;
        const totalRemainingTokens = this.keys.reduce((acc, k) => acc + (isFinite(k.remainingTokens) ? k.remainingTokens : 0), 0);
        
        return {
            providerId: this.providerId,
            healthyKeys: healthyCount,
            totalKeys: this.keys.length,
            isExhausted: healthyCount === 0,
            totalRemainingTokens,
            status: healthyCount > 0 ? 'healthy' : 'exhausted'
        };
    }
}

module.exports = { IntelligentRotator };
