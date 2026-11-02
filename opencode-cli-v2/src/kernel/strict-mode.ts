import { z } from 'zod';

import { MissingRequiredCapabilitiesError } from './errors';
import type { CapabilityName, BootstrapOptions, RequiredCapabilityName } from './types';
import type { CapabilityRegistry } from './registry';

const bootstrapOptionsSchema = z
  .object({
    degradedMode: z.boolean().optional().default(false)
  })
  .strict();

/**
 * Normalized bootstrap options.
 */
export interface NormalizedBootstrapOptions {
  readonly degradedMode: boolean;
  readonly mode: 'strict' | 'degraded';
}

/**
 * Parses and normalizes bootstrap options with strict validation.
 */
export function normalizeBootstrapOptions(options: BootstrapOptions = {}): NormalizedBootstrapOptions {
  const parsed = bootstrapOptionsSchema.parse(options);

  return {
    degradedMode: parsed.degradedMode,
    mode: parsed.degradedMode ? 'degraded' : 'strict'
  };
}

/**
 * Finds required capabilities that are not currently available.
 */
export function findMissingRequiredCapabilities(
  registry: CapabilityRegistry,
  availableCapabilities: Iterable<CapabilityName>
): RequiredCapabilityName[] {
  const available = new Set<CapabilityName>(availableCapabilities);

  return registry
    .getRequiredCapabilities()
    .filter((capability): capability is RequiredCapabilityName => !available.has(capability));
}

/**
 * Enforces strict-mode fail-fast behavior.
 */
export function enforceStrictMode(
  missingRequiredCapabilities: readonly RequiredCapabilityName[],
  options: NormalizedBootstrapOptions
): void {
  if (missingRequiredCapabilities.length > 0 && !options.degradedMode) {
    throw new MissingRequiredCapabilitiesError(missingRequiredCapabilities);
  }
}
