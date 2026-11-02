import { describe, expect, test } from 'bun:test';

import {
  BootstrapError,
  CapabilityInitializationError,
  CapabilityLoadError,
  HealthCheckError,
  KernelError,
  MissingRequiredCapabilitiesError
} from '../../src/kernel/errors';

describe('kernel errors', () => {
  test('creates base kernel and bootstrap errors', () => {
    const kernelError = new KernelError('KERNEL_TEST', 'kernel failure');
    const bootstrapError = new BootstrapError('BOOTSTRAP_TEST', 'bootstrap failure');

    expect(kernelError.name).toBe('KernelError');
    expect(kernelError.code).toBe('KERNEL_TEST');
    expect(bootstrapError.name).toBe('BootstrapError');
    expect(bootstrapError.code).toBe('BOOTSTRAP_TEST');
  });

  test('stores missing required capability details', () => {
    const error = new MissingRequiredCapabilitiesError(['skills']);

    expect(error.code).toBe('KERNEL_MISSING_REQUIRED_CAPABILITIES');
    expect(error.missingCapabilities).toEqual(['skills']);
    expect(error.message).toContain('--degraded-mode');
  });

  test('stores capability context for load and initialization failures', () => {
    const loadError = new CapabilityLoadError('routing', new Error('load failed'));
    const initError = new CapabilityInitializationError('budget', new Error('init failed'));

    expect(loadError.capability).toBe('routing');
    expect(loadError.code).toBe('KERNEL_CAPABILITY_LOAD_FAILED');
    expect(initError.capability).toBe('budget');
    expect(initError.code).toBe('KERNEL_CAPABILITY_INIT_FAILED');
  });

  test('stores health report in health check error', () => {
    const report = {
      status: 'unhealthy',
      checkedAt: '2026-01-01T00:00:00.000Z',
      capabilities: [
        {
          capability: 'orchestration',
          required: true,
          status: 'unhealthy',
          details: 'missing'
        }
      ]
    } as const;

    const error = new HealthCheckError(report);

    expect(error.code).toBe('KERNEL_HEALTH_CHECK_FAILED');
    expect(error.report).toEqual(report);
  });
});
