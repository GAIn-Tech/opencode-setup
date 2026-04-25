import { visibleLength } from './colors';

export type BorderStyle = 'unicode' | 'ascii';

export interface BorderChars {
  readonly topLeft: string;
  readonly topRight: string;
  readonly bottomLeft: string;
  readonly bottomRight: string;
  readonly horizontal: string;
  readonly vertical: string;
  readonly leftT: string;
  readonly rightT: string;
  readonly topT: string;
  readonly bottomT: string;
  readonly cross: string;
}

export function getBorderChars(style: BorderStyle): BorderChars {
  if (style === 'ascii') {
    return {
      topLeft: '+',
      topRight: '+',
      bottomLeft: '+',
      bottomRight: '+',
      horizontal: '-',
      vertical: '|',
      leftT: '+',
      rightT: '+',
      topT: '+',
      bottomT: '+',
      cross: '+'
    };
  }

  return {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│',
    leftT: '├',
    rightT: '┤',
    topT: '┬',
    bottomT: '┴',
    cross: '┼'
  };
}

export interface BoxOptions {
  readonly width: number;
  readonly paddingX?: number;
  readonly borderStyle?: BorderStyle;
}

type BoxEntry =
  | { readonly type: 'line'; readonly text: string }
  | { readonly type: 'separator' }
  | { readonly type: 'blank' };

export class Box {
  private readonly width: number;
  private readonly paddingX: number;
  private readonly border: BorderChars;
  private readonly entries: BoxEntry[] = [];

  public constructor(options: BoxOptions) {
    this.width = Math.max(10, Math.floor(options.width));
    this.paddingX = Math.max(0, Math.floor(options.paddingX ?? 1));
    this.border = getBorderChars(options.borderStyle ?? 'unicode');
  }

  public header(text: string): this {
    this.entries.push({ type: 'line', text });
    return this;
  }

  public line(text: string): this {
    this.entries.push({ type: 'line', text });
    return this;
  }

  public blank(): this {
    this.entries.push({ type: 'blank' });
    return this;
  }

  public separator(): this {
    this.entries.push({ type: 'separator' });
    return this;
  }

  public content(text: string): this {
    const innerWidth = this.getInnerWidth();
    const lines = wrapText(text, innerWidth);
    for (const line of lines) {
      this.entries.push({ type: 'line', text: line });
    }
    return this;
  }

  public toString(): string {
    const innerWidth = this.width - 2;
    const top = `${this.border.topLeft}${this.border.horizontal.repeat(innerWidth)}${this.border.topRight}`;
    const bottom = `${this.border.bottomLeft}${this.border.horizontal.repeat(innerWidth)}${this.border.bottomRight}`;

    const body: string[] = [];
    for (const entry of this.entries) {
      if (entry.type === 'separator') {
        body.push(`${this.border.leftT}${this.border.horizontal.repeat(innerWidth)}${this.border.rightT}`);
        continue;
      }

      if (entry.type === 'blank') {
        body.push(this.renderLine(''));
        continue;
      }

      body.push(this.renderLine(entry.text));
    }

    return [top, ...body, bottom].join('\n');
  }

  private getInnerWidth(): number {
    // 2 borders + horizontal padding.
    return Math.max(1, this.width - 2 - this.paddingX * 2);
  }

  private renderLine(raw: string): string {
    const available = this.getInnerWidth();
    const truncated = truncateText(raw, available);
    const visible = visibleLength(truncated);
    const padRight = Math.max(0, available - visible);
    const paddingLeft = ' '.repeat(this.paddingX);
    const paddingRight = ' '.repeat(this.paddingX);
    return `${this.border.vertical}${paddingLeft}${truncated}${' '.repeat(padRight)}${paddingRight}${this.border.vertical}`;
  }
}

export interface TableOptions {
  readonly maxWidth?: number;
  readonly columnGap?: number;
  readonly align?: readonly ('left' | 'right')[];
}

