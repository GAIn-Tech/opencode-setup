import { KernelBootstrap } from './bootstrap';
import { KernelHealth } from './health';
import { createDefaultCapabilityRegistry } from './registry';
import type { CapabilityRegistry } from './registry';
import { KernelState } from './state';
import type {
  BootstrapOptions,
  CapabilityProviders,
  KernelBootstrapResult,
  KernelHealthReport,
  KernelStateSnapshot
} from './types';

/**
 * Dependency injection container for the kernel composition root.
 */
export interface KernelDependencies {
  readonly providers: CapabilityProviders;
  readonly registry?: CapabilityRegistry;
  readonly state?: KernelState;
  readonly health?: KernelHealth;
}

/**
 * Kernel composition root.
 */
export class Kernel {
  private readonly state: KernelState;
  private readonly health: KernelHealth;
  private readonly bootstrapper: KernelBootstrap;

  public constructor(dependencies: KernelDependencies) {
    const registry = dependencies.registry ?? createDefaultCapabilityRegistry();

    this.state = dependencies.state ?? new KernelState();
    this.health = dependencies.health ?? new KernelHealth(registry);
    this.bootstrapper = new KernelBootstrap({
      registry,
      providers: dependencies.providers,
      state: this.state,
      health: this.health
    });
  }

  public async bootstrap(options: BootstrapOptions = {}): Promise<KernelBootstrapResult> {
    return this.bootstrapper.bootstrap(options);
  }

  public getState(): KernelStateSnapshot {
    return this.state.getSnapshot();
  }

  public async healthCheck(): Promise<KernelHealthReport> {
    return this.health.check({
      capabilities: this.state.getCapabilities(),
      missingRequired: this.state.getMissingRequiredCapabilities(),
      missingOptional: this.state.getMissingOptionalCapabilities()
    });
  }
}

/**
 * Factory for a fully-wired kernel instance.
 */
export function createKernel(dependencies: KernelDependencies): Kernel {
  return new Kernel(dependencies);
}

export * from './bootstrap';
export * from './errors';
export * from './health';
export * from './registry';
export * from './state';
export * from './strict-mode';
export * from './types';
