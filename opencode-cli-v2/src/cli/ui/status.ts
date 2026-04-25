import { Colors, detectColorEnabled } from './colors';
import { Box } from './layout';
import type { BorderStyle } from './layout';
import { ProgressBar, Spinner } from './progress';
import type { TerminalStream } from './terminal';
import { formatDurationMs, getTerminalWidth, InPlaceRenderer, supportsUnicode } from './terminal';

export interface LiveStatusContext {
  readonly usedTokens: number;
  readonly totalTokens: number;
}

export interface LiveStatusStep {
  readonly current: number;
  readonly totalEstimated?: number;
}

export interface LiveStatusState {
  readonly running?: string;
  readonly agent?: string;
  readonly phase?: string;
  readonly step?: LiveStatusStep;
  readonly context?: LiveStatusContext;
  readonly elapsedMs?: number;
  readonly loading?: boolean;
}

export interface LiveStatusOptions {
  readonly stream?: TerminalStream;
  readonly width?: number;
  readonly borderStyle?: BorderStyle;
  readonly noColor?: boolean;
  readonly forceColor?: boolean;
  readonly enabled?: boolean;
}

export class LiveStatus {
  private readonly stream: TerminalStream;
  private readonly renderer: InPlaceRenderer;
  private readonly colors: Colors;
  private readonly borderStyle: BorderStyle;
  private readonly spinner: Spinner;
  private readonly explicitWidth: number | undefined;
  private readonly enabled: boolean;
  private state: LiveStatusState = {};

  public constructor(options: LiveStatusOptions = {}) {
    this.stream = options.stream ?? (process.stderr as unknown as TerminalStream);
    this.enabled = options.enabled ?? true;
    this.explicitWidth = options.width;

    const colorEnabled = detectColorEnabled({
      noColor: options.noColor,
      forceColor: options.forceColor,
      streamIsTTY: this.stream.isTTY === true
    });
    this.colors = new Colors({ enabled: colorEnabled });
    this.borderStyle = options.borderStyle ?? (supportsUnicode() ? 'unicode' : 'ascii');
    this.spinner = new Spinner({
      frames: supportsUnicode() ? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] : ['-', '\\', '|', '/']
    });

    this.renderer = new InPlaceRenderer({ stream: this.stream, enabled: this.stream.isTTY === true });
  }

  public update(next: Partial<LiveStatusState>): void {
    this.state = {
      ...this.state,
      ...next,
      step: next.step === undefined ? this.state.step : { ...this.state.step, ...next.step },
      context:
        next.context === undefined ? this.state.context : { ...this.state.context, ...next.context }
    };
    this.render();
  }

  public renderToString(): string {
    const width = this.getWidth();
    const box = new Box({ width, borderStyle: this.borderStyle, paddingX: 1 });
    const title = this.state.running ?? 'Running';
    const loadingPrefix = this.state.loading === true ? `${this.spinner.next()} ` : '';
    box.header(this.colors.bold(`${loadingPrefix}${title}`));
    box.blank();

    const agent = this.state.agent ?? 'unknown';
    const phase = this.state.phase ?? 'unknown';
    box.line(`Agent: ${this.colors.cyan(agent)} (phase: ${phase})`);

    const step = this.state.step;
    if (step !== undefined) {
      const total = step.totalEstimated;
      const suffix = total === undefined ? '' : ` / ~${total}`;
      box.line(`Step: ${step.current}${suffix}`);
    }

    const context = this.state.context;
    if (context !== undefined && context.totalTokens > 0) {
      const percent = Math.round((context.usedTokens / context.totalTokens) * 100);
      box.line(
        `Context: ${percent}% (${context.usedTokens} / ${context.totalTokens} tokens)`
      );
    }

    if (typeof this.state.elapsedMs === 'number') {
      box.line(`Time: ${formatDurationMs(this.state.elapsedMs)}`);
    }

    box.blank();

    if (context !== undefined && context.totalTokens > 0) {
      const barWidth = Math.max(10, width - 2 - 2 - 12); // borders + padding + " 100%" headroom
      const bar = new ProgressBar(barWidth);
      const line = bar.render(context.usedTokens, context.totalTokens, { showCounts: false });
      box.line(`${line}`);
    }

    return box.toString();
  }

  public render(): void {
    if (!this.enabled) return;
    this.renderer.render(this.renderToString());
  }

  public reset(): void {
    this.state = {};
    this.renderer.reset();
  }

  private getWidth(): number {
    const detected = getTerminalWidth(this.stream, 60);
    const width = this.explicitWidth ?? detected;
    return Math.max(40, Math.min(width, detected));
  }
}
