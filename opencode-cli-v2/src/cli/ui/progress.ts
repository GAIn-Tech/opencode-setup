import { visibleLength } from './colors';
import type { TerminalStream } from './terminal';
import { carriageReturn, clearLine } from './terminal';

export interface ProgressBarRenderOptions {
  readonly width?: number;
  readonly label?: string;
  readonly showCounts?: boolean;
}

export class ProgressBar {
  private readonly barWidth: number;

  public constructor(width = 24) {
    this.barWidth = Math.max(5, Math.floor(width));
  }

  public render(current: number, total: number, options: ProgressBarRenderOptions = {}): string {
    const safeTotal = total <= 0 ? 1 : total;
    const safeCurrent = Math.max(0, Math.min(current, safeTotal));
    const ratio = safeCurrent / safeTotal;
    const percent = Math.round(ratio * 100);
    const width = Math.max(5, Math.floor(options.width ?? this.barWidth));

    const filled = Math.floor(ratio * width);
    const hasHead = filled < width;
    const left = hasHead ? Math.max(0, filled - 1) : filled;
    const bar = `${'='.repeat(left)}${hasHead ? '>' : ''}${' '.repeat(Math.max(0, width - filled))}`;

    const counts = options.showCounts === false ? '' : ` (${safeCurrent}/${safeTotal})`;
    const base = `[${bar}] ${percent}%${counts}`;

    if (options.label !== undefined) {
      return `${options.label}: ${base}`;
    }

    return base;
  }
}

export interface SpinnerOptions {
  readonly frames?: readonly string[];
}

export class Spinner {
  private readonly frames: readonly string[];
  private index = 0;

  public constructor(options: SpinnerOptions = {}) {
    this.frames = options.frames ?? ['-', '\\', '|', '/'];
  }

  public next(): string {
    const frame = this.frames[this.index] ?? this.frames[0] ?? '-';
    this.index = (this.index + 1) % this.frames.length;
    return frame;
  }

  public reset(): void {
    this.index = 0;
  }
}

export interface LiveLineOptions {
  readonly stream: TerminalStream;
  readonly enabled?: boolean;
}

export class LiveLine {
  private readonly stream: TerminalStream;
  private readonly enabled: boolean;
  private lastVisibleWidth = 0;

  public constructor(options: LiveLineOptions) {
    this.stream = options.stream;
    this.enabled = options.enabled ?? (options.stream.isTTY === true);
  }

  public render(line: string): void {
    if (!this.enabled) {
      this.stream.write(line.endsWith('\n') ? line : `${line}\n`);
      this.lastVisibleWidth = 0;
      return;
    }

    carriageReturn(this.stream);
    clearLine(this.stream);
    this.stream.write(line);
    this.lastVisibleWidth = visibleLength(line);
  }

  public clear(): void {
    if (!this.enabled) return;
    carriageReturn(this.stream);
    clearLine(this.stream);
    this.lastVisibleWidth = 0;
  }

  public getLastVisibleWidth(): number {
    return this.lastVisibleWidth;
  }
}
