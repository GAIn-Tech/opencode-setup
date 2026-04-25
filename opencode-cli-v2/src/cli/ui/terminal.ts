export interface TerminalStream {
  readonly write: (chunk: string) => unknown;
  readonly isTTY?: boolean;
  readonly columns?: number;
  readonly rows?: number;
}

export interface TerminalEnv {
  readonly platform?: string;
  readonly env?: Record<string, string | undefined>;
}

const CSI = '\u001b[';

export function getTerminalWidth(stream?: TerminalStream, fallback = 80): number {
  const width = stream?.columns;
  if (typeof width === 'number' && Number.isFinite(width) && width > 0) {
    return Math.floor(width);
  }

  return fallback;
}

export function getTerminalHeight(stream?: TerminalStream, fallback = 24): number {
  const height = stream?.rows;
  if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
    return Math.floor(height);
  }

  return fallback;
}

export function supportsUnicode(options: TerminalEnv = {}): boolean {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;

  // Most modern terminals on Windows support box drawing, but legacy shells can be flaky.
  if (platform === 'win32') {
    // Windows Terminal, VSCode, and common ANSI-capable shells.
    if (env.WT_SESSION !== undefined) return true;
    if (env.TERM_PROGRAM === 'vscode') return true;
    if (env.ConEmuANSI === 'ON') return true;
    if (env.ANSICON !== undefined) return true;
    return false;
  }

  return true;
}

export function hideCursor(stream: TerminalStream): void {
  stream.write(`${CSI}?25l`);
}

export function showCursor(stream: TerminalStream): void {
  stream.write(`${CSI}?25h`);
}

export function clearLine(stream: TerminalStream): void {
  stream.write(`${CSI}2K`);
}

export function moveCursorUp(stream: TerminalStream, lines: number): void {
  if (lines <= 0) return;
  stream.write(`${CSI}${lines}A`);
}

export function moveCursorDown(stream: TerminalStream, lines: number): void {
  if (lines <= 0) return;
  stream.write(`${CSI}${lines}B`);
}

export function moveCursorToColumn(stream: TerminalStream, column: number): void {
  const col = Math.max(1, Math.floor(column));
  stream.write(`${CSI}${col}G`);
}

export function eraseDown(stream: TerminalStream): void {
  stream.write(`${CSI}J`);
}

export function carriageReturn(stream: TerminalStream): void {
  stream.write('\r');
}

export function formatDurationMs(durationMs: number): string {
  const total = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export interface InPlaceRendererOptions {
  readonly stream: TerminalStream;
  readonly enabled?: boolean;
}

export class InPlaceRenderer {
  private readonly stream: TerminalStream;
  private readonly enabled: boolean;
  private lastLineCount = 0;

  public constructor(options: InPlaceRendererOptions) {
    this.stream = options.stream;
    this.enabled = options.enabled ?? (options.stream.isTTY === true);
  }

  public render(block: string): void {
    const nextLineCount = countLines(block);

    if (!this.enabled) {
      this.stream.write(block.endsWith('\n') ? block : `${block}\n`);
      this.lastLineCount = 0;
      return;
    }

    if (this.lastLineCount > 0) {
      moveCursorUp(this.stream, this.lastLineCount);
    }

    for (let index = 0; index < this.lastLineCount; index += 1) {
      clearLine(this.stream);
      this.stream.write('\n');
    }

    if (this.lastLineCount > 0) {
      moveCursorUp(this.stream, this.lastLineCount);
    }

    this.stream.write(block);
    if (!block.endsWith('\n')) {
      this.stream.write('\n');
    }

    this.lastLineCount = nextLineCount;
  }

  public reset(): void {
    this.lastLineCount = 0;
  }
}

export function countLines(input: string): number {
  if (input.length === 0) return 0;
  // Count \n, but ignore a trailing newline (rendered blocks are line-based).
  const trailing = input.endsWith('\n') ? 1 : 0;
  return input.split('\n').length - trailing;
}
