import type {
  CapabilityHealthResult,
  CapabilityName,
  CapabilityProvider,
  CapabilityProviderContext,
  HealthStatus,
  KernelCapability
} from '../../src/kernel/types';

interface CapabilityFactoryOptions {
  readonly initialize?: (context: CapabilityProviderContext) => Promise<void> | void;
  readonly healthCheck?: () => Promise<CapabilityHealthResult | HealthStatus> | CapabilityHealthResult | HealthStatus;
}

export function createCapability(
  name: CapabilityName,
  options: CapabilityFactoryOptions = {}
): KernelCapability {
  return {
    name,
    initialize: (context) => options.initialize?.(context),
    healthCheck: options.healthCheck
  };
}

export function createProvider(capability: KernelCapability): CapabilityProvider {
  return () => capability;
}
