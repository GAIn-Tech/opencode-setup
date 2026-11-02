import { describe, expect, test } from 'bun:test';

import { PackageAdapter } from '../../../src/adapters/base';
import { AntigravityAuthPluginAdapter } from '../../../src/adapters/plugins/antigravity-auth';

const GET_ACCOUNT_HOOK = 'auth.antigravity.get-account';
const ROTATE_ACCOUNT_HOOK = 'auth.antigravity.rotate-account';
const RATE_LIMIT_HOOK = 'auth.antigravity.rate-limit';
const SESSION_RECOVERY_HOOK = 'auth.antigravity.session-recovery';

describe('AntigravityAuthPluginAdapter', () => {
  test('extends package adapter and supports lifecycle', async () => {
    const adapter = createAdapter({
      account_selection_strategy: 'round_robin'
    });

    expect(adapter).toBeInstanceOf(PackageAdapter);

    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();
    const plugins = await port.listPlugins();
    expect(plugins[0]?.manifest.id).toBe('antigravity-auth');

    const health = await adapter.runHealthCheck();
    expect(health.status).toBe('healthy');

    await adapter.runShutdown();
    expect(adapter.getStatus()).toBe('shutdown');
  });

  test('round_robin strategy rotates accounts in order', async () => {
    const adapter = createAdapter({ account_selection_strategy: 'round_robin' });
    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();

    const account1 = await getAccount(port, { forceRotate: true });
    const account2 = await getAccount(port, { forceRotate: true });
    const account3 = await getAccount(port, { forceRotate: true });

    expect([account1, account2, account3]).toEqual(['acc-a', 'acc-b', 'acc-c']);
  });

  test('least_used strategy chooses account with lowest quota pressure', async () => {
    const adapter = createAdapter({
      account_selection_strategy: 'least_used',
      accounts: [
        { id: 'acc-a', quotaLimit: 100, quotaUsed: 90, disabled: false, metadata: {} },
        { id: 'acc-b', quotaLimit: 100, quotaUsed: 20, disabled: false, metadata: {} },
        { id: 'acc-c', quotaLimit: 100, quotaUsed: 10, disabled: false, metadata: {} }
      ]
    });

    await adapter.runLoad();
    await adapter.runInitialize();

    const selected = await getAccount(adapter.getPort(), { forceRotate: true });
    expect(selected).toBe('acc-c');
  });

  test('hybrid strategy balances usage and request distribution', async () => {
    const adapter = createAdapter({
      account_selection_strategy: 'hybrid',
      accounts: [
        { id: 'acc-a', quotaLimit: 100, quotaUsed: 0, disabled: false, metadata: {} },
        { id: 'acc-b', quotaLimit: 100, quotaUsed: 0, disabled: false, metadata: {} }
      ]
    });

    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();
    const first = await getAccount(port, { forceRotate: true, requestedQuota: 1 });
    const second = await getAccount(port, { forceRotate: true, requestedQuota: 1 });

    expect(first).toBe('acc-a');
    expect(second).toBe('acc-b');
  });

  test('handles rate-limit hook with cooldown and auto-rotation', async () => {
    const adapter = createAdapter({ account_selection_strategy: 'round_robin' });
    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();
    const current = await getAccount(port, { sessionId: 'session-1' });
    expect(current).toBe('acc-a');

    const [rateLimit] = await port.runHook({
      name: RATE_LIMIT_HOOK,
      payload: {
        sessionId: 'session-1',
        accountId: 'acc-a',
        retryAfterSeconds: 120
      }
    });

    expect(rateLimit?.handled).toBe(true);
    expect(rateLimit?.output).toMatchObject({
      accountId: 'acc-a',
      cooldownSeconds: 120,
      switched: true,
      rotatedAccountId: 'acc-c'
    });

    const afterRateLimit = await getAccount(port, { sessionId: 'session-1' });
    expect(afterRateLimit).toBe('acc-c');
  });

  test('tracks quota consumption and avoids exhausted accounts', async () => {
    const adapter = createAdapter({
      account_selection_strategy: 'round_robin',
      accounts: [
        { id: 'acc-a', quotaLimit: 5, quotaUsed: 0, disabled: false, metadata: {} },
        { id: 'acc-b', quotaLimit: 5, quotaUsed: 0, disabled: false, metadata: {} }
      ]
    });

    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();
    const first = await getAccount(port, { forceRotate: true, requestedQuota: 5 });
    const second = await getAccount(port, { forceRotate: true, requestedQuota: 1 });

    expect(first).toBe('acc-a');
    expect(second).toBe('acc-b');
  });

  test('supports session recovery hook', async () => {
    const adapter = createAdapter({ account_selection_strategy: 'least_used' });
    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();

    const [recovered] = await port.runHook({
      name: SESSION_RECOVERY_HOOK,
      payload: {
        sessionId: 'recover-1',
        preferredAccountId: 'acc-c'
      }
    });

    expect(recovered?.handled).toBe(true);
    expect(recovered?.output).toMatchObject({
      recovered: true,
      sessionId: 'recover-1',
      accountId: 'acc-c'
    });

    const assigned = await getAccount(port, { sessionId: 'recover-1' });
    expect(assigned).toBe('acc-c');
  });
});

function createAdapter(
  overrides: Partial<{
    account_selection_strategy: 'round_robin' | 'least_used' | 'hybrid';
    soft_quota_threshold_percent: number;
    max_rate_limit_wait_seconds: number;
    switch_on_first_rate_limit: boolean;
    session_recovery: boolean;
    accounts: {
      id: string;
      quotaLimit: number;
      quotaUsed: number;
      disabled: boolean;
      metadata: Record<string, unknown>;
    }[];
  }> = {}
): AntigravityAuthPluginAdapter {
  return new AntigravityAuthPluginAdapter({
    loadConfig: () =>
      Promise.resolve({
        account_selection_strategy: overrides.account_selection_strategy ?? 'hybrid',
        soft_quota_threshold_percent: overrides.soft_quota_threshold_percent ?? 90,
        max_rate_limit_wait_seconds: overrides.max_rate_limit_wait_seconds ?? 300,
        switch_on_first_rate_limit: overrides.switch_on_first_rate_limit ?? true,
        session_recovery: overrides.session_recovery ?? true,
        accounts: overrides.accounts ?? [
          { id: 'acc-a', quotaLimit: 100, quotaUsed: 0, disabled: false, metadata: { email: 'a@test.dev' } },
          { id: 'acc-b', quotaLimit: 100, quotaUsed: 0, disabled: false, metadata: { email: 'b@test.dev' } },
          { id: 'acc-c', quotaLimit: 100, quotaUsed: 0, disabled: false, metadata: { email: 'c@test.dev' } }
        ]
      })
  });
}

async function getAccount(
  port: ReturnType<AntigravityAuthPluginAdapter['getPort']>,
  payload: Record<string, unknown>
): Promise<string> {
  const [result] = await port.runHook({ name: GET_ACCOUNT_HOOK, payload });
  expect(result?.handled).toBe(true);
  const output = result?.output as { accountId?: string } | undefined;
  expect(output?.accountId).toBeDefined();
  return output!.accountId!;
}

// Keep hook constants referenced to ensure typo-safe test coverage.
void ROTATE_ACCOUNT_HOOK;
