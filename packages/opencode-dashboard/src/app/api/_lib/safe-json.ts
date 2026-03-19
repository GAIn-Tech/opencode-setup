import { readFile } from 'fs/promises';
import { readFileSync } from 'fs';

type JsonValidator<T> = (value: unknown) => value is T;

type SafeJsonLogger = Pick<Console, 'warn' | 'error'>;

export type ReadJsonFileSafeOptions<T> = {
  fallback?: T;
  logTag?: string;
  strict?: boolean;
  logger?: SafeJsonLogger;
  logOnMissing?: boolean;
  encoding?: BufferEncoding;
  validate?: JsonValidator<T>;
  reviver?: (this: unknown, key: string, value: unknown) => unknown;
};

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
  return value instanceof Error;
}

function isMissingFileError(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ENOENT';
}

function makeErrorMessage(filePath: string, reason: string): string {
  return `Failed to read JSON from ${filePath}: ${reason}`;
}

function getLogContext(options?: { logTag?: string; logger?: SafeJsonLogger }): { tag: string; logger: SafeJsonLogger } {
  return {
    tag: options?.logTag ?? 'Safe JSON',
    logger: options?.logger ?? console,
  };
}

function parseJsonOrThrow<T>(
  raw: string,
  filePath: string,
  validate: JsonValidator<T> | undefined,
  reviver: ReadJsonFileSafeOptions<T>['reviver'],
): T {
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw, reviver);
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(makeErrorMessage(filePath, `invalid JSON (${reason})`));
  }

  if (validate && !validate(parsed)) {
    throw new Error(makeErrorMessage(filePath, 'payload failed validation'));
  }

  return parsed as T;
}

function handleFailure<T>(
  error: unknown,
  filePath: string,
  options: ReadJsonFileSafeOptions<T> | undefined,
): T | null {
  const { tag, logger } = getLogContext(options);
  const strict = options?.strict ?? false;
  const hasFallback = Object.prototype.hasOwnProperty.call(options ?? {}, 'fallback');
  const shouldLogMissing = options?.logOnMissing ?? false;

  if (strict) {
    logger.error(`[${tag}] Failed to read JSON from ${filePath}:`, error);
    throw error;
  }

  if (!isMissingFileError(error) || shouldLogMissing) {
    logger.warn(`[${tag}] Failed to read JSON from ${filePath}:`, error);
  }

  if (hasFallback) {
    return options?.fallback ?? null;
  }

  return null;
}

export async function readJsonFileSafe<T>(
  filePath: string,
  options: ReadJsonFileSafeOptions<T> & { strict: true },
): Promise<T>;
export async function readJsonFileSafe<T>(
  filePath: string,
  options?: ReadJsonFileSafeOptions<T>,
): Promise<T | null>;
export async function readJsonFileSafe<T>(
  filePath: string,
  options?: ReadJsonFileSafeOptions<T>,
): Promise<T | null> {
  const encoding = options?.encoding ?? 'utf-8';

  try {
    const raw = await readFile(filePath, encoding);
    return parseJsonOrThrow<T>(raw, filePath, options?.validate, options?.reviver);
  } catch (error: unknown) {
    return handleFailure(error, filePath, options);
  }
}

export function readJsonFileSafeSync<T>(
  filePath: string,
  options: ReadJsonFileSafeOptions<T> & { strict: true },
): T;
export function readJsonFileSafeSync<T>(
  filePath: string,
  options?: ReadJsonFileSafeOptions<T>,
): T | null;
export function readJsonFileSafeSync<T>(
  filePath: string,
  options?: ReadJsonFileSafeOptions<T>,
): T | null {
  const encoding = options?.encoding ?? 'utf-8';

  try {
    const raw = readFileSync(filePath, encoding);
    return parseJsonOrThrow<T>(raw, filePath, options?.validate, options?.reviver);
  } catch (error: unknown) {
    return handleFailure(error, filePath, options);
  }
}

export function withJsonFileSafe<T>(
  filePath: string,
  options?: ReadJsonFileSafeOptions<T>,
): {
  read: () => Promise<T | null>;
  readSync: () => T | null;
} {
  return {
    read: () => readJsonFileSafe(filePath, options),
    readSync: () => readJsonFileSafeSync(filePath, options),
  };
}

export async function readJsonFileStrict<T>(
  filePath: string,
  options?: Omit<ReadJsonFileSafeOptions<T>, 'strict'>,
): Promise<T> {
  return readJsonFileSafe(filePath, { ...options, strict: true });
}

export function readJsonFileStrictSync<T>(
  filePath: string,
  options?: Omit<ReadJsonFileSafeOptions<T>, 'strict'>,
): T {
  return readJsonFileSafeSync(filePath, { ...options, strict: true });
}
