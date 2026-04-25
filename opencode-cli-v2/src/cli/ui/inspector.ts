import { Colors, detectColorEnabled } from './colors';
import { Box } from './layout';
import type { BorderStyle } from './layout';
import type { TerminalStream } from './terminal';
import { getTerminalWidth, InPlaceRenderer, supportsUnicode } from './terminal';

export type InspectorStepType = 'thought' | 'tool' | 'observation' | 'error' | 'info' | string;

export interface InspectorStep {
  readonly number: number;
  readonly type: InspectorStepType;
  readonly content: string;
}

export interface InspectorOptions {
  readonly stream?: TerminalStream;
  readonly width?: number;
  readonly borderStyle?: BorderStyle;
  readonly noColor?: boolean;
  readonly forceColor?: boolean;
  readonly enabled?: boolean;
}

export class Inspector {
  private readonly stream: TerminalStream;
  private readonly renderer: InPlaceRenderer;
  private readonly colors: Colors;
  private readonly borderStyle: BorderStyle;
  private readonly explicitWidth: number | undefined;
  private readonly enabled: boolean;
  private steps: InspectorStep[] = [];

  public constructor(options: InspectorOptions = {}) {
    this.stream = options.stream ?? (process.stdout as unknown as TerminalStream);
    this.enabled = options.enabled ?? true;

    const colorEnabled = detectColorEnabled({
      noColor: options.noColor,
      forceColor: options.forceColor,
      streamIsTTY: this.stream.isTTY === true
    });
    this.colors = new Colors({ enabled: colorEnabled });
    this.borderStyle = options.borderStyle ?? (supportsUnicode() ? 'unicode' : 'ascii');
    this.explicitWidth = options.width;
    this.renderer = new InPlaceRenderer({ stream: this.stream, enabled: this.stream.isTTY === true });
  }

  public addStep(step: InspectorStep): void {
    this.steps = [...this.steps, step];
    this.render();
  }

  public setSteps(steps: readonly InspectorStep[]): void {
    this.steps = [...steps];
    this.render();
  }

  public clear(): void {
    this.steps = [];
    this.render();
  }

  public renderToString(): string {
    const width = this.getWidth();
    const box = new Box({ width, borderStyle: this.borderStyle, paddingX: 1 });
    box.header(this.colors.bold('Agent Execution'));

    for (let index = 0; index < this.steps.length; index += 1) {
      const step = this.steps[index];
      if (step === undefined) continue;

      const label = `Step ${step.number}: ${step.type}`;
      box.line(this.colors.cyan(label));
      const prefix = this.getStepPrefix(step.type);
      box.content(`${prefix} ${step.content}`);

      if (index < this.steps.length - 1) {
        box.separator();
      }
    }

    if (this.steps.length === 0) {
      box.blank();
      box.line(this.colors.gray('No steps yet.'));
    }

    return box.toString();
  }

  public render(): void {
    if (!this.enabled) return;
    this.renderer.render(this.renderToString());
  }

  private getWidth(): number {
    const detected = getTerminalWidth(this.stream, 80);
    const width = this.explicitWidth ?? detected;
    return Math.max(30, Math.min(width, detected));
  }

  private getStepPrefix(type: InspectorStepType): string {
    const normalized = String(type).toLowerCase();
    if (normalized === 'observation') return '<';
    if (normalized === 'error') return '!';
    return '>';
  }
}
