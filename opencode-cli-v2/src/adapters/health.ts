import type { PackageAdapter } from './base';
import { AdapterHealthCheckError } from './errors';

export type AdapterHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Structured health-check payload for adapters.
 */
export interface AdapterHealthResult {
  readonly status: AdapterHealthStatus;
  readonly details?: string;
}

/**
 * Health entry for a single adapter.
 */
export interface AdapterHealthEntry {
  readonly adapter: string;
  readonly required: boolean;
  readonly status: AdapterHealthStatus;
  readonly details?: string;
}

/**
 * Aggregate health report across all adapters.
 */
export interface AdapterHealthReport {
  readonly status: AdapterHealthStatus;
  readonly checkedAt: string;
  readonly adapters: readonly AdapterHealthEntry[];
}

/**
 * Health check contract accepted from adapter implementations.
 */
export type AdapterHealthInput = AdapterHealthStatus | AdapterHealthResult;

/**
 * Normalizes a health payload into a structured object.
 */
export function normalizeAdapterHealthResult(input: AdapterHealthInput): AdapterHealthResult {
  if (typeof input === 'string') {
    return {
      status: input
    };
  }

  return input;
}

/**
 * Resolves aggregate status from individual adapter statuses.
 */
export function resolveAdapterHealthStatus(
  entries: readonly AdapterHealthEntry[]
): AdapterHealthStatus {
  const hasRequiredFailure = entries.some((entry) => entry.required && entry.status === 'unhealthy');

  if (hasRequiredFailure) {
    return 'unhealthy';
  }

  const hasAnyDegradation = entries.some((entry) => entry.status !== 'healthy');

  if (hasAnyDegradation) {
    return 'degraded';
  }

  return 'healthy';
}

/**
 * Adapter health checker service.
 */
export class AdapterHealthChecker {
  public async checkAdapter(adapter: PackageAdapter<unknown>): Promise<AdapterHealthEntry> {
    try {
      const result = await adapter.runHealthCheck();

      return {
        adapter: adapter.name,
        required: adapter.required,
        status: result.status,
        details: result.details
      };
    } catch (error: unknown) {
      const normalizedError = new AdapterHealthCheckError(adapter.name, error);

      return {
        adapter: adapter.name,
        required: adapter.required,
        status: adapter.required ? 'unhealthy' : 'degraded',
        details: normalizedError.message
      };
    }
  }

  public async checkAll(adapters: readonly PackageAdapter<unknown>[]): Promise<AdapterHealthReport> {
    const entries: AdapterHealthEntry[] = [];

    for (const adapter of adapters) {
      entries.push(await this.checkAdapter(adapter));
    }

    return {
      status: resolveAdapterHealthStatus(entries),
      checkedAt: new Date().toISOString(),
      adapters: entries
    };
  }
}
