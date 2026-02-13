const { describe, test, expect } = require('bun:test');

const GlobalModelContext = require('../src/strategies/global-model-context.js');

describe('GlobalModelContext', () => {
  test('isolates callback failure on setModelContext', () => {
    const context = new GlobalModelContext();

    context.onModelChange('session-1', () => {
      throw new Error('callback failed');
    });

    expect(() => {
      context.setModelContext('session-1', {
        provider: 'openai',
        model_id: 'gpt-4o-mini',
      });
    }).not.toThrow();

    const saved = context.getModelContext('session-1');
    expect(saved.provider).toBe('openai');
    expect(saved.model_id).toBe('gpt-4o-mini');
    expect(typeof saved.timestamp).toBe('number');
  });

  test('continues broadcast when one callback throws', () => {
    const context = new GlobalModelContext();
    const received = [];

    context.setModelContext('session-a', { provider: 'x', model_id: 'm1' });
    context.setModelContext('session-b', { provider: 'x', model_id: 'm1' });

    context.onModelChange('session-a', () => {
      throw new Error('session-a callback failure');
    });
    context.onModelChange('session-b', (selection) => {
      received.push(selection.model_id);
    });

    expect(() => {
      const count = context.broadcast({ provider: 'groq', model_id: 'llama-3.1-70b' });
      expect(count).toBe(2);
    }).not.toThrow();

    expect(received).toEqual(['llama-3.1-70b']);
    expect(context.getModelContext('session-a').model_id).toBe('llama-3.1-70b');
    expect(context.getModelContext('session-b').model_id).toBe('llama-3.1-70b');
  });

  test('ignores empty session ids', () => {
    const context = new GlobalModelContext();
    context.setModelContext('', { provider: 'openai', model_id: 'gpt-4o' });
    expect(context.getStats().active_sessions).toBe(0);
  });
});
