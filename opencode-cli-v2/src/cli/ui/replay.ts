import { Colors, detectColorEnabled } from './colors';
import { Box } from './layout';
import type { BorderStyle } from './layout';
import type { TerminalStream } from './terminal';
import { getTerminalWidth, supportsUnicode } from './terminal';

export interface ReplayState {
  readonly trajectory?: string;
  readonly step: number;
  readonly totalSteps?: number;
  readonly playing: boolean;
  readonly speed?: number;
}

export interface ReplayControlsOptions {
  readonly stream?: TerminalStream;
  readonly width?: number;
  readonly borderStyle?: BorderStyle;
  readonly noColor?: boolean;
  readonly forceColor?: boolean;
}

export class ReplayControls {
  private readonly stream: TerminalStream;
  private readonly colors: Colors;
  private readonly borderStyle: BorderStyle;
  private readonly explicitWidth: number | undefined;
  private state: ReplayState;

  public constructor(initial: ReplayState, options: ReplayControlsOptions = {}) {
    this.stream = options.stream ?? (process.stdout as unknown as TerminalStream);
    this.explicitWidth = options.width;
    const colorEnabled = detectColorEnabled({
      noColor: options.noColor,
      forceColor: options.forceColor,
      streamIsTTY: this.stream.isTTY === true
    });
    this.colors = new Colors({ enabled: colorEnabled });
    this.borderStyle = options.borderStyle ?? (supportsUnicode() ? 'unicode' : 'ascii');
    this.state = initial;
  }

  public setState(next: ReplayState): void {
    this.state = next;
  }

  public renderToString(): string {
    const width = this.getWidth();
    const box = new Box({ width, borderStyle: this.borderStyle, paddingX: 1 });
    const name = this.state.trajectory ?? 'trajectory';
    box.header(this.colors.bold(`Replay: ${name}`));
    box.blank();

    const total = this.state.totalSteps;
    const stepLine = total === undefined ? `Step: ${this.state.step}` : `Step: ${this.state.step} / ${total}`;
    box.line(stepLine);
    box.line(`Mode: ${this.state.playing ? this.colors.green('playing') : this.colors.yellow('paused')}`);
    if (typeof this.state.speed === 'number') {
      box.line(`Speed: ${this.state.speed}x`);
    }
    box.blank();

    const controls = supportsUnicode()
      ? '[Space] Play/Pause   [←/→] Step   [q] Quit'
      : '[Space] Play/Pause   [<- / ->] Step   [q] Quit';
    box.line(this.colors.gray(controls));
    return box.toString();
  }

  public write(): void {
    this.stream.write(`${this.renderToString()}\n`);
  }

  private getWidth(): number {
    const detected = getTerminalWidth(this.stream, 70);
    const width = this.explicitWidth ?? detected;
    return Math.max(50, Math.min(width, detected));
  }
}
