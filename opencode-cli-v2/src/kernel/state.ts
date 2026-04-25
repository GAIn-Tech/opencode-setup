import type {
  CapabilityName,
  HealthStatus,
  KernelCapability,
  KernelMode,
  KernelPhase,
  KernelStateSnapshot,
  OptionalCapabilityName,
  RequiredCapabilityName
} from './types';

/**
 * Runtime state manager for kernel lifecycle and capability availability.
 */
export class KernelState {
  private phase: KernelPhase = 'idle';
  private mode: KernelMode = 'strict';
  private lastError: string | undefined;
  private activeCapabilities = new Map<CapabilityName, KernelCapability>();
  private missingRequiredCapabilities = new Set<RequiredCapabilityName>();
  private missingOptionalCapabilities = new Set<OptionalCapabilityName>();

  public beginBootstrap(mode: KernelMode): void {
    this.mode = mode;
    this.lastError = undefined;
    this.activeCapabilities = new Map<CapabilityName, KernelCapability>();
    this.missingRequiredCapabilities = new Set<RequiredCapabilityName>();
    this.missingOptionalCapabilities = new Set<OptionalCapabilityName>();
    this.phase = 'bootstrapping';
  }

  public setRuntime(
    activeCapabilities: ReadonlyMap<CapabilityName, KernelCapability>,
    missingRequiredCapabilities: readonly RequiredCapabilityName[],
    missingOptionalCapabilities: readonly OptionalCapabilityName[]
  ): void {
    this.activeCapabilities = new Map(activeCapabilities);
    this.missingRequiredCapabilities = new Set(missingRequiredCapabilities);
    this.missingOptionalCapabilities = new Set(missingOptionalCapabilities);
  }

  public markReady(healthStatus: HealthStatus): void {
    if (healthStatus === 'healthy') {
      this.phase = 'running';

      return;
    }

    this.phase = 'degraded';
  }

  public fail(error: unknown): void {
    this.lastError = error instanceof Error ? error.message : String(error);
    this.phase = 'failed';
  }

  public getCapabilities(): ReadonlyMap<CapabilityName, KernelCapability> {
    return this.activeCapabilities;
  }

  public getMissingRequiredCapabilities(): readonly RequiredCapabilityName[] {
    return [...this.missingRequiredCapabilities];
  }

  public getMissingOptionalCapabilities(): readonly OptionalCapabilityName[] {
    return [...this.missingOptionalCapabilities];
  }

  public getSnapshot(): KernelStateSnapshot {
    return {
      phase: this.phase,
      mode: this.mode,
      activeCapabilities: [...this.activeCapabilities.keys()],
      missingRequiredCapabilities: this.getMissingRequiredCapabilities(),
      missingOptionalCapabilities: this.getMissingOptionalCapabilities(),
      lastError: this.lastError
    };
  }

}
