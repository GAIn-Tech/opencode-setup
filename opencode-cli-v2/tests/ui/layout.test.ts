import { describe, expect, test } from 'bun:test';

import { stripAnsi } from '../../src/cli/ui/colors';
import { Box, renderTable } from '../../src/cli/ui/layout';

describe('ui/layout', () => {
  test('Box renders within width and includes borders', () => {
    const box = new Box({ width: 40, borderStyle: 'ascii', paddingX: 1 });
    box.header('Header');
    box.separator();
    box.content('This is a long line that should wrap.');

    const out = box.toString();
    const lines = out.split('\n');

    expect(lines[0]).toBe('+--------------------------------------+');
    expect(lines[lines.length - 1]).toBe('+--------------------------------------+');

    for (const line of lines) {
      expect(stripAnsi(line).length).toBe(40);
    }
  });

  test('renderTable aligns columns and truncates to maxWidth', () => {
    const out = renderTable(
      ['#', 'Type', 'Preview'],
      [
        ['1', 'thought', 'hello world'],
        ['2', 'tool', 'a'.repeat(200)]
      ],
      { maxWidth: 30, align: ['right', 'left', 'left'] }
    );

    const lines = out.split('\n');
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) {
      expect(stripAnsi(line).length).toBeLessThanOrEqual(30);
    }
  });
});
