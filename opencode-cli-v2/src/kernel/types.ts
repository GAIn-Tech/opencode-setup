/**
 * Canonical capability names supported by the kernel bootstrap system.
 */
export const CAPABILITIES = [
  'orchestration',
  'routing',
  'budget',
  'skills',
  'learning',
  'plugins',
  'mcp'
] as const;

/**
 * Required capabilities for strict-mode startup.
 */
export const REQUIRED_CAPABILITIES = ['orchestration', 'routing', 'budget', 'skills'] as const;

/**
 * Optional capabilities that may be absent during degraded-mode startup.
 */
export const OPTIONAL_CAPABILITIES = ['learning', 'plugins', 'mcp'] as const;

export type CapabilityName = (typeof CAPABILITIES)[number];
export type RequiredCapabilityName = (typeof REQUIRED_CAPABILITIES)[number];
export type OptionalCapabilityName = (typeof OPTIONAL_CAPABILITIES)[number];

/**
 * Kernel execution mode.
 */
export type KernelMode = 'strict' | 'degraded';

/**
 * Runtime lifecycle phase.
 */
export type KernelPhase = 'idle' | 'bootstrapping' | 'running' | 'degraded' | 'failed';

/**
 * Health state used by capability and kernel checks.
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

/**
 * Bootstrap options accepted by the kernel.
 */
export interface BootstrapOptions {
  /**
   * When true, allows startup with missing required capabilities.
   */
  readonly degradedMode?: boolean;
}

/**
 * Shared context passed to providers and capabilities.
 */
export interface CapabilityProviderContext {
  readonly mode: KernelMode;
}

/**
 * Structured health-check payload returned by capabilities.
 */
export interface CapabilityHealthResult {
  readonly status: HealthStatus;
  readonly details?: string;
}

/**
 * Runtime capability contract.
 */
export interface KernelCapability {
  readonly name: CapabilityName;
  initialize(context: CapabilityProviderContext): Promise<void> | void;
  healthCheck?():
    | Promise<CapabilityHealthResult | HealthStatus>
    | CapabilityHealthResult
    | HealthStatus;
}

/**
 * Dependency-injected capability provider.
 */
export type CapabilityProvider = (
  context: CapabilityProviderContext
) => Promise<KernelCapability> | KernelCapability;

/**
 * Provider map used by the kernel composition root.
 */
export type CapabilityProviders = Partial<Record<CapabilityName, CapabilityProvider>>;

/**
 * Observable runtime snapshot.
 */
export interface KernelStateSnapshot {
  readonly phase: KernelPhase;
  readonly mode: KernelMode;
  readonly activeCapabilities: readonly CapabilityName[];
  readonly missingRequiredCapabilities: readonly RequiredCapabilityName[];
  readonly missingOptionalCapabilities: readonly OptionalCapabilityName[];
  readonly lastError?: string;
}

/**
 * Health details for a single capability.
 */
export interface CapabilityHealthEntry {
  readonly capability: CapabilityName;
  readonly required: boolean;
  readonly status: HealthStatus;
  readonly details?: string;
}

/**
 * Full kernel health report.
 */
export interface KernelHealthReport {
  readonly status: HealthStatus;
  readonly checkedAt: string;
  readonly capabilities: readonly CapabilityHealthEntry[];
}

/**
 * Bootstrap response payload.
 */
export interface KernelBootstrapResult {
  readonly mode: KernelMode;
  readonly state: KernelStateSnapshot;
  readonly health: KernelHealthReport;
}
