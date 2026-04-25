export interface MockStream {
  readonly chunks: string[];
  isTTY?: boolean;
  columns?: number;
  rows?: number;
  write: (chunk: string) => void;
}

export function createMockStream(options: { isTTY?: boolean; columns?: number } = {}): MockStream {
  const chunks: string[] = [];
  return {
    chunks,
    isTTY: options.isTTY,
    columns: options.columns,
    write: (chunk: string) => {
      chunks.push(chunk);
    }
  };
}
