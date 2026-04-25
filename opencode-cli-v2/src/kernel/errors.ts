import type { KernelHealthReport, RequiredCapabilityName } from './types';

/**
 * Base kernel error.
 */
export class KernelError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'KernelError';
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Bootstrap-stage base error.
 */
export class BootstrapError extends KernelError {
  public constructor(code: string, message: string, cause?: unknown) {
    super(code, message, cause);
    this.name = 'BootstrapError';
  }
}

/**
 * Thrown when strict mode is active and required capabilities are missing.
 */
export class MissingRequiredCapabilitiesError extends BootstrapError {
  public readonly missingCapabilities: readonly RequiredCapabilityName[];

  public constructor(missingCapabilities: readonly RequiredCapabilityName[]) {
    super(
      'KERNEL_MISSING_REQUIRED_CAPABILITIES',
      `Missing required capabilities: ${missingCapabilities.join(', ')}\nUse --degraded-mode to allow partial startup`
    );

    this.name = 'MissingRequiredCapabilitiesError';
    this.missingCapabilities = [...missingCapabilities];
  }
}

/**
 * Thrown when a capability provider fails to load.
 */
export class CapabilityLoadError extends BootstrapError {
  public readonly capability: string;

  public constructor(capability: string, cause?: unknown) {
    super('KERNEL_CAPABILITY_LOAD_FAILED', `Failed to load capability: ${capability}`, cause);

    this.name = 'CapabilityLoadError';
    this.capability = capability;
  }
}

/**
 * Thrown when a loaded capability fails during initialization.
 */
export class CapabilityInitializationError extends BootstrapError {
  public readonly capability: string;

  public constructor(capability: string, cause?: unknown) {
    super(
      'KERNEL_CAPABILITY_INIT_FAILED',
      `Failed to initialize capability: ${capability}`,
      cause
    );

    this.name = 'CapabilityInitializationError';
    this.capability = capability;
  }
}

/**
 * Thrown when strict mode detects required capability health failures.
 */
export class HealthCheckError extends BootstrapError {
  public readonly report: KernelHealthReport;

  public constructor(report: KernelHealthReport) {
    super('KERNEL_HEALTH_CHECK_FAILED', 'Kernel health check failed for required capabilities');

    this.name = 'HealthCheckError';
    this.report = report;
  }
}
