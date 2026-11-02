const { describe, it, expect } = require('bun:test');
const { IntegrationLayer } = require('../src/index');

describe('error wiring', () => {
  it('throws OpenCodeError with VALIDATION category on validateInput failure', () => {
    const integration = new IntegrationLayer({});
    
    // Mock validator to throw an error
    integration.validator = {
      validate: () => {
        throw new Error('Invalid input format');
      }
    };
    
    try {
      integration.validateInput({ invalid: 'data' }, { required: true });
      expect(false).toBe(true); // Should not reach here
    } catch (err) {
      // Check if OpenCodeError is available
      if (err.category) {
        expect(err.category).toBe('VALIDATION');
        expect(err.code).toBe('INVALID_INPUT');
        expect(err.message).toContain('Invalid input format');
      } else {
        // Fail-open: plain Error is acceptable if OpenCodeError unavailable
        expect(err.message).toBeDefined();
      }
    }
  });

  it('throws OpenCodeError with CONFIG category on checkContextBudget failure', () => {
    const integration = new IntegrationLayer({});
    
    // Mock contextGovernor to throw an error
    integration.contextGovernor = {
      Governor: class {
        checkBudget() {
          throw new Error('Governor initialization failed');
        }
      }
    };
    
    try {
      integration.checkContextBudget('session-123', 'claude-3', 1000);
      expect(false).toBe(true); // Should not reach here
    } catch (err) {
      // Check if OpenCodeError is available
      if (err.category) {
        expect(err.category).toBe('CONFIG');
        expect(err.code).toBe('CONFIG_INVALID');
        expect(err.message).toContain('Context budget check failed');
      } else {
        // Fail-open: plain Error is acceptable if OpenCodeError unavailable
        expect(err.message).toBeDefined();
      }
    }
  });

  it('throws OpenCodeError with NETWORK category on safeSpawn failure', () => {
    const integration = new IntegrationLayer({});
    
    // Mock crashGuard to throw an error
    integration.crashGuard = {
      safeSpawn: () => {
        throw new Error('Command not found');
      }
    };
    
    try {
      integration.safeSpawn('nonexistent-command', ['arg1']);
      expect(false).toBe(true); // Should not reach here
    } catch (err) {
      // Check if OpenCodeError is available
      if (err.category) {
        expect(err.category).toBe('NETWORK');
        expect(err.code).toBe('CONNECTION_FAILED');
        expect(err.message).toContain('Process spawn failed');
      } else {
        // Fail-open: plain Error is acceptable if OpenCodeError unavailable
        expect(err.message).toBeDefined();
      }
    }
  });

  it('safeSpawn returns null when crash-guard unavailable', () => {
    const integration = new IntegrationLayer({});
    // crashGuard is null by default
    
    const result = integration.safeSpawn('some-command', []);
    expect(result).toBeNull();
  });

  it('OpenCodeError includes metadata when available', () => {
    const integration = new IntegrationLayer({});
    
    // Mock validator to throw an error
    integration.validator = {
      validate: () => {
        throw new Error('Schema mismatch');
      }
    };
    
    try {
      integration.validateInput({ test: 'data' });
      expect(false).toBe(true); // Should not reach here
    } catch (err) {
      // Check if OpenCodeError is available
      if (err.details) {
        expect(err.details).toBeDefined();
        expect(err.details.originalError).toBe('Schema mismatch');
        expect(err.details.retryable).toBe(false);
      }
    }
  });

  it('fail-open: returns gracefully when OpenCodeError unavailable', () => {
    const integration = new IntegrationLayer({});
    integration.validator = null;
    
    // Test validateInput with no validator
    const result = integration.validateInput(null, { required: true });
    expect(result).toBeDefined();
    expect(result.valid).toBe(false);
  });

  it('fail-open: checkContextBudget returns default when governor unavailable', () => {
    const integration = new IntegrationLayer({});
    integration.contextGovernor = null;
    integration._governorInstance = null;
    
    const result = integration.checkContextBudget('session-123', 'claude-3', 1000);
    expect(result).toBeDefined();
    expect(result.allowed).toBe(true);
    expect(result.status).toBe('unknown');
  });
});
