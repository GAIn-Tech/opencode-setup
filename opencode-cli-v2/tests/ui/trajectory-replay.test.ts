import { describe, expect, test } from 'bun:test';

import { TrajectoryViewer } from '../../src/cli/ui/trajectory';
import { ReplayControls } from '../../src/cli/ui/replay';
import { createMockStream } from './helpers';

describe('ui/trajectory + replay', () => {
  test('TrajectoryViewer renders a table of steps', () => {
    const stream = createMockStream({ isTTY: false, columns: 70 });
    const viewer = new TrajectoryViewer({ stream, width: 70, noColor: true });
    const out = viewer.renderToString([
      { step: 1, type: 'thought', content: 'analyze' },
      { step: 2, type: 'tool', content: 'read_file(...)' }
    ]);
    expect(out).toContain('Trajectory');
    expect(out).toContain('thought');
    expect(out).toContain('tool');
  });

  test('ReplayControls renders controls and state', () => {
    const stream = createMockStream({ isTTY: false, columns: 70 });
    const controls = new ReplayControls(
      { trajectory: 'trace.json', step: 2, totalSteps: 10, playing: false, speed: 1 },
      { stream, width: 70, noColor: true }
    );
    const out = controls.renderToString();
    expect(out).toContain('Replay: trace.json');
    expect(out).toContain('Step: 2 / 10');
    expect(out).toContain('paused');
    expect(out).toContain('Play/Pause');
  });
});
