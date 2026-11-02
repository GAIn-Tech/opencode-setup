import { describe, expect, test } from 'bun:test';

import { PackageAdapter } from '../../../src/adapters/base';
import { NotifierPluginAdapter } from '../../../src/adapters/plugins/notifier';

const HOOK_NOTIFY_SEND = 'notify.send';
const HOOK_NOTIFY_CONFIGURE = 'notify.configure';
const HOOK_NOTIFY_GET_HISTORY = 'notify.get-history';
const HOOK_NOTIFY_CLEAR_HISTORY = 'notify.clear-history';

describe('NotifierPluginAdapter', () => {
  test('extends package adapter and supports lifecycle', async () => {
    const adapter = createAdapter();

    expect(adapter).toBeInstanceOf(PackageAdapter);

    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();
    const plugins = await port.listPlugins();
    expect(plugins[0]?.manifest.id).toBe('notifier');

    const health = await adapter.runHealthCheck();
    expect(health.status).toBe('healthy');

    await adapter.runShutdown();
    expect(adapter.getStatus()).toBe('shutdown');
  });

  test('dispatches OS notifications and tracks history', async () => {
    const sent: Record<string, unknown>[] = [];
    const adapter = createAdapter({
      dispatch: async (notification) => {
        sent.push(notification as Record<string, unknown>);
      }
    });

    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();

    const [result] = await port.runHook({
      name: HOOK_NOTIFY_SEND,
      payload: {
        event: 'agent.completed',
        level: 'success',
        title: 'Agent completed',
        message: 'sisyphus-junior completed implementation',
        metadata: { sessionId: 's-1' }
      }
    });

    expect(result?.handled).toBe(true);
    expect(result?.output).toMatchObject({
      dispatched: true,
      platform: 'win32',
      event: 'agent.completed'
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      title: 'Agent completed',
      message: 'sisyphus-junior completed implementation',
      level: 'success',
      platform: 'win32'
    });

    const [historyResult] = await port.runHook({
      name: HOOK_NOTIFY_GET_HISTORY,
      payload: {}
    });

    expect(historyResult?.handled).toBe(true);
    expect(historyResult?.output).toMatchObject({ count: 1 });
    const output = historyResult?.output as { history?: Record<string, unknown>[] } | undefined;
    expect(output?.history?.[0]).toMatchObject({
      event: 'agent.completed',
      dispatched: true,
      title: 'Agent completed'
    });
  });

  test('applies notification rules configured at runtime', async () => {
    const sent: Record<string, unknown>[] = [];
    const adapter = createAdapter({
      dispatch: async (notification) => {
        sent.push(notification as Record<string, unknown>);
      }
    });

    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();

    const [configure] = await port.runHook({
      name: HOOK_NOTIFY_CONFIGURE,
      payload: {
        rules: [
          {
            id: 'mute-success',
            enabled: false,
            event: 'agent.completed'
          }
        ]
      }
    });

    expect(configure?.handled).toBe(true);
    expect(configure?.output).toMatchObject({
      ruleCount: 1
    });

    const [blocked] = await port.runHook({
      name: HOOK_NOTIFY_SEND,
      payload: {
        event: 'agent.completed',
        level: 'success',
        title: 'Should be muted',
        message: 'This notification should not dispatch'
      }
    });

    expect(blocked?.handled).toBe(true);
    expect(blocked?.output).toMatchObject({
      dispatched: false,
      reason: 'blocked_by_rule'
    });
    expect(sent).toHaveLength(0);

    const [allowed] = await port.runHook({
      name: HOOK_NOTIFY_SEND,
      payload: {
        event: 'agent.failed',
        level: 'error',
        title: 'Agent failed',
        message: 'Failure should still dispatch'
      }
    });

    expect(allowed?.handled).toBe(true);
    expect(allowed?.output).toMatchObject({ dispatched: true, event: 'agent.failed' });
    expect(sent).toHaveLength(1);
  });

  test('clears notification history via hook', async () => {
    const adapter = createAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();

    await port.runHook({
      name: HOOK_NOTIFY_SEND,
      payload: {
        event: 'agent.completed',
        level: 'success',
        title: 'A',
        message: 'B'
      }
    });

    const [beforeClear] = await port.runHook({
      name: HOOK_NOTIFY_GET_HISTORY,
      payload: {}
    });
    expect(beforeClear?.output).toMatchObject({ count: 1 });

    const [clear] = await port.runHook({
      name: HOOK_NOTIFY_CLEAR_HISTORY,
      payload: {}
    });
    expect(clear?.handled).toBe(true);
    expect(clear?.output).toMatchObject({ cleared: 1 });

    const [afterClear] = await port.runHook({
      name: HOOK_NOTIFY_GET_HISTORY,
      payload: {}
    });
    expect(afterClear?.output).toMatchObject({ count: 0, history: [] });
  });
});

function createAdapter(options?: {
  platform?: 'win32' | 'darwin' | 'linux';
  dispatch?: (notification: unknown) => Promise<void> | void;
}): NotifierPluginAdapter {
  return new NotifierPluginAdapter({
    getPlatform: () => options?.platform ?? 'win32',
    dispatchNotification: options?.dispatch,
    loadConfig: async () => ({
      notifier: {
        defaultTitle: 'OpenCode',
        historyLimit: 50,
        rules: [
          { id: 'completed-default', enabled: true, event: 'agent.completed' },
          { id: 'failed-default', enabled: true, event: 'agent.failed' }
        ]
      }
    })
  });
}

// Keep constants referenced for typo-safe test coverage.
void HOOK_NOTIFY_CONFIGURE;
