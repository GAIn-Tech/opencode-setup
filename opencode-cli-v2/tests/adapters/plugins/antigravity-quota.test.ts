import { describe, expect, test } from 'bun:test';

import { PackageAdapter } from '../../../src/adapters/base';
import { AntigravityQuotaPluginAdapter } from '../../../src/adapters/plugins/antigravity-quota';

const GET_STATUS_HOOK = 'quota.get-status';
const LIST_ACCOUNTS_HOOK = 'quota.list-accounts';
const GET_HISTORY_HOOK = 'quota.get-history';
const CHECK_THRESHOLDS_HOOK = 'quota.check-thresholds';

describe('AntigravityQuotaPluginAdapter', () => {
  test('extends package adapter and supports lifecycle', async () => {
    const adapter = createAdapter();

    expect(adapter).toBeInstanceOf(PackageAdapter);

    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();
    const plugins = await port.listPlugins();
    expect(plugins[0]?.manifest.id).toBe('antigravity-quota');

    const health = await adapter.runHealthCheck();
    expect(health.status).toBe('healthy');

    await adapter.runShutdown();
    expect(adapter.getStatus()).toBe('shutdown');
  });

  test('tracks quota usage and returns per-account + aggregate status', async () => {
    const adapter = createAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();
    const [result] = await port.runHook({
      name: GET_STATUS_HOOK,
      payload: {
        accountId: 'acc-a',
        reportedUsage: {
          amount: 20,
          source: 'antigravity-auth'
        }
      }
    });

    expect(result?.handled).toBe(true);
    const output = result?.output as
      | {
          account?: {
            accountId: string;
            quotaUsed: number;
            remainingQuota: number;
            utilizationPercent: number;
          };
          aggregate?: {
            totalUsed: number;
            totalLimit: number;
            totalRemaining: number;
          };
        }
      | undefined;

    expect(output?.account?.accountId).toBe('acc-a');
    expect(output?.account?.quotaUsed).toBe(30);
    expect(output?.account?.remainingQuota).toBe(70);
    expect(output?.account?.utilizationPercent).toBe(30);
    expect(output?.aggregate).toMatchObject({
      totalUsed: 50,
      totalLimit: 300,
      totalRemaining: 250
    });
  });

  test('lists accounts with sorting and disabled filtering', async () => {
    const adapter = createAdapter({
      accounts: [
        { id: 'acc-a', quotaLimit: 100, quotaUsed: 80, disabled: false, metadata: { email: 'a@test.dev' } },
        { id: 'acc-b', quotaLimit: 100, quotaUsed: 10, disabled: true, metadata: { email: 'b@test.dev' } },
        { id: 'acc-c', quotaLimit: 100, quotaUsed: 30, disabled: false, metadata: { email: 'c@test.dev' } }
      ]
    });

    await adapter.runLoad();
    await adapter.runInitialize();

    const [result] = await adapter.getPort().runHook({
      name: LIST_ACCOUNTS_HOOK,
      payload: {
        includeDisabled: false,
        sortBy: 'usage'
      }
    });

    expect(result?.handled).toBe(true);
    const output = result?.output as { accounts?: { accountId: string }[] } | undefined;
    expect(output?.accounts?.map((account) => account.accountId)).toEqual(['acc-a', 'acc-c']);
  });

  test('returns usage history and supports account filtering', async () => {
    const adapter = createAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();

    await port.runHook({
      name: GET_STATUS_HOOK,
      payload: { accountId: 'acc-a', reportedUsage: { amount: 5, source: 'request-1' } }
    });
    await port.runHook({
      name: GET_STATUS_HOOK,
      payload: { accountId: 'acc-b', reportedUsage: { amount: 12, source: 'request-2' } }
    });
    await port.runHook({
      name: GET_STATUS_HOOK,
      payload: { accountId: 'acc-a', reportedUsage: { amount: 8, source: 'request-3' } }
    });

    const [result] = await port.runHook({
      name: GET_HISTORY_HOOK,
      payload: {
        accountId: 'acc-a',
        limit: 10
      }
    });

    expect(result?.handled).toBe(true);
    const output = result?.output as
      | {
          events?: Array<{ accountId: string; deltaQuota: number; source?: string }>;
          totalEvents?: number;
        }
      | undefined;

    expect(output?.totalEvents).toBe(2);
    expect(output?.events?.map((event) => event.accountId)).toEqual(['acc-a', 'acc-a']);
    expect(output?.events?.[0]?.deltaQuota).toBe(8);
    expect(output?.events?.[0]?.source).toBe('request-3');
  });

  test('detects warning and critical threshold alerts', async () => {
    const adapter = createAdapter({
      thresholds: {
        warningPercent: 70,
        criticalPercent: 90
      },
      accounts: [
        { id: 'acc-a', quotaLimit: 100, quotaUsed: 95, disabled: false, metadata: {} },
        { id: 'acc-b', quotaLimit: 100, quotaUsed: 75, disabled: false, metadata: {} },
        { id: 'acc-c', quotaLimit: 100, quotaUsed: 40, disabled: false, metadata: {} }
      ]
    });

    await adapter.runLoad();
    await adapter.runInitialize();

    const [result] = await adapter.getPort().runHook({
      name: CHECK_THRESHOLDS_HOOK,
      payload: {}
    });

    expect(result?.handled).toBe(true);
    const output = result?.output as
      | {
          hasAlerts?: boolean;
          criticalCount?: number;
          warningCount?: number;
          alerts?: Array<{ accountId: string; level: string }>;
        }
      | undefined;

    expect(output?.hasAlerts).toBe(true);
    expect(output?.criticalCount).toBe(1);
    expect(output?.warningCount).toBe(1);
    expect(output?.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: 'acc-a', level: 'critical' }),
        expect.objectContaining({ accountId: 'acc-b', level: 'warning' })
      ])
    );
  });
});

function createAdapter(
  overrides: Partial<{
    historyLimit: number;
    thresholds: {
      warningPercent: number;
      criticalPercent: number;
    };
    accounts: {
      id: string;
      quotaLimit: number;
      quotaUsed: number;
      disabled: boolean;
      metadata: Record<string, unknown>;
    }[];
  }> = {}
): AntigravityQuotaPluginAdapter {
  return new AntigravityQuotaPluginAdapter({
    loadConfig: () =>
      Promise.resolve({
        historyLimit: overrides.historyLimit ?? 200,
        thresholds: overrides.thresholds ?? {
          warningPercent: 75,
          criticalPercent: 90
        },
        accounts: overrides.accounts ?? [
          { id: 'acc-a', quotaLimit: 100, quotaUsed: 10, disabled: false, metadata: { email: 'a@test.dev' } },
          { id: 'acc-b', quotaLimit: 100, quotaUsed: 20, disabled: false, metadata: { email: 'b@test.dev' } },
          { id: 'acc-c', quotaLimit: 100, quotaUsed: 0, disabled: false, metadata: { email: 'c@test.dev' } }
        ]
      })
  });
}
