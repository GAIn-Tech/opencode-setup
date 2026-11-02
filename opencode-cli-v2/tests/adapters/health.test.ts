import { describe, expect, test } from 'bun:test';

import {
  AdapterHealthChecker,
  normalizeAdapterHealthResult,
  resolveAdapterHealthStatus
} from '../../src/adapters/health';
import { TestAdapter } from './helpers';

describe('adapter health', () => {
  test('normalizes string and object health payloads', () => {
    expect(normalizeAdapterHealthResult('healthy')).toEqual({
      status: 'healthy'
    });

    expect(
      normalizeAdapterHealthResult({
        status: 'degraded',
        details: 'partial dependency outage'
      })
    ).toEqual({
      status: 'degraded',
      details: 'partial dependency outage'
    });
  });

  test('required unhealthy drives aggregate status to unhealthy', () => {
    const reportStatus = resolveAdapterHealthStatus([
      {
        adapter: 'orchestration',
        required: true,
        status: 'unhealthy'
      },
      {
        adapter: 'plugins',
        required: false,
        status: 'degraded'
      }
    ]);

    expect(reportStatus).toBe('unhealthy');
  });

  test('optional health-check exceptions degrade but do not crash checker', async () => {
    const checker = new AdapterHealthChecker();
    const optional = new TestAdapter('plugins', {
      required: false,
      healthCheck: () => {
        throw new Error('telemetry endpoint unavailable');
      }
    });

    await optional.runLoad();
    await optional.runInitialize();

    const entry = await checker.checkAdapter(optional);

    expect(entry.required).toBe(false);
    expect(entry.status).toBe('degraded');
  });
});
