/**
 * Test utilities for OpenCode packages
 * Provides mocks, fixtures, and helpers for testing
 */

// Mock implementations for external dependencies
export class MockProvider {
  constructor(name, options = {}) {
    this.name = name;
    this.models = options.models || ['test-model'];
    this.apiKey = options.apiKey || 'test-key';
    this.callCount = 0;
    this.shouldFail = options.shouldFail || false;
    this.failAt = options.failAt || Infinity;
  }

  async call(prompt) {
    this.callCount++;
    if (this.callCount > this.failAt) {
      throw new Error(`${this.name} simulated failure`);
    }
    return { text: `Response from ${this.name}`, model: this.models[0] };
  }

  reset() {
    this.callCount = 0;
  }
}

// Mock ConfigLoader for testing
export class MockConfigLoader {
  constructor(config = {}) {
    this.config = config;
    this.loadCount = 0;
  }

  get(key) {
    return key.split('.').reduce((obj, k) => obj?.[k], this.config);
  }

  load() {
    this.loadCount++;
    return this.config;
  }

  reset() {
    this.loadCount = 0;
  }
}

// Mock Database for testing
export class MockDatabase {
  constructor() {
    this.data = new Map();
    this.transactionLog = [];
  }

  get(key) {
    return this.data.get(key);
  }

  set(key, value) {
    this.data.set(key, value);
  }

  delete(key) {
    this.data.delete(key);
  }

  async transaction(fn) {
    this.transactionLog.push('begin');
    try {
      await fn(this);
      this.transactionLog.push('commit');
    } catch (e) {
      this.transactionLog.push('rollback');
      throw e;
    }
  }

  clear() {
    this.data.clear();
    this.transactionLog = [];
  }
}

// Test fixtures
export const fixtures = {
  validConfig: {
    providers: {
      openai: { apiKey: 'test-key', models: ['gpt-5.2-codex'] },
      anthropic: { apiKey: 'test-key', models: ['claude-opus-4-6'] },
      google: { apiKey: 'test-key', models: ['gemini-3-pro'] }
    },
    routing: {
      strategy: 'health-first',
      fallbackEnabled: true
    }
  },

  minimalConfig: {
    providers: {
      openai: { apiKey: 'test' }
    }
  },

  providerStatus: {
    openai: { healthy: true, latency: 120, successRate: 0.98 },
    anthropic: { healthy: true, latency: 150, successRate: 0.95 },
    google: { healthy: false, latency: 5000, successRate: 0.50 }
  }
};

// Assertion helpers
export const assert = {
  isDefined(value) {
    if (value === undefined || value === null) {
      throw new Error(`Expected value to be defined, got ${value}`);
    }
  },

  isType(value, type) {
    if (typeof value !== type) {
      throw new Error(`Expected ${value} to be type ${type}, got ${typeof value}`);
    }
  },

  equals(actual, expected) {
    if (actual !== expected) {
      throw new Error(`Expected ${expected}, got ${actual}`);
    }
  },

  deepEquals(actual, expected) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  },

  throws(fn, errorMatch) {
    try {
      fn();
      throw new Error('Expected function to throw');
    } catch (e) {
      if (errorMatch && !e.message.includes(errorMatch)) {
        throw new Error(`Expected error to include "${errorMatch}", got "${e.message}"`);
      }
    }
  },

  async throwsAsync(fn, errorMatch) {
    try {
      await fn();
      throw new Error('Expected function to throw');
    } catch (e) {
      if (errorMatch && !e.message.includes(errorMatch)) {
        throw new Error(`Expected error to include "${errorMatch}", got "${e.message}"`);
      }
    }
  }
};

// Cleanup helpers
export function createCleanup() {
  const cleanupFns = [];
  
  return {
    add(fn) {
      cleanupFns.push(fn);
    },
    
    async run() {
      for (const fn of cleanupFns.reverse()) {
        try {
          await fn();
        } catch (e) {
          console.error('Cleanup error:', e);
        }
      }
      cleanupFns.length = 0;
    }
  };
}

// Test timeout helper
export function withTimeout(ms, promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Test timeout after ${ms}ms`)), ms)
    )
  ]);
}

// Skip CI helper
export function skipCI(reason = 'Skipping in CI') {
  if (process.env.CI) {
    console.log(`SKIP: ${reason}`);
    return true;
  }
  return false;
}

export default {
  MockProvider,
  MockConfigLoader,
  MockDatabase,
  fixtures,
  assert,
  createCleanup,
  withTimeout,
  skipCI
};
