import type { PackageAdapter } from './base';
import { RequiredAdapterError } from './errors';
import { AdapterHealthChecker } from './health';
import type { AdapterHealthReport } from './health';
import type { AdapterRegistry } from './registry';

export type AdapterLifecycleStage = 'load' | 'initialize' | 'shutdown';
export type AdapterLifecycleResultStatus = 'success' | 'failed';

/**
 * Result for a single adapter lifecycle stage.
 */
export interface AdapterLifecycleResult {
  readonly adapter: string;
  readonly required: boolean;
  readonly stage: AdapterLifecycleStage;
  readonly status: AdapterLifecycleResultStatus;
  readonly error?: unknown;
}

/**
 * Full lifecycle execution summary.
 */
export interface AdapterBootstrapSummary {
  readonly load: readonly AdapterLifecycleResult[];
  readonly initialize: readonly AdapterLifecycleResult[];
  readonly health: AdapterHealthReport;
}

/**
 * Lifecycle manager for all registered adapters.
 */
export class AdapterLifecycleManager {
  private readonly healthChecker = new AdapterHealthChecker();

  public constructor(private readonly registry: AdapterRegistry) {}

  public async loadAll(): Promise<AdapterLifecycleResult[]> {
    const results: AdapterLifecycleResult[] = [];

    for (const adapter of this.registry.list()) {
      try {
        await adapter.runLoad();
        results.push(this.createResult(adapter, 'load', 'success'));
      } catch (error: unknown) {
        results.push(this.createResult(adapter, 'load', 'failed', error));

        if (adapter.required) {
          throw new RequiredAdapterError(adapter.name, 'load', error);
        }
      }
    }

    return results;
  }

  public async initializeAll(): Promise<AdapterLifecycleResult[]> {
    const results: AdapterLifecycleResult[] = [];

    for (const adapter of this.registry.list()) {
      if (adapter.getStatus() !== 'loaded') {
        continue;
      }

      try {
        await adapter.runInitialize();
        results.push(this.createResult(adapter, 'initialize', 'success'));
      } catch (error: unknown) {
        results.push(this.createResult(adapter, 'initialize', 'failed', error));

        if (adapter.required) {
          throw new RequiredAdapterError(adapter.name, 'initialize', error);
        }
      }
    }

    return results;
  }

  public async healthCheckAll(): Promise<AdapterHealthReport> {
    const report = await this.healthChecker.checkAll(this.registry.list());
    const requiredFailures = report.adapters.filter(
      (entry) => entry.required && entry.status === 'unhealthy'
    );

    if (requiredFailures.length > 0) {
      throw new RequiredAdapterError(
        requiredFailures[0]?.adapter ?? 'unknown',
        'healthCheck',
        new Error(requiredFailures.map((entry) => entry.details ?? entry.adapter).join('; '))
      );
    }

    return report;
  }

  public async shutdownAll(): Promise<AdapterLifecycleResult[]> {
    const results: AdapterLifecycleResult[] = [];

    for (const adapter of [...this.registry.list()].reverse()) {
      try {
        await adapter.runShutdown();
        results.push(this.createResult(adapter, 'shutdown', 'success'));
      } catch (error: unknown) {
        results.push(this.createResult(adapter, 'shutdown', 'failed', error));
      }
    }

    return results;
  }

  public async bootstrap(): Promise<AdapterBootstrapSummary> {
    const load = await this.loadAll();
    const initialize = await this.initializeAll();
    const health = await this.healthCheckAll();

    return {
      load,
      initialize,
      health
    };
  }

  private createResult(
    adapter: PackageAdapter<unknown>,
    stage: AdapterLifecycleStage,
    status: AdapterLifecycleResultStatus,
    error?: unknown
  ): AdapterLifecycleResult {
    return {
      adapter: adapter.name,
      required: adapter.required,
      stage,
      status,
      error
    };
  }
}
