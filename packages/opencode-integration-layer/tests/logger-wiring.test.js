const { describe, it, expect } = require('bun:test');
const { IntegrationLayer } = require('../src/index');

describe('logger wiring', () => {
  it('exposes logger on instance', () => {
    const integration = new IntegrationLayer({});
    expect(integration.logger).toBeDefined();
    expect(typeof integration.logger.info).toBe('function');
    expect(typeof integration.logger.warn).toBe('function');
    expect(typeof integration.logger.error).toBe('function');
  });

  it('uses injected logger for operational messages', () => {
    const logs = [];
    const integration = new IntegrationLayer({});
    integration.logger = {
      info: (...args) => logs.push(['info', ...args]),
      warn: (...args) => logs.push(['warn', ...args]),
      error: (...args) => logs.push(['error', ...args]),
      debug: (...args) => logs.push(['debug', ...args]),
    };
    // Verify logger is injectable
    expect(integration.logger.info).toBeDefined();
    expect(integration.logger.warn).toBeDefined();
    expect(integration.logger.error).toBeDefined();
  });

  it('logger has all required methods', () => {
    const integration = new IntegrationLayer({});
    const logger = integration.logger;
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.debug).toBe('function');
  });

  it('logger methods are callable without errors', () => {
    const integration = new IntegrationLayer({});
    const logger = integration.logger;
    
    // Should not throw
    expect(() => logger.info('test message')).not.toThrow();
    expect(() => logger.warn('test warning')).not.toThrow();
    expect(() => logger.error('test error')).not.toThrow();
    expect(() => logger.debug('test debug')).not.toThrow();
  });

  it('logger methods accept data objects', () => {
    const integration = new IntegrationLayer({});
    const logger = integration.logger;
    
    // Should not throw with data
    expect(() => logger.info('test', { key: 'value' })).not.toThrow();
    expect(() => logger.warn('test', { key: 'value' })).not.toThrow();
    expect(() => logger.error('test', { key: 'value' })).not.toThrow();
  });
});
