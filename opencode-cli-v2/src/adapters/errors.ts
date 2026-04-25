/**
 * Base adapter-layer error.
 */
export class AdapterError extends Error {
  public readonly code: string;

  public constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.cause = cause;
  }
}

/**
 * Thrown when adapter registration/discovery is invalid.
 */
export class AdapterRegistrationError extends AdapterError {
  public constructor(message: string, cause?: unknown) {
    super('ADAPTER_REGISTRATION_FAILED', message, cause);
    this.name = 'AdapterRegistrationError';
  }
}

/**
 * Thrown when adapter access is requested before initialization.
 */
export class AdapterNotInitializedError extends AdapterError {
  public readonly adapterName: string;

  public constructor(adapterName: string) {
    super(
      'ADAPTER_NOT_INITIALIZED',
      `Adapter "${adapterName}" has no active port instance. Ensure it is loaded and initialized first.`
    );
    this.name = 'AdapterNotInitializedError';
    this.adapterName = adapterName;
  }
}

/**
 * Thrown when adapter load hook fails.
 */
export class AdapterLoadError extends AdapterError {
  public readonly adapterName: string;

  public constructor(adapterName: string, cause?: unknown) {
    super('ADAPTER_LOAD_FAILED', `Failed to load adapter: ${adapterName}`, cause);
    this.name = 'AdapterLoadError';
    this.adapterName = adapterName;
  }
}

/**
 * Thrown when adapter initialization hook fails.
 */
export class AdapterInitializationError extends AdapterError {
  public readonly adapterName: string;

  public constructor(adapterName: string, cause?: unknown) {
    super('ADAPTER_INIT_FAILED', `Failed to initialize adapter: ${adapterName}`, cause);
    this.name = 'AdapterInitializationError';
    this.adapterName = adapterName;
  }
}

/**
 * Thrown when adapter health check hook throws.
 */
export class AdapterHealthCheckError extends AdapterError {
  public readonly adapterName: string;

  public constructor(adapterName: string, cause?: unknown) {
    super('ADAPTER_HEALTH_CHECK_FAILED', `Adapter health check failed: ${adapterName}`, cause);
    this.name = 'AdapterHealthCheckError';
    this.adapterName = adapterName;
  }
}

/**
 * Thrown when adapter shutdown hook fails.
 */
export class AdapterShutdownError extends AdapterError {
  public readonly adapterName: string;

  public constructor(adapterName: string, cause?: unknown) {
    super('ADAPTER_SHUTDOWN_FAILED', `Failed to shutdown adapter: ${adapterName}`, cause);
    this.name = 'AdapterShutdownError';
    this.adapterName = adapterName;
  }
}

/**
 * Thrown when a required adapter cannot satisfy a lifecycle stage.
 */
export class RequiredAdapterError extends AdapterError {
  public readonly adapterName: string;
  public readonly stage: 'load' | 'initialize' | 'healthCheck';

  public constructor(
    adapterName: string,
    stage: 'load' | 'initialize' | 'healthCheck',
    cause?: unknown
  ) {
    super(
      'REQUIRED_ADAPTER_FAILED',
      `Required adapter "${adapterName}" failed during ${stage}`,
      cause
    );
    this.name = 'RequiredAdapterError';
    this.adapterName = adapterName;
    this.stage = stage;
  }
}
