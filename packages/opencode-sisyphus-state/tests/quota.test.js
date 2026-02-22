import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { WorkflowStore } from '../src/database';
import { ProviderQuotaManager } from '../src/quota-manager';
import { createQuotaAwareRouterHandler, createUsageTrackingHandler } from '../src/integrations/quota-routing';
import path from 'path';
import fs from 'fs';
import os from 'os';

function removeDbArtifacts(dbPath) {
    for (const suffix of ['', '-wal', '-shm']) {
        const target = `${dbPath}${suffix}`;
        try {
            if (fs.existsSync(target)) {
                fs.unlinkSync(target);
            }
        } catch (e) {
            // Ignore cleanup errors
        }
    }
}

describe('ProviderQuotaManager', () => {
    let store;
    let manager;
    let dbPath;

    beforeEach(() => {
        dbPath = path.join(os.tmpdir(), `test-quota-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.db`);
        store = new WorkflowStore(dbPath);
        manager = new ProviderQuotaManager(store);
    });

    afterEach(() => {
        if (store) {
            store.close();
        }
        removeDbArtifacts(dbPath);
    });

    describe('setupProvider', () => {
        test('should configure a provider with default values', () => {
            manager.setupProvider('anthropic');
            
            const config = store.db.prepare('SELECT * FROM provider_quotas WHERE provider_id = ?')
                .get('anthropic');
            
            expect(config).toBeTruthy();
            expect(config.quota_type).toBe('request-based');
            expect(config.warning_threshold).toBe(0.8);
            expect(config.critical_threshold).toBe(0.95);
        });

        test('should configure a provider with custom values', () => {
            manager.setupProvider('test-provider', {
                quotaType: 'monthly',
                quotaLimit: 1000000,
                warningThreshold: 0.75,
                criticalThreshold: 0.90
            });
            
            const config = store.db.prepare('SELECT * FROM provider_quotas WHERE provider_id = ?')
                .get('test-provider');
            
            expect(config).toBeTruthy();
            expect(config.quota_type).toBe('monthly');
            expect(config.quota_limit).toBe(1000000);
            expect(config.warning_threshold).toBe(0.75);
            expect(config.critical_threshold).toBe(0.90);
        });

        test('should update existing provider configuration', () => {
            manager.setupProvider('anthropic', { warningThreshold: 0.7 });
            manager.setupProvider('anthropic', { warningThreshold: 0.85 });
            
            const config = store.db.prepare('SELECT * FROM provider_quotas WHERE provider_id = ?')
                .get('anthropic');
            
            expect(config.warning_threshold).toBe(0.85);
        });
    });

    describe('recordUsage', () => {
        test('should record usage successfully', () => {
            manager.setupProvider('anthropic');
            
            manager.recordUsage({
                providerId: 'anthropic',
                modelId: 'claude-3-sonnet',
                sessionId: 'test-session',
                tokensInput: 100,
                tokensOutput: 200
            });
            
            const usage = store.db.prepare('SELECT * FROM api_usage WHERE provider_id = ?')
                .get('anthropic');
            
            expect(usage).toBeTruthy();
            expect(usage.tokens_input).toBe(100);
            expect(usage.tokens_output).toBe(200);
            expect(usage.tokens_total).toBe(300);
            expect(usage.model_id).toBe('claude-3-sonnet');
        });

        test('should calculate total tokens correctly', () => {
            manager.setupProvider('test');
            
            manager.recordUsage({
                providerId: 'test',
                modelId: 'test-model',
                tokensInput: 500,
                tokensOutput: 1000
            });
            
            const usage = store.db.prepare('SELECT tokens_total FROM api_usage WHERE provider_id = ?')
                .get('test');
            
            expect(usage.tokens_total).toBe(1500);
        });
    });

    describe('getQuotaStatus', () => {
        test('should return null for unconfigured provider', () => {
            const status = manager.getQuotaStatus('unknown-provider');
            expect(status).toBeNull();
        });

        test('should return healthy status for request-based provider', () => {
            manager.setupProvider('anthropic');
            
            const status = manager.getQuotaStatus('anthropic');
            
            expect(status).toBeTruthy();
            expect(status.providerId).toBe('anthropic');
            expect(status.status).toBe('healthy');
            expect(status.percentUsed).toBe(0);
        });

        test('should correctly calculate usage for monthly quota', () => {
            manager.setupProvider('google', {
                quotaType: 'monthly',
                quotaLimit: 1000
            });
            
            // Record 500 tokens
            manager.recordUsage({
                providerId: 'google',
                modelId: 'gemini-pro',
                tokensInput: 200,
                tokensOutput: 300
            });
            
            const status = manager.getQuotaStatus('google');
            
            expect(status).toBeTruthy();
            expect(status.tokensUsed).toBe(500);
            expect(status.tokensRemaining).toBe(500);
            expect(status.percentUsed).toBe(0.5);
            expect(status.status).toBe('healthy');
        });

        test('should detect warning threshold', () => {
            manager.setupProvider('google', {
                quotaType: 'monthly',
                quotaLimit: 1000,
                warningThreshold: 0.75
            });
            
            // Record 800 tokens (80%)
            manager.recordUsage({
                providerId: 'google',
                modelId: 'gemini-pro',
                tokensInput: 400,
                tokensOutput: 400
            });
            
            const status = manager.getQuotaStatus('google');
            
            expect(status.percentUsed).toBe(0.8);
            expect(status.status).toBe('warning');
        });

        test('should detect critical threshold', () => {
            manager.setupProvider('google', {
                quotaType: 'monthly',
                quotaLimit: 1000,
                criticalThreshold: 0.95
            });
            
            // Record 960 tokens (96%)
            manager.recordUsage({
                providerId: 'google',
                modelId: 'gemini-pro',
                tokensInput: 480,
                tokensOutput: 480
            });
            
            const status = manager.getQuotaStatus('google');
            
            expect(status.percentUsed).toBe(0.96);
            expect(status.status).toBe('critical');
        });

        test('should detect exhausted quota', () => {
            manager.setupProvider('google', {
                quotaType: 'monthly',
                quotaLimit: 1000
            });
            
            // Record 1000+ tokens
            manager.recordUsage({
                providerId: 'google',
                modelId: 'gemini-pro',
                tokensInput: 600,
                tokensOutput: 600
            });
            
            const status = manager.getQuotaStatus('google');
            
            expect(status.percentUsed).toBeGreaterThanOrEqual(1.0);
            expect(status.status).toBe('exhausted');
            expect(status.tokensRemaining).toBeLessThanOrEqual(0);
        });

        test('should calculate request-based percent from request count, not tokens', () => {
            manager.setupProvider('anthropic', {
                quotaType: 'request-based',
                quotaLimit: 10
            });

            // Four requests with very large token counts should still be 40% usage
            for (let i = 0; i < 4; i++) {
                manager.recordUsage({
                    providerId: 'anthropic',
                    modelId: 'claude-sonnet-4-5',
                    tokensInput: 100000,
                    tokensOutput: 100000
                });
            }

            const status = manager.getQuotaStatus('anthropic');

            expect(status.quotaType).toBe('request-based');
            expect(status.requestCount).toBe(4);
            expect(status.requestsRemaining).toBe(6);
            expect(status.percentUsed).toBe(0.4);
            expect(status.status).toBe('healthy');
        });

        test('should detect warning threshold for request-based providers', () => {
            manager.setupProvider('anthropic', {
                quotaType: 'request-based',
                quotaLimit: 10,
                warningThreshold: 0.7
            });

            for (let i = 0; i < 8; i++) {
                manager.recordUsage({ providerId: 'anthropic', modelId: 'claude-sonnet-4-5' });
            }

            const status = manager.getQuotaStatus('anthropic');

            expect(status.requestCount).toBe(8);
            expect(status.percentUsed).toBe(0.8);
            expect(status.status).toBe('warning');
        });
    });

    describe('getHealthyProviders', () => {
        test('should return empty array when no providers configured', () => {
            const providers = manager.getHealthyProviders();
            expect(providers).toEqual([]);
        });

        test('should return only healthy providers', () => {
            manager.setupProvider('healthy', { quotaType: 'monthly', quotaLimit: 1000 });
            manager.setupProvider('warning', { quotaType: 'monthly', quotaLimit: 1000 });
            manager.setupProvider('exhausted', { quotaType: 'monthly', quotaLimit: 1000 });
            
            // Healthy: 0% usage
            manager.recordUsage({ providerId: 'healthy', tokensInput: 0, tokensOutput: 0 });
            
            // Warning: 80% usage (still usable)
            manager.recordUsage({ providerId: 'warning', tokensInput: 800, tokensOutput: 0 });
            
            // Exhausted: 100%+ usage (not usable)
            manager.recordUsage({ providerId: 'exhausted', tokensInput: 1000, tokensOutput: 100 });
            
            const providers = manager.getHealthyProviders();
            
            // Should return healthy and warning (not exhausted)
            expect(providers).toHaveLength(2);
            expect(providers.map(p => p.providerId).sort()).toEqual(['healthy', 'warning']);
        });

        test('should return providers sorted by usage', () => {
            manager.setupProvider('a', { quotaType: 'monthly', quotaLimit: 1000 });
            manager.setupProvider('b', { quotaType: 'monthly', quotaLimit: 1000 });
            
            manager.recordUsage({ providerId: 'a', tokensInput: 500, tokensOutput: 0 });  // 50%
            manager.recordUsage({ providerId: 'b', tokensInput: 100, tokensOutput: 0 });  // 10%
            
            const providers = manager.getHealthyProviders();
            
            expect(providers).toHaveLength(2);
            expect(providers[0].providerId).toBe('b');  // Least used first
            expect(providers[1].providerId).toBe('a');
        });
    });
});

