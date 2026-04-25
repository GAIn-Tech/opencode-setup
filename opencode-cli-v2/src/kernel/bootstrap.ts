import {
  CapabilityInitializationError,
  CapabilityLoadError,
  HealthCheckError
} from './errors';
import type { KernelHealth } from './health';
import type { CapabilityRegistry } from './registry';
import { enforceStrictMode, findMissingRequiredCapabilities, normalizeBootstrapOptions } from './strict-mode';
import type {
  BootstrapOptions,
  CapabilityName,
  CapabilityProviders,
  KernelBootstrapResult,
  KernelCapability,
  OptionalCapabilityName,
  RequiredCapabilityName
} from './types';
import type { KernelState } from './state';

/**
 * Dependency contract for bootstrap execution.
 */
export interface KernelBootstrapDependencies {
  readonly registry: CapabilityRegistry;
  readonly providers: CapabilityProviders;
  readonly state: KernelState;
  readonly health: KernelHealth;
}

/**
 * Strict-mode bootstrap orchestrator.
 */
export class KernelBootstrap {
  private readonly registry: CapabilityRegistry;
  private readonly providers: CapabilityProviders;
  private readonly state: KernelState;
  private readonly health: KernelHealth;

  public constructor(dependencies: KernelBootstrapDependencies) {
    this.registry = dependencies.registry;
    this.providers = dependencies.providers;
    this.state = dependencies.state;
    this.health = dependencies.health;
  }

  public async bootstrap(options: BootstrapOptions = {}): Promise<KernelBootstrapResult> {
    const normalizedOptions = normalizeBootstrapOptions(options);

    this.state.beginBootstrap(normalizedOptions.mode);

    try {
      return await this.bootstrapInternal(normalizedOptions.mode, normalizedOptions.degradedMode);
    } catch (error: unknown) {
      this.state.fail(error);
      throw error;
    }
  }

  private async bootstrapInternal(
    mode: 'strict' | 'degraded',
    degradedMode: boolean
  ): Promise<KernelBootstrapResult> {
    const loadedCapabilities = new Map<CapabilityName, KernelCapability>();
    const missingRequired = new Set<RequiredCapabilityName>();
    const missingOptional = new Set<OptionalCapabilityName>();

    const markMissingCapability = (capability: CapabilityName): void => {
      if (this.registry.isRequired(capability)) {
        missingRequired.add(capability);

        return;
      }

      if (this.registry.isOptional(capability)) {
        missingOptional.add(capability);
      }
    };

    for (const capabilityName of this.registry.getAllCapabilities()) {
      const provider = this.providers[capabilityName];

      if (!provider) {
        markMissingCapability(capabilityName);
        continue;
      }

      try {
        const capability = await provider({ mode });

        if (capability.name !== capabilityName) {
          throw new CapabilityLoadError(
            capabilityName,
            new Error(
              `Capability provider returned "${capability.name}" but expected "${capabilityName}"`
            )
          );
        }

        loadedCapabilities.set(capabilityName, capability);
      } catch (error: unknown) {
        if (this.registry.isRequired(capabilityName) && !degradedMode) {
          throw new CapabilityLoadError(capabilityName, error);
        }

        markMissingCapability(capabilityName);
      }
    }

    const missingAfterLoad = findMissingRequiredCapabilities(this.registry, loadedCapabilities.keys());

    for (const capability of missingAfterLoad) {
      missingRequired.add(capability);
    }

    enforceStrictMode([...missingRequired], { degradedMode, mode });

    const initializedCapabilities = new Map<CapabilityName, KernelCapability>();

    for (const [capabilityName, capability] of loadedCapabilities) {
      try {
        await capability.initialize({ mode });
        initializedCapabilities.set(capabilityName, capability);
      } catch (error: unknown) {
        if (this.registry.isRequired(capabilityName) && !degradedMode) {
          throw new CapabilityInitializationError(capabilityName, error);
        }

        markMissingCapability(capabilityName);
      }
    }

    const missingAfterInitialization = findMissingRequiredCapabilities(
      this.registry,
      initializedCapabilities.keys()
    );

    for (const capability of missingAfterInitialization) {
      missingRequired.add(capability);
    }

    enforceStrictMode([...missingRequired], { degradedMode, mode });

    this.state.setRuntime(initializedCapabilities, [...missingRequired], [...missingOptional]);

    const healthReport = await this.health.check({
      capabilities: initializedCapabilities,
      missingRequired: [...missingRequired],
      missingOptional: [...missingOptional]
    });

    if (mode === 'strict' && this.health.hasRequiredFailures(healthReport)) {
      throw new HealthCheckError(healthReport);
    }

    this.state.markReady(healthReport.status);

    return {
      mode,
      state: this.state.getSnapshot(),
      health: healthReport
    };
  }
}
