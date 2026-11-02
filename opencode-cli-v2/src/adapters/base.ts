import {
  AdapterHealthCheckError,
  AdapterInitializationError,
  AdapterLoadError,
  AdapterNotInitializedError,
  AdapterShutdownError
} from './errors';
import type { AdapterHealthInput, AdapterHealthResult } from './health';
import { normalizeAdapterHealthResult } from './health';

export type AdapterStatus =
  | 'unloaded'
  | 'loading'
  | 'loaded'
  | 'initializing'
  | 'ready'
  | 'degraded'
  | 'unhealthy'
  | 'shutting_down'
  | 'shutdown'
  | 'failed';

/**
 * Base package adapter contract for legacy-package -> v2-port bridges.
 */
export abstract class PackageAdapter<TPort> {
  public abstract readonly name: string;
  public abstract readonly version: string;
  public abstract readonly portType: symbol;
  public abstract readonly required: boolean;

  protected port?: TPort;
  protected status: AdapterStatus = 'unloaded';
  protected lastError?: unknown;

  /**
   * Adapter-specific load stage.
   */
  public abstract load(): Promise<void>;

  /**
   * Adapter-specific initialization stage.
   */
  public abstract initialize(): Promise<void>;

  /**
   * Adapter-specific health-check stage.
   */
  public abstract healthCheck(): Promise<AdapterHealthInput>;

  /**
   * Adapter-specific shutdown stage.
   */
  public abstract shutdown(): Promise<void>;

  /**
   * Returns initialized port implementation.
   */
  public getPort(): TPort {
    if (!this.port) {
      throw new AdapterNotInitializedError(this.name);
    }

    return this.port;
  }

  public getStatus(): AdapterStatus {
    return this.status;
  }

  public getLastError(): unknown {
    return this.lastError;
  }

  /**
   * Managed load wrapper with status/error tracking.
   */
  public async runLoad(): Promise<void> {
    this.setStatus('loading');

    try {
      await this.load();
      this.setStatus('loaded');
    } catch (error: unknown) {
      this.setFailure(error);
      throw new AdapterLoadError(this.name, error);
    }
  }

  /**
   * Managed initialize wrapper with status/error tracking.
   */
  public async runInitialize(): Promise<void> {
    this.setStatus('initializing');

    try {
      await this.initialize();
      this.setStatus('ready');
    } catch (error: unknown) {
      this.setFailure(error);
      throw new AdapterInitializationError(this.name, error);
    }
  }

  /**
   * Managed health-check wrapper with status/error tracking.
   */
  public async runHealthCheck(): Promise<AdapterHealthResult> {
    try {
      const result = normalizeAdapterHealthResult(await this.healthCheck());
      this.setStatus(resolveStatusFromHealth(result.status));

      return result;
    } catch (error: unknown) {
      this.setFailure(error);
      throw new AdapterHealthCheckError(this.name, error);
    }
  }

  /**
   * Managed shutdown wrapper with status/error tracking.
   */
  public async runShutdown(): Promise<void> {
    this.setStatus('shutting_down');

    try {
      await this.shutdown();
      this.port = undefined;
      this.setStatus('shutdown');
    } catch (error: unknown) {
      this.setFailure(error);
      throw new AdapterShutdownError(this.name, error);
    }
  }

  /**
   * For adapter implementations to attach a port instance.
   */
  protected setPort(port: TPort): void {
    this.port = port;
  }

  protected setStatus(status: AdapterStatus): void {
    this.status = status;
  }

  protected setFailure(error: unknown): void {
    this.lastError = error;
    this.status = 'failed';
  }
}

function resolveStatusFromHealth(status: AdapterHealthResult['status']): AdapterStatus {
  if (status === 'healthy') {
    return 'ready';
  }

  if (status === 'degraded') {
    return 'degraded';
  }

  return 'unhealthy';
}
