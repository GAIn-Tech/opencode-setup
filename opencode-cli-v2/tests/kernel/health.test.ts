import { describe, expect, test } from 'bun:test';

import { KernelHealth } from '../../src/kernel/health';
import { CapabilityRegistry } from '../../src/kernel/registry';
import { createCapability } from './helpers';

describe('KernelHealth', () => {
  test('reports healthy status when all configured capabilities are healthy', async () => {
    const registry = new CapabilityRegistry({
      required: ['orchestration'],
      optional: ['plugins']
    });

    const health = new KernelHealth(registry);
    const report = await health.check({
      capabilities: new Map([
        ['orchestration', createCapability('orchestration', { healthCheck: () => 'healthy' })],
        ['plugins', createCapability('plugins', { healthCheck: () => ({ status: 'healthy' }) })]
      ]),
      missingRequired: [],
      missingOptional: []
    });

    expect(report.status).toBe('healthy');
    expect(report.capabilities).toEqual([
      {
        capability: 'orchestration',
        required: true,
        status: 'healthy',
        details: undefined
      },
      {
        capability: 'plugins',
        required: false,
        status: 'healthy',
        details: undefined
      }
    ]);
  });

  test('reports unhealthy when a required capability is missing', async () => {
    const registry = new CapabilityRegistry({ required: ['orchestration'], optional: [] });
    const health = new KernelHealth(registry);

    const report = await health.check({
      capabilities: new Map(),
      missingRequired: ['orchestration'],
      missingOptional: []
    });

    expect(report.status).toBe('unhealthy');
    expect(health.hasRequiredFailures(report)).toBe(true);
  });

  test('reports degraded when optional capability is missing', async () => {
    const registry = new CapabilityRegistry({
      required: ['orchestration'],
      optional: ['plugins']
    });
    const health = new KernelHealth(registry);

    const report = await health.check({
      capabilities: new Map([
        ['orchestration', createCapability('orchestration', { healthCheck: () => 'healthy' })]
      ]),
      missingRequired: [],
      missingOptional: ['plugins']
    });

    expect(report.status).toBe('degraded');
    expect(health.hasRequiredFailures(report)).toBe(false);
  });

  test('marks required capability as unhealthy when health check throws', async () => {
    const registry = new CapabilityRegistry({ required: ['orchestration'], optional: [] });
    const health = new KernelHealth(registry);

    const report = await health.check({
      capabilities: new Map([
        [
          'orchestration',
          createCapability('orchestration', {
            healthCheck: () => {
              throw new Error('service unavailable');
            }
          })
        ]
      ]),
      missingRequired: [],
      missingOptional: []
    });

    expect(report.status).toBe('unhealthy');
    expect(report.capabilities[0]?.details).toBe('service unavailable');
  });

  test('treats capabilities without health check as healthy', async () => {
    const registry = new CapabilityRegistry({ required: ['orchestration'], optional: [] });
    const health = new KernelHealth(registry);

    const report = await health.check({
      capabilities: new Map([['orchestration', createCapability('orchestration')]]),
      missingRequired: [],
      missingOptional: []
    });

    expect(report.status).toBe('healthy');
    expect(report.capabilities[0]?.details).toBe('No health check provided');
  });
});
