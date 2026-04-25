import { describe, expect, test } from 'bun:test';

import { PackageAdapter } from '../../../src/adapters/base';
import { OpencodePtyPluginAdapter } from '../../../src/adapters/plugins/opencode-pty';

describe('OpencodePtyPluginAdapter', () => {
  test('extends package adapter and supports lifecycle', async () => {
    const adapter = new OpencodePtyPluginAdapter();

    expect(adapter).toBeInstanceOf(PackageAdapter);

    await adapter.runLoad();
    await adapter.runInitialize();

    const plugins = await adapter.getPort().listPlugins();
    expect(plugins[0]?.manifest.id).toBe('opencode-pty');

    const health = await adapter.runHealthCheck();
    expect(health.status).toBe('healthy');

    await adapter.runShutdown();
    expect(adapter.getStatus()).toBe('shutdown');
  });

  test('spawns PTY sessions and reads bootstrap output', async () => {
    const adapter = new OpencodePtyPluginAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const [spawn] = await adapter.getPort().runHook({
      name: 'pty.spawn',
      payload: {
        command: 'bash',
        args: ['-i'],
        cwd: '/tmp',
        cols: 100,
        rows: 30
      }
    });

    expect(spawn?.handled).toBe(true);
    expect(spawn?.output).toMatchObject({
      status: 'running',
      command: 'bash',
      args: ['-i'],
      cwd: '/tmp',
      cols: 100,
      rows: 30
    });

    const spawnOutput = spawn?.output as { sessionId?: string } | undefined;
    expect(typeof spawnOutput?.sessionId).toBe('string');
    expect(spawnOutput?.sessionId).not.toHaveLength(0);

    const [read] = await adapter.getPort().runHook({
      name: 'pty.read',
      payload: {
        sessionId: spawnOutput?.sessionId
      }
    });

    expect(read?.handled).toBe(true);
    expect(read?.output).toMatchObject({
      status: 'running',
      data: '',
      eof: false
    });
  });

  test('supports PTY write/read stream behavior', async () => {
    const adapter = new OpencodePtyPluginAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const [spawn] = await adapter.getPort().runHook({
      name: 'pty.spawn',
      payload: {
        command: 'python'
      }
    });

    const sessionId = (spawn?.output as { sessionId?: string } | undefined)?.sessionId;
    expect(sessionId).toBeDefined();

    const [write] = await adapter.getPort().runHook({
      name: 'pty.write',
      payload: {
        sessionId,
        data: 'print(42)\n'
      }
    });

    expect(write?.handled).toBe(true);
    expect(write?.output).toMatchObject({ status: 'running', bytesWritten: 10 });

    const [firstRead] = await adapter.getPort().runHook({
      name: 'pty.read',
      payload: {
        sessionId
      }
    });

    expect(firstRead?.handled).toBe(true);
    expect(firstRead?.output).toMatchObject({
      status: 'running',
      data: 'print(42)\n',
      eof: false
    });

    const [secondRead] = await adapter.getPort().runHook({
      name: 'pty.read',
      payload: {
        sessionId
      }
    });

    expect(secondRead?.handled).toBe(true);
    expect(secondRead?.output).toMatchObject({
      status: 'running',
      data: '',
      eof: false
    });
  });

  test('resizes PTY sessions', async () => {
    const adapter = new OpencodePtyPluginAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const [spawn] = await adapter.getPort().runHook({
      name: 'pty.spawn',
      payload: {
        command: 'bash'
      }
    });

    const sessionId = (spawn?.output as { sessionId?: string } | undefined)?.sessionId;

    const [resize] = await adapter.getPort().runHook({
      name: 'pty.resize',
      payload: {
        sessionId,
        cols: 120,
        rows: 40
      }
    });

    expect(resize?.handled).toBe(true);
    expect(resize?.output).toMatchObject({
      status: 'running',
      cols: 120,
      rows: 40
    });
  });

  test('kills PTY sessions and rejects writes afterwards', async () => {
    const adapter = new OpencodePtyPluginAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const [spawn] = await adapter.getPort().runHook({
      name: 'pty.spawn',
      payload: {
        command: 'vim'
      }
    });

    const sessionId = (spawn?.output as { sessionId?: string } | undefined)?.sessionId;

    const [kill] = await adapter.getPort().runHook({
      name: 'pty.kill',
      payload: {
        sessionId,
        signal: 'SIGTERM'
      }
    });

    expect(kill?.handled).toBe(true);
    expect(kill?.output).toMatchObject({
      status: 'exited',
      exitCode: 0,
      signal: 'SIGTERM'
    });

    const [writeAfterKill] = await adapter.getPort().runHook({
      name: 'pty.write',
      payload: {
        sessionId,
        data: ':q!\n'
      }
    });

    expect(writeAfterKill?.handled).toBe(false);
    expect(writeAfterKill?.error).toContain('Unknown PTY session');
  });
});
