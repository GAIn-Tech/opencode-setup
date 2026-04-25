import { z } from 'zod';

import { PackageAdapter } from '../base';
import type { AdapterHealthInput } from '../health';
import type {
  HookEvent,
  HookResult,
  PluginHealth,
  PluginInstallRequest,
  PluginManifest,
  PluginRecord,
  PluginsPort
} from '../../ports/plugins';
import {
  PtyKillPayloadSchema,
  PtyKillResultSchema,
  PtyReadPayloadSchema,
  PtyReadResultSchema,
  PtyResizePayloadSchema,
  PtyResizeResultSchema,
  PtySpawnPayloadSchema,
  PtySpawnResultSchema,
  PtyWritePayloadSchema,
  PtyWriteResultSchema,
  resolvePtyHookName
} from './opencode-pty-mappings';

interface PtySession {
  readonly sessionId: string;
  readonly pid: number;
  readonly command: string;
  readonly args: string[];
  readonly cwd?: string;
  cols: number;
  rows: number;
  buffer: string;
  status: 'running' | 'exited';
}

export class OpencodePtyPluginAdapter extends PackageAdapter<PluginsPort> {
  public readonly name = 'opencode-pty';
  public readonly version = '1.0.0';
  public readonly portType = Symbol.for('plugins');
  public readonly required = true;

  private pluginRecord?: PluginRecord;
  private sessions = new Map<string, PtySession>();
  private sessionCounter = 0;

  public load(): Promise<void> {
    z
      .object({
        name: z.string().min(1),
        version: z.string().min(1),
        portType: z.symbol(),
        required: z.boolean()
      })
      .parse({
        name: this.name,
        version: this.version,
        portType: this.portType,
        required: this.required
      });

    return Promise.resolve();
  }

  public initialize(): Promise<void> {
    this.pluginRecord = {
      manifest: {
        id: this.name,
        name: this.name,
        version: this.version,
        description: 'opencode-pty plugin adapter',
        entrypoint: './src/adapters/plugins/opencode-pty.ts',
        hooks: ['pty.spawn', 'pty.write', 'pty.read', 'pty.resize', 'pty.kill'],
        capabilities: ['pty-management', 'interactive-process-control', 'terminal-emulation'],
        requiredPermissions: []
      },
      state: 'enabled',
      loadedAt: new Date().toISOString()
    };

    this.sessions = new Map<string, PtySession>();
    this.sessionCounter = 0;
    this.setPort(this.createPort());
    return Promise.resolve();
  }

  public healthCheck(): Promise<AdapterHealthInput> {
    if (!this.pluginRecord) {
      return Promise.resolve({ status: 'unhealthy', details: 'Plugin adapter is not initialized' });
    }

    return Promise.resolve({ status: 'healthy' });
  }

  public shutdown(): Promise<void> {
    this.pluginRecord = undefined;
    this.sessions.clear();
    this.sessionCounter = 0;
    return Promise.resolve();
  }

  private createPort(): PluginsPort {
    return {
      listPlugins: async () => (this.pluginRecord ? [this.pluginRecord] : []),
      installPlugin: async (_request: PluginInstallRequest): Promise<PluginManifest> => this.requirePlugin().manifest,
      uninstallPlugin: async () => {
        this.pluginRecord = undefined;
      },
      loadPlugin: async () => {},
      unloadPlugin: async () => {},
      enablePlugin: async () => {
        this.requirePlugin().state = 'enabled';
      },
      disablePlugin: async () => {
        this.requirePlugin().state = 'disabled';
      },
      runHook: async (event: HookEvent): Promise<HookResult[]> => [this.handleHook(event)],
      getPluginHealth: async (_pluginId: string): Promise<PluginHealth> => ({
        pluginId: this.name,
        status: this.pluginRecord ? 'healthy' : 'unhealthy',
        details: this.pluginRecord ? `activeSessions=${this.sessions.size}` : 'Plugin not initialized',
        checkedAt: new Date().toISOString()
      })
    };
  }

  private handleHook(event: HookEvent): HookResult {
    const hookName = resolvePtyHookName(event.name);
    if (!hookName) {
      return { pluginId: this.name, handled: false, error: `Unsupported hook: ${event.name}` };
    }

    try {
      if (hookName === 'pty.spawn') {
        const payload = PtySpawnPayloadSchema.parse(event.payload);
        const sessionId = `pty-${++this.sessionCounter}`;
        const pid = 10_000 + this.sessionCounter;

        this.sessions.set(sessionId, {
          sessionId,
          pid,
          command: payload.command,
          args: [...payload.args],
          cwd: payload.cwd,
          cols: payload.cols,
          rows: payload.rows,
          buffer: '',
          status: 'running'
        });

        return {
          pluginId: this.name,
          handled: true,
          output: PtySpawnResultSchema.parse({
            sessionId,
            pid,
            command: payload.command,
            args: payload.args,
            cwd: payload.cwd,
            cols: payload.cols,
            rows: payload.rows,
            status: 'running'
          })
        };
      }

      if (hookName === 'pty.write') {
        const payload = PtyWritePayloadSchema.parse(event.payload);
        const session = this.requireSession(payload.sessionId);
        session.buffer = `${session.buffer}${payload.data}`;

        return {
          pluginId: this.name,
          handled: true,
          output: PtyWriteResultSchema.parse({
            sessionId: session.sessionId,
            status: session.status,
            bytesWritten: payload.data.length
          })
        };
      }

      if (hookName === 'pty.read') {
        const payload = PtyReadPayloadSchema.parse(event.payload);
        const session = this.requireSession(payload.sessionId);

        let data = session.buffer;
        if (typeof payload.maxBytes === 'number' && payload.maxBytes > 0) {
          data = session.buffer.slice(0, payload.maxBytes);
          session.buffer = session.buffer.slice(payload.maxBytes);
        } else {
          session.buffer = '';
        }

        return {
          pluginId: this.name,
          handled: true,
          output: PtyReadResultSchema.parse({
            sessionId: session.sessionId,
            status: session.status,
            data,
            eof: false
          })
        };
      }

      if (hookName === 'pty.resize') {
        const payload = PtyResizePayloadSchema.parse(event.payload);
        const session = this.requireSession(payload.sessionId);
        session.cols = payload.cols;
        session.rows = payload.rows;

        return {
          pluginId: this.name,
          handled: true,
          output: PtyResizeResultSchema.parse({
            sessionId: session.sessionId,
            status: session.status,
            cols: session.cols,
            rows: session.rows
          })
        };
      }

      const payload = PtyKillPayloadSchema.parse(event.payload);
      const session = this.requireSession(payload.sessionId);
      this.sessions.delete(session.sessionId);

      return {
        pluginId: this.name,
        handled: true,
        output: PtyKillResultSchema.parse({
          sessionId: session.sessionId,
          status: 'exited',
          exitCode: 0,
          signal: payload.signal
        })
      };
    } catch (error: unknown) {
      return { pluginId: this.name, handled: false, error: this.toErrorMessage(error) };
    }
  }

  private requireSession(sessionId: string): PtySession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Unknown PTY session: ${sessionId}`);
    }

    return session;
  }

  private requirePlugin(): PluginRecord {
    return z
      .object({
        manifest: z.any(),
        state: z.enum(['discovered', 'installed', 'loaded', 'enabled', 'disabled', 'error'])
      })
      .parse(this.pluginRecord) as PluginRecord;
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
