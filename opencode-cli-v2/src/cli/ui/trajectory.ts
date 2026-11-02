import { Colors, detectColorEnabled } from './colors';
import { Box, renderTable, truncateText } from './layout';
import type { BorderStyle } from './layout';
import type { TerminalStream } from './terminal';
import { getTerminalWidth, supportsUnicode } from './terminal';

export interface TrajectoryStepRow {
  readonly step: number;
  readonly type: string;
  readonly content: string;
}

export interface TrajectoryViewerOptions {
  readonly stream?: TerminalStream;
  readonly width?: number;
  readonly borderStyle?: BorderStyle;
  readonly noColor?: boolean;
  readonly forceColor?: boolean;
  readonly title?: string;
}

export class TrajectoryViewer {
  private readonly stream: TerminalStream;
  private readonly colors: Colors;
  private readonly borderStyle: BorderStyle;
  private readonly explicitWidth: number | undefined;
  private readonly title: string;

  public constructor(options: TrajectoryViewerOptions = {}) {
    this.stream = options.stream ?? (process.stdout as unknown as TerminalStream);
    this.explicitWidth = options.width;
    const colorEnabled = detectColorEnabled({
      noColor: options.noColor,
      forceColor: options.forceColor,
      streamIsTTY: this.stream.isTTY === true
    });
    this.colors = new Colors({ enabled: colorEnabled });
    this.borderStyle = options.borderStyle ?? (supportsUnicode() ? 'unicode' : 'ascii');
    this.title = options.title ?? 'Trajectory';
  }

  public renderToString(steps: readonly TrajectoryStepRow[]): string {
    const width = this.getWidth();
    const box = new Box({ width, borderStyle: this.borderStyle, paddingX: 1 });
    box.header(this.colors.bold(this.title));
    box.blank();

    if (steps.length === 0) {
      box.line(this.colors.gray('No trajectory steps to display.'));
      return box.toString();
    }

    const maxTableWidth = Math.max(10, width - 2 - 2);
    const rows = steps.map((row) => {
      const preview = truncateText(row.content.replace(/\s+/g, ' ').trim(), 60);
      return [String(row.step), row.type, preview] as const;
    });

    const table = renderTable(['#', 'Type', 'Preview'], rows, {
      maxWidth: maxTableWidth,
      align: ['right', 'left', 'left']
    });

    box.content(table);
    return box.toString();
  }

  public write(steps: readonly TrajectoryStepRow[]): void {
    this.stream.write(`${this.renderToString(steps)}\n`);
  }

  private getWidth(): number {
    const detected = getTerminalWidth(this.stream, 80);
    const width = this.explicitWidth ?? detected;
    return Math.max(50, Math.min(width, detected));
  }
}
