export interface ColorSupportOptions {
  readonly enabled: boolean;
}

const ESC = '\u001b[';

const ANSI_PATTERN =
  /\u001b\[[0-?]*[ -/]*[@-~]/g; // broad CSI matcher (covers SGR + cursor movement, etc)

export function stripAnsi(input: string): string {
  return input.replace(ANSI_PATTERN, '');
}

export function visibleLength(input: string): number {
  return stripAnsi(input).length;
}

function sgr(code: string): string {
  return `${ESC}${code}m`;
}

export class Colors {
  public readonly enabled: boolean;

  public constructor(options: ColorSupportOptions) {
    this.enabled = options.enabled;
  }

  public wrap(input: string, ...codes: readonly string[]): string {
    if (!this.enabled || codes.length === 0) {
      return input;
    }

    return `${codes.map(sgr).join('')}${input}${sgr('0')}`;
  }

  public reset(input: string): string {
    return this.wrap(input, '0');
  }

  public bold(input: string): string {
    return this.wrap(input, '1');
  }

  public dim(input: string): string {
    return this.wrap(input, '2');
  }

  public underline(input: string): string {
    return this.wrap(input, '4');
  }

  public gray(input: string): string {
    return this.wrap(input, '90');
  }

  public red(input: string): string {
    return this.wrap(input, '31');
  }

  public green(input: string): string {
    return this.wrap(input, '32');
  }

  public yellow(input: string): string {
    return this.wrap(input, '33');
  }

  public blue(input: string): string {
    return this.wrap(input, '34');
  }

  public magenta(input: string): string {
    return this.wrap(input, '35');
  }

  public cyan(input: string): string {
    return this.wrap(input, '36');
  }
}

export interface DetectColorOptions {
  readonly noColor?: boolean;
  readonly forceColor?: boolean;
  readonly streamIsTTY?: boolean;
  readonly env?: Record<string, string | undefined>;
}

export function detectColorEnabled(options: DetectColorOptions = {}): boolean {
  if (options.noColor === true) {
    return false;
  }

  if (options.forceColor === true) {
    return true;
  }

  const env = options.env ?? process.env;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') {
    return false;
  }

  // Bun/Node convention. 0 disables, any other value forces.
  if (env.FORCE_COLOR !== undefined) {
    return env.FORCE_COLOR !== '0';
  }

  return options.streamIsTTY === true;
}
