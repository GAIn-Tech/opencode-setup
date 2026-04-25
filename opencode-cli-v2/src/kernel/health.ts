import { z } from 'zod';

import type { CapabilityRegistry } from './registry';
import type {
  CapabilityHealthEntry,
  CapabilityHealthResult,
  CapabilityName,
  HealthStatus,
  KernelCapability,
  KernelHealthReport,
  OptionalCapabilityName,
  RequiredCapabilityName
} from './types';

const healthStatusSchema = z.enum(['healthy', 'degraded', 'unhealthy']);
const capabilityHealthResultSchema = z.object({
  status: healthStatusSchema,
  details: z.string().optional()
});

/**
 * Input payload for kernel health checks.
 */
export interface HealthCheckInput {
  readonly capabilities: ReadonlyMap<CapabilityName, KernelCapability>;
  readonly missingRequired: readonly RequiredCapabilityName[];
  readonly missingOptional: readonly OptionalCapabilityName[];
}

/**
 * Health-check service for capability and kernel status.
 */
export class KernelHealth {
  public constructor(private readonly registry: CapabilityRegistry) {}

  public async check(input: HealthCheckInput): Promise<KernelHealthReport> {
    const missingRequired = new Set(input.missingRequired);
    const missingOptional = new Set(input.missingOptional);
    const capabilityEntries: CapabilityHealthEntry[] = [];

    for (const capability of this.registry.getRequiredCapabilities()) {
      const loadedCapability = input.capabilities.get(capability);

      if (missingRequired.has(capability) || !loadedCapability) {
        capabilityEntries.push({
          capability,
          required: true,
          status: 'unhealthy',
          details: 'Missing required capability'
        });

        continue;
      }

      capabilityEntries.push(await this.checkCapability(capability, true, loadedCapability));
    }

    for (const capability of this.registry.getOptionalCapabilities()) {
      const loadedCapability = input.capabilities.get(capability);

      if (missingOptional.has(capability) || !loadedCapability) {
        capabilityEntries.push({
          capability,
          required: false,
          status: 'degraded',
          details: 'Optional capability not loaded'
        });

        continue;
      }

      capabilityEntries.push(await this.checkCapability(capability, false, loadedCapability));
    }

    return {
      status: resolveKernelHealthStatus(capabilityEntries),
      checkedAt: new Date().toISOString(),
      capabilities: capabilityEntries
    };
  }

  public hasRequiredFailures(report: KernelHealthReport): boolean {
    return report.capabilities.some((entry) => entry.required && entry.status !== 'healthy');
  }

  private async checkCapability(
    capability: CapabilityName,
    required: boolean,
    loadedCapability: KernelCapability
  ): Promise<CapabilityHealthEntry> {
    if (!loadedCapability.healthCheck) {
      return {
        capability,
        required,
        status: 'healthy',
        details: 'No health check provided'
      };
    }

    try {
      const rawResult = await loadedCapability.healthCheck();
      const normalizedResult = normalizeCapabilityHealthResult(rawResult);

      return {
        capability,
        required,
        status: normalizedResult.status,
        details: normalizedResult.details
      };
    } catch (error: unknown) {
      return {
        capability,
        required,
        status: required ? 'unhealthy' : 'degraded',
        details: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

function normalizeCapabilityHealthResult(
  result: CapabilityHealthResult | HealthStatus
): CapabilityHealthResult {
  if (typeof result === 'string') {
    return {
      status: healthStatusSchema.parse(result)
    };
  }

  return capabilityHealthResultSchema.parse(result);
}

function resolveKernelHealthStatus(capabilityEntries: readonly CapabilityHealthEntry[]): HealthStatus {
  const hasRequiredFailure = capabilityEntries.some(
    (entry) => entry.required && entry.status !== 'healthy'
  );

  if (hasRequiredFailure) {
    return 'unhealthy';
  }

  const hasAnyDegradation = capabilityEntries.some((entry) => entry.status !== 'healthy');

  if (hasAnyDegradation) {
    return 'degraded';
  }

  return 'healthy';
}