describe('Quota-Aware Routing', () => {
    let store;
    let manager;
    let dbPath;
    let mockRouter;

    beforeEach(() => {
        dbPath = path.join(
            os.tmpdir(),
            `test-routing-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.db`
        );
        removeDbArtifacts(dbPath);
        
        store = new WorkflowStore(dbPath);
        manager = new ProviderQuotaManager(store);
        
        mockRouter = {
            selectModel: async (options) => {
                return {
                    model: 'mock-model',
                    provider: options.provider || options.allowedProviders?.[0] || 'default',
                    options
                };
            }
        };
    });

    afterEach(() => {
        if (store) store.close();
        removeDbArtifacts(dbPath);
    });

    describe('createQuotaAwareRouterHandler', () => {
        test('should select model from healthy providers', async () => {
            manager.setupProvider('provider-a', { quotaType: 'monthly', quotaLimit: 1000 });
            manager.setupProvider('provider-b', { quotaType: 'monthly', quotaLimit: 1000 });
            
            const handler = createQuotaAwareRouterHandler(manager, mockRouter);
            
            const result = await handler({
                category: 'general',
                skills: ['coding']
            });
            
            expect(result).toBeTruthy();
            expect(result.model).toBeTruthy();
            expect(result.quotaFactors).toEqual([]);
        });

        test('should apply fallback when requested provider is exhausted', async () => {
            manager.setupProvider('primary', { quotaType: 'monthly', quotaLimit: 1000 });
            manager.setupProvider('fallback', { quotaType: 'monthly', quotaLimit: 1000 });
            
            // Exhaust primary
            manager.recordUsage({
                providerId: 'primary',
                tokensInput: 1000,
                tokensOutput: 1000
            });
            
            const handler = createQuotaAwareRouterHandler(manager, mockRouter);
            
            const result = await handler({
                category: 'general',
                requestedProvider: 'primary',
                allowFallback: true
            });
            
            expect(result.fallbackApplied).toBe(true);
            expect(result.reason).toContain('quota exhausted');
            expect(result.quotaFactors).toHaveLength(1);
            expect(result.quotaFactors[0].provider).toBe('primary');
        });

        test('should throw when fallback not allowed and provider exhausted', async () => {
            manager.setupProvider('primary', { quotaType: 'monthly', quotaLimit: 1000 });
            
            // Exhaust primary
            manager.recordUsage({
                providerId: 'primary',
                tokensInput: 1000,
                tokensOutput: 1000
            });
            
            const handler = createQuotaAwareRouterHandler(manager, mockRouter);
            
            await expect(
                handler({
                    category: 'general',
                    requestedProvider: 'primary',
                    allowFallback: false
                })
            ).rejects.toThrow('quota exhausted');
        });

        test('should apply fallback at critical threshold', async () => {
            manager.setupProvider('primary', {
                quotaType: 'monthly',
                quotaLimit: 1000,
                criticalThreshold: 0.95
            });
            manager.setupProvider('fallback', { quotaType: 'monthly', quotaLimit: 1000 });
            
            // Bring primary to 96% (above critical threshold of 95%)
            manager.recordUsage({
                providerId: 'primary',
                tokensInput: 960,
                tokensOutput: 0
            });
            
            const handler = createQuotaAwareRouterHandler(manager, mockRouter);
            
            const result = await handler({
                category: 'general',
                requestedProvider: 'primary'
            });
            
            expect(result.fallbackApplied).toBe(true);
            // Reason should mention quota constraint
            expect(result.reason).toBeTruthy();
        });

        test('should log routing decisions', async () => {
            manager.setupProvider('provider', { quotaType: 'monthly', quotaLimit: 1000 });
            
            const handler = createQuotaAwareRouterHandler(manager, mockRouter);
            
            await handler({
                category: 'general',
                sessionId: 'test-session',
                taskId: 'test-task'
            });
            
            const decisions = store.db.prepare(
                'SELECT * FROM routing_decisions WHERE session_id = ?'
            ).all('test-session');
            
            expect(decisions).toHaveLength(1);
            expect(decisions[0].session_id).toBe('test-session');
            expect(decisions[0].task_id).toBe('test-task');
            expect(decisions[0].requested_category).toBe('general');
        });
    });

    describe('createUsageTrackingHandler', () => {
        test('should record usage and return no warning for healthy usage', async () => {
            manager.setupProvider('test', { quotaType: 'monthly', quotaLimit: 1000 });
            
            const handler = createUsageTrackingHandler(manager);
            
            const result = await handler({
                providerId: 'test',
                modelId: 'test-model',
                tokensInput: 100,
                tokensOutput: 100
            });
            
            expect(result.warning).toBe(false);
            
            const usage = store.db.prepare('SELECT * FROM api_usage WHERE provider_id = ?')
                .get('test');
            expect(usage.tokens_total).toBe(200);
        });

        test('should return warning when approaching critical threshold', async () => {
            manager.setupProvider('test', {
                quotaType: 'monthly',
                quotaLimit: 1000,
                criticalThreshold: 0.9
            });
            
            // Bring to 89% (just below critical)
            manager.recordUsage({
                providerId: 'test',
                tokensInput: 890,
                tokensOutput: 0
            });
            
            const handler = createUsageTrackingHandler(manager);
            
            const result = await handler({
                providerId: 'test',
                tokensInput: 1,
                tokensOutput: 0
            });
            
            expect(result.warning).toBe(true);
            expect(result.severity).toBe('warning');
            expect(result.message).toContain('89%');
        });

        test('hasCapacity should use request capacity for request-based quotas', () => {
            manager.setupProvider('cerebras', {
                quotaType: 'request-based',
                quotaLimit: 2,
                criticalThreshold: 0.95
            });

            manager.recordUsage({ providerId: 'cerebras', modelId: 'llama-3.3-70b' });
            expect(manager.hasCapacity('cerebras', 999999)).toBe(true);

            manager.recordUsage({ providerId: 'cerebras', modelId: 'llama-3.3-70b' });
            expect(manager.hasCapacity('cerebras', 1)).toBe(false);
        });
    });
});
