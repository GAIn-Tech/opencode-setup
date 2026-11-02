import { describe, expect, test } from 'bun:test';

import { ProgressBar, Spinner } from '../../src/cli/ui/progress';

describe('ui/progress', () => {
  test('ProgressBar renders percent and counts', () => {
    const bar = new ProgressBar(10);
    const out = bar.render(5, 10);
    expect(out).toContain('50%');
    expect(out).toContain('(5/10)');
    expect(out).toContain('[');
    expect(out).toContain(']');
  });

  test('Spinner cycles frames', () => {
    const spinner = new Spinner({ frames: ['a', 'b'] });
    expect(spinner.next()).toBe('a');
    expect(spinner.next()).toBe('b');
    expect(spinner.next()).toBe('a');
  });
});