export function renderTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  options: TableOptions = {}
): string {
  const gap = Math.max(1, Math.floor(options.columnGap ?? 2));
  const colCount = headers.length;
  const align = options.align ?? [];

  const allRows: string[][] = [headers.map(String), ...rows.map((row) => headers.map((_, idx) => String(row[idx] ?? '')))]
    .map((row) => row.slice(0, colCount));

  const widths: number[] = Array.from({ length: colCount }, () => 0);
  for (const row of allRows) {
    for (let i = 0; i < colCount; i += 1) {
      const cell = row[i] ?? '';
      widths[i] = Math.max(widths[i] ?? 0, visibleLength(cell));
    }
  }

  let totalWidth = widths.reduce((sum, w) => sum + w, 0) + gap * (colCount - 1);
  const maxWidth = options.maxWidth;
  if (typeof maxWidth === 'number' && Number.isFinite(maxWidth) && maxWidth > 0 && totalWidth > maxWidth) {
    // Shrink columns proportionally with a floor of 3 chars.
    const minCol = 3;
    const available = Math.max(0, Math.floor(maxWidth) - gap * (colCount - 1));
    const current = widths.reduce((sum, w) => sum + w, 0);
    const next: number[] = [];
    for (let i = 0; i < colCount; i += 1) {
      const w = widths[i] ?? 0;
      const scaled = current > 0 ? Math.floor((w / current) * available) : Math.floor(available / colCount);
      next.push(Math.max(minCol, scaled));
    }
    widths.splice(0, widths.length, ...next);
    totalWidth = widths.reduce((sum, w) => sum + w, 0) + gap * (colCount - 1);

    // If still too wide due to floors, shave rightmost columns.
    const target = Math.floor(maxWidth);
    while (totalWidth > target) {
      let shaved = false;
      for (let i = colCount - 1; i >= 0 && totalWidth > target; i -= 1) {
        const w = widths[i] ?? 0;
        if (w > minCol) {
          widths[i] = w - 1;
          totalWidth -= 1;
          shaved = true;
        }
      }
      if (!shaved) {
        break;
      }
    }
  }

  const lines: string[] = [];
  for (let r = 0; r < allRows.length; r += 1) {
    const row = allRows[r] ?? [];
    const cells: string[] = [];
    for (let c = 0; c < colCount; c += 1) {
      const raw = row[c] ?? '';
      const width = widths[c] ?? 0;
      const cell = truncateText(raw, width);
      const pad = Math.max(0, width - visibleLength(cell));
      const a = align[c];
      if (a === 'right') {
        cells.push(`${' '.repeat(pad)}${cell}`);
      } else {
        cells.push(`${cell}${' '.repeat(pad)}`);
      }
    }
    lines.push(cells.join(' '.repeat(gap)));

    if (r === 0) {
      lines.push(widths.map((w) => '-'.repeat(Math.max(1, w))).join(' '.repeat(gap)));
    }
  }

  return lines.join('\n');
}

export function wrapText(input: string, width: number): string[] {
  const max = Math.max(1, Math.floor(width));
  const lines: string[] = [];
  const chunks = input.replace(/\r\n/g, '\n').split('\n');

  for (const chunk of chunks) {
    if (chunk.length === 0) {
      lines.push('');
      continue;
    }

    let rest = chunk;
    while (rest.length > 0) {
      if (rest.length <= max) {
        lines.push(rest);
        break;
      }

      let cut = rest.lastIndexOf(' ', max);
      if (cut <= 0) {
        cut = max;
      }

      const head = rest.slice(0, cut).trimEnd();
      lines.push(head);
      rest = rest.slice(cut).trimStart();
    }
  }

  return lines;
}

export function truncateText(input: string, width: number, ellipsis = '…'): string {
  const max = Math.max(0, Math.floor(width));
  if (max === 0) return '';
  if (visibleLength(input) <= max) return input;
  if (max <= visibleLength(ellipsis)) return input.slice(0, max);
  const sliceWidth = max - visibleLength(ellipsis);
  return `${input.slice(0, sliceWidth)}${ellipsis}`;
}
