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
        this._lock = Promise.resolve(); // Simple lock for concurrent calls
    }

    /**
     * Get the next available healthy key.
     * Thread-safe with simple lock to prevent race conditions.
     * @returns {Promise<object|null>} { id, value }
     */
    getNextKey() {
        return this._withLock(() => this._getNextKeyImpl());
    }

    /**
     * Internal implementation without locking.
     * @returns {object|null} { id, value }
     */
    _getNextKeyImpl() {
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
     * Acquire lock for concurrent-safe getNextKey calls.
     * @param {Function} fn - Function to execute while holding lock
     * @returns {Promise<any>} Result of fn
     */
    _withLock(fn) {
        const oldLock = this._lock;
        let release;
        this._lock = new Promise(resolve => { release = resolve; });
        return oldLock.then(() => Promise.resolve(fn()).finally(() => release()));
    }


    /**
     * Update key status based on response headers.
     * @param {string} keyId 
     * @param {object} headers 
     */
    updateFromHeaders(keyId, headers) {
        const key = this.keys.find(k => k.id === keyId);
        if (!key) return;

        const getHeader = (...names) => {
            for (const name of names) {
                if (headers?.[name] !== undefined && headers?.[name] !== null) return headers[name];
            }
            return undefined;
        };

        // Standard x-ratelimit or x-nvapi headers
        const remainingRequests = parseInt(
            getHeader(
                'x-ratelimit-remaining-requests',
                'x-ratelimit-remaining-requests-minute',
                'x-ratelimit-remaining-rpm',
                'x-ratelimit-remaining',
                'x-nvapi-remaining-requests'
            )
        );
        const remainingTokens = parseInt(
            getHeader(
                'x-ratelimit-remaining-tokens',
                'x-ratelimit-remaining-tokens-minute',
                'x-ratelimit-remaining-tpm',
                'x-nvapi-remaining-tokens'
            )
        );
        const resetRequests = parseInt(
            getHeader(
                'x-ratelimit-reset-requests',
                'x-ratelimit-reset-requests-minute',
                'x-ratelimit-reset-rpm',
                'x-ratelimit-reset',
                'x-nvapi-reset-requests'
            )
        );
        const resetTokens = parseInt(
            getHeader(
                'x-ratelimit-reset-tokens',
                'x-ratelimit-reset-tokens-minute',
                'x-ratelimit-reset-tpm',
                'x-nvapi-reset-tokens'
            )
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

        // Proactive throttling with stricter Cerebras TPM floor
        const requestFloor = this.providerId === 'cerebras' ? 2 : 5;
        const tokenFloor = this.providerId === 'cerebras' ? 5000 : 1000;
        if (key.remainingRequests < requestFloor || key.remainingTokens < tokenFloor) {
            key.status = 'throttled';
        } else {
            key.status = 'healthy';
        }
    }

    /**
     * Record a failure (e.g. 429 or platform-level error) for a specific key.
     * @param {string} keyId 
     * @param {number|object} errorOrRetryAfterMs - Retry time in ms or error object
     */
    recordFailure(keyId, errorOrRetryAfterMs = 0) {
        const key = this.keys.find(k => k.id === keyId);
        if (!key) return;

        let retryAfterMs = typeof errorOrRetryAfterMs === 'number' ? errorOrRetryAfterMs : 0;
        let isPlatformDegraded = false;

        // Detect platform-level errors that should trigger cooldown
        if (typeof errorOrRetryAfterMs === 'object' && errorOrRetryAfterMs !== null) {
            const errorMessage = errorOrRetryAfterMs.message || '';
            const errorDetail = errorOrRetryAfterMs.detail || '';
            const message = `${errorMessage} ${errorDetail}`.toLowerCase();

            const retryAfterHeader =
                errorOrRetryAfterMs.retryAfter ||
                errorOrRetryAfterMs?.headers?.['retry-after'] ||
                errorOrRetryAfterMs?.headers?.['x-ratelimit-reset'] ||
                null;
            if (retryAfterHeader) {
                const retryAfterSec = Number.parseInt(String(retryAfterHeader), 10);
                if (Number.isFinite(retryAfterSec)) retryAfterMs = Math.max(retryAfterMs, retryAfterSec * 1000);
            }

            if (errorMessage.includes('DEGRADED') || errorDetail.includes('DEGRADED') || 
                errorMessage.includes('cannot be invoked') || errorDetail.includes('cannot be invoked')) {
                isPlatformDegraded = true;
                // Force a longer cooldown for platform issues (5 minutes)
                retryAfterMs = Math.max(retryAfterMs, 300000);
                console.warn(`[IntelligentRotator] Detected platform degradation for ${this.providerId} (${keyId}). Entering extended cooldown.`);
            }

            if (this.providerId === 'cerebras' && (message.includes('tokens per minute') || message.includes('tpm'))) {
                retryAfterMs = Math.max(retryAfterMs, 60000);
            }
        }

        key.failureCount++;
        key.resetAt = Date.now() + (retryAfterMs || this.options.cooldownMs);
        
        if (key.failureCount >= this.options.maxFailures || isPlatformDegraded) {
            key.status = isPlatformDegraded ? 'cooldown' : 'dead';
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
