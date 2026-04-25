import { describe, expect, test } from 'bun:test';

import { stripAnsi } from '../../src/cli/ui/colors';
import { LiveStatus } from '../../src/cli/ui/status';
import { createMockStream } from './helpers';

describe('ui/status', () => {
  test('LiveStatus renders key fields and progress', () => {
    const stream = createMockStream({ isTTY: false, columns: 60 });
    const status = new LiveStatus({ stream, width: 60, noColor: true });
    status.update({
      running: 'Create auth system',
      agent: 'prom',
      phase: 'planning',
      step: { current: 3, totalEstimated: 15 },
      context: { usedTokens: 2345, totalTokens: 8192 },
      elapsedMs: 154000,
      loading: true
    });

    const out = status.renderToString();
    expect(out).toContain('Create auth system');
    expect(out).toContain('Agent:');
    expect(out).toContain('prom');
    expect(out).toContain('Step: 3 / ~15');
    expect(out).toContain('Context:');
    expect(out).toContain('Time: 00:02:34');
    expect(out).toContain('%');

    const lines = out.split('\n');
    for (const line of lines) {
      expect(stripAnsi(line).length).toBeLessThanOrEqual(60);
    }
  });

  test('LiveStatus writes to stream when not TTY', () => {
    const stream = createMockStream({ isTTY: false, columns: 60 });
    const status = new LiveStatus({ stream, width: 60, noColor: true });
    status.update({ running: 'Task', agent: 'prom', phase: 'planning' });
    expect(stream.chunks.length).toBeGreaterThan(0);
  });
});
