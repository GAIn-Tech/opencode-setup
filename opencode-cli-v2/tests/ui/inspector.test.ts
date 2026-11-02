import { describe, expect, test } from 'bun:test';

import { stripAnsi } from '../../src/cli/ui/colors';
import { Inspector } from '../../src/cli/ui/inspector';
import { createMockStream } from './helpers';

describe('ui/inspector', () => {
  test('Inspector renders SWE-agent style steps', () => {
    const stream = createMockStream({ isTTY: false, columns: 60 });
    const inspector = new Inspector({ stream, width: 60, noColor: true });
    inspector.setSteps([
      { number: 1, type: 'thought', content: 'Let me analyze the codebase...' },
      { number: 2, type: 'tool', content: 'read_file({ path: "src/index.ts" })' },
      { number: 3, type: 'observation', content: 'File contents: export class...' }
    ]);

    const out = inspector.renderToString();
    expect(out).toContain('Step 1: thought');
    expect(out).toContain('> Let me analyze the codebase...');
    expect(out).toContain('Step 3: observation');
    expect(out).toContain('< File contents: export class...');

    const lines = out.split('\n');
    for (const line of lines) {
      expect(stripAnsi(line).length).toBeLessThanOrEqual(60);
    }
  });
});
