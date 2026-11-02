const { describe, it, expect } = require('bun:test');
const { IntegrationLayer } = require('../src/index');

describe('runbooks wiring', () => {
  it('exposes diagnose() that delegates to runbooks', () => {
    const mockRunbooks = {
      diagnose: (error) => ({
        match: { id: 'ENOENT', score: 5, confidence: 0.8 },
        remedy: { id: 'ENOENT', remedy: 'check_command', instructions: 'Check command exists' },
        result: { action: 'instruction', status: 'ok', details: { message: 'Check command exists' } },
      }),
    };
    const integration = new IntegrationLayer({ runbooks: mockRunbooks });

    const result = integration.diagnose(new Error('ENOENT: no such file'));
    expect(result).toBeDefined();
    expect(result.match).toBeDefined();
    expect(result.match.id).toBe('ENOENT');
    expect(result.remedy).toBeDefined();
    expect(result.remedy.instructions).toBeDefined();
    expect(result.result).toBeDefined();
  });

  it('returns null gracefully when runbooks unavailable', () => {
    const integration = new IntegrationLayer({});
    const result = integration.diagnose(new Error('some error'));
    expect(result).toBeNull();
  });

  it('returns null when runbooks.diagnose throws', () => {
    const mockRunbooks = {
      diagnose: () => { throw new Error('runbook internal error'); },
    };
    const integration = new IntegrationLayer({ runbooks: mockRunbooks });
    const result = integration.diagnose(new Error('test'));
    expect(result).toBeNull();
  });
});
