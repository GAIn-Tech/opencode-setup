'use strict';

const { describe, test, expect } = require('bun:test');
const { ModelRouter } = require('../src/index.js');

class FakeCircuitBreaker {
  constructor(options = {}) {
    this.options = options;
  }

  getState() {
    return 'closed';
  }

  execute(fn) {
    return fn();
  }
}

class FakeIntegrationLayer {}

const mockValidator = {
  ValidationResult: class ValidationResult {
    constructor(valid = true, errors = []) {
      this.valid = valid;
      this.errors = errors;
    }
  },
  Validator: class Validator {
    constructor() {
      this.errors = [];
    }

    type() {
      return this;
    }
  },
};

describe('ModelRouter constructor injection', () => {
  test('prefers injected logger, validator, healthCheck, and integration layer class', () => {
    const registered = [];
    const logger = {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
    const healthCheck = {
      registerSubsystem: (name, checkFn, options) => {
        registered.push({ name, checkFn, options });
      },
    };

    const router = new ModelRouter({
      logger,
      validator: mockValidator,
      healthCheck,
      circuitBreakerClass: FakeCircuitBreaker,
      integrationLayerClass: FakeIntegrationLayer,
      openCodeErrors: {
        ErrorCategory: { INTERNAL: 'INTERNAL' },
        ErrorCode: { CONFIG_INVALID: 'CONFIG_INVALID' },
      },
    });

    expect(router.logger).toBe(logger);
    expect(router.validator).toBe(mockValidator);
    expect(router.healthCheck).toBe(healthCheck);
    expect(router._adapter.integrationLayerClass).toBe(FakeIntegrationLayer);
    expect(registered.length).toBeGreaterThan(0);
    expect(typeof registered[0].checkFn).toBe('function');
    expect(registered[0].options.checkInterval).toBe(30000);
  });

  test('uses injected circuit breaker class for provider breakers', () => {
    const router = new ModelRouter({
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      circuitBreakerClass: FakeCircuitBreaker,
      healthCheck: { registerSubsystem: () => {} },
    });

    const breakers = Object.values(router.circuitBreakers);
    expect(breakers.length).toBeGreaterThan(0);
    expect(breakers[0]).toBeInstanceOf(FakeCircuitBreaker);
  });

  test('preserves injected meta-awareness tracker instance', () => {
    const tracker = { trackEvent: () => {} };
    const router = new ModelRouter({
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      metaAwarenessTracker: tracker,
      healthCheck: { registerSubsystem: () => {} },
      circuitBreakerClass: FakeCircuitBreaker,
    });

    expect(router.metaAwarenessTracker).toBe(tracker);
  });
});
