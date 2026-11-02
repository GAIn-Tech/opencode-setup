const { describe, test, expect } = require('bun:test');
const { IntegrationLayer } = require('../src/index.js');

describe('IntegrationLayer memory-graph wiring', () => {
  test('recordSessionError delegates to memoryGraph.buildGraph', async () => {
    const mockMemoryGraph = {
      buildGraph: async (data) => ({ success: true, data }),
      getSessionErrors: async () => [],
      getErrorFrequency: async () => ({}),
      activate: async () => ({ active: true }),
      isActive: () => true,
    };

    const layer = new IntegrationLayer({ memoryGraph: mockMemoryGraph });
    const error = new Error('Test error');
    const result = await layer.recordSessionError('session-123', error);

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.data[0].session_id).toBe('session-123');
    expect(result.data[0].message).toBe('Test error');
    expect(result.data[0].timestamp).toBeDefined();
  });

  test('recordSessionError returns null when memoryGraph unavailable', async () => {
    const layer = new IntegrationLayer({ memoryGraph: null });
    const result = await layer.recordSessionError('session-123', new Error('Test'));

    expect(result).toBeNull();
  });

  test('recordSessionError returns null when memoryGraph.buildGraph throws', async () => {
    const mockMemoryGraph = {
      buildGraph: async () => {
        throw new Error('Build failed');
      },
    };

    const layer = new IntegrationLayer({ memoryGraph: mockMemoryGraph });
    const result = await layer.recordSessionError('session-123', new Error('Test'));

    expect(result).toBeNull();
  });

  test('getSessionErrors delegates to memoryGraph.getSessionErrors', async () => {
    const mockErrors = [
      { message: 'Error 1', timestamp: '2026-03-11T10:00:00Z' },
      { message: 'Error 2', timestamp: '2026-03-11T10:01:00Z' },
    ];
    const mockMemoryGraph = {
      buildGraph: async () => ({}),
      getSessionErrors: async (sessionId) => {
        if (sessionId === 'session-123') return mockErrors;
        return [];
      },
      getErrorFrequency: async () => ({}),
      activate: async () => ({}),
      isActive: () => true,
    };

    const layer = new IntegrationLayer({ memoryGraph: mockMemoryGraph });
    const result = await layer.getSessionErrors('session-123');

    expect(result).toEqual(mockErrors);
    expect(result.length).toBe(2);
  });

  test('getSessionErrors returns null when memoryGraph unavailable', async () => {
    const layer = new IntegrationLayer({ memoryGraph: null });
    const result = await layer.getSessionErrors('session-123');

    expect(result).toBeNull();
  });

  test('getSessionErrors returns null when memoryGraph.getSessionErrors throws', async () => {
    const mockMemoryGraph = {
      getSessionErrors: async () => {
        throw new Error('Query failed');
      },
    };

    const layer = new IntegrationLayer({ memoryGraph: mockMemoryGraph });
    const result = await layer.getSessionErrors('session-123');

    expect(result).toBeNull();
  });

  test('getErrorFrequency delegates to memoryGraph.getErrorFrequency', async () => {
    const mockFrequency = {
      'TypeError': 5,
      'ReferenceError': 3,
      'SyntaxError': 1,
    };
    const mockMemoryGraph = {
      buildGraph: async () => ({}),
      getSessionErrors: async () => [],
      getErrorFrequency: async () => mockFrequency,
      activate: async () => ({}),
      isActive: () => true,
    };

    const layer = new IntegrationLayer({ memoryGraph: mockMemoryGraph });
    const result = await layer.getErrorFrequency();

    expect(result).toEqual(mockFrequency);
    expect(result.TypeError).toBe(5);
  });

  test('getErrorFrequency returns null when memoryGraph unavailable', async () => {
    const layer = new IntegrationLayer({ memoryGraph: null });
    const result = await layer.getErrorFrequency();

    expect(result).toBeNull();
  });

  test('getErrorFrequency returns null when memoryGraph.getErrorFrequency throws', async () => {
    const mockMemoryGraph = {
      getErrorFrequency: async () => {
        throw new Error('Frequency calculation failed');
      },
    };

    const layer = new IntegrationLayer({ memoryGraph: mockMemoryGraph });
    const result = await layer.getErrorFrequency();

    expect(result).toBeNull();
  });

  test('activateMemoryGraph delegates to memoryGraph.activate', async () => {
    const mockMemoryGraph = {
      buildGraph: async () => ({}),
      getSessionErrors: async () => [],
      getErrorFrequency: async () => ({}),
      activate: async (opts) => ({ active: true, opts }),
      isActive: () => true,
    };

    const layer = new IntegrationLayer({ memoryGraph: mockMemoryGraph });
    const result = await layer.activateMemoryGraph({ mode: 'full' });

    expect(result).toBeDefined();
    expect(result.active).toBe(true);
    expect(result.opts.mode).toBe('full');
  });

  test('activateMemoryGraph returns null when memoryGraph unavailable', async () => {
    const layer = new IntegrationLayer({ memoryGraph: null });
    const result = await layer.activateMemoryGraph({ mode: 'full' });

    expect(result).toBeNull();
  });

  test('activateMemoryGraph returns null when memoryGraph.activate throws', async () => {
    const mockMemoryGraph = {
      activate: async () => {
        throw new Error('Activation failed');
      },
    };

    const layer = new IntegrationLayer({ memoryGraph: mockMemoryGraph });
    const result = await layer.activateMemoryGraph();

    expect(result).toBeNull();
  });

  test('isMemoryGraphActive delegates to memoryGraph.isActive', () => {
    const mockMemoryGraph = {
      buildGraph: async () => ({}),
      getSessionErrors: async () => [],
      getErrorFrequency: async () => ({}),
      activate: async () => ({}),
      isActive: () => true,
    };

    const layer = new IntegrationLayer({ memoryGraph: mockMemoryGraph });
    const result = layer.isMemoryGraphActive();

    expect(result).toBe(true);
  });

  test('isMemoryGraphActive returns false when memoryGraph unavailable', () => {
    const layer = new IntegrationLayer({ memoryGraph: null });
    const result = layer.isMemoryGraphActive();

    expect(result).toBe(false);
  });

  test('isMemoryGraphActive returns false when memoryGraph.isActive throws', () => {
    const mockMemoryGraph = {
      isActive: () => {
        throw new Error('Status check failed');
      },
    };

    const layer = new IntegrationLayer({ memoryGraph: mockMemoryGraph });
    const result = layer.isMemoryGraphActive();

    expect(result).toBe(false);
  });

  test('isMemoryGraphActive returns false when memoryGraph.isActive returns false', () => {
    const mockMemoryGraph = {
      isActive: () => false,
    };

    const layer = new IntegrationLayer({ memoryGraph: mockMemoryGraph });
    const result = layer.isMemoryGraphActive();

    expect(result).toBe(false);
  });

  test('recordSessionError handles plain object errors', async () => {
    const mockMemoryGraph = {
      buildGraph: async (data) => ({ success: true, data }),
      getSessionErrors: async () => [],
      getErrorFrequency: async () => ({}),
      activate: async () => ({}),
      isActive: () => true,
    };

    const layer = new IntegrationLayer({ memoryGraph: mockMemoryGraph });
    const plainError = { code: 'ERR_CUSTOM', details: 'Something went wrong' };
    const result = await layer.recordSessionError('session-456', plainError);

    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    expect(result.data[0].code).toBe('ERR_CUSTOM');
    expect(result.data[0].details).toBe('Something went wrong');
  });

  test('all methods fail-open gracefully without memoryGraph', async () => {
    const layer = new IntegrationLayer({ memoryGraph: null });

    const recordResult = await layer.recordSessionError('s1', new Error('test'));
    const getResult = await layer.getSessionErrors('s1');
    const freqResult = await layer.getErrorFrequency();
    const activateResult = await layer.activateMemoryGraph();
    const isActiveResult = layer.isMemoryGraphActive();

    expect(recordResult).toBeNull();
    expect(getResult).toBeNull();
    expect(freqResult).toBeNull();
    expect(activateResult).toBeNull();
    expect(isActiveResult).toBe(false);
  });
});
