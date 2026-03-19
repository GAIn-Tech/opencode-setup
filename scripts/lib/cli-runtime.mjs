import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import path from 'node:path';

const commandExistsCache = new Map();

/**
 * Shared runtime harness for CLI wrapper scripts.
 *
 * Example:
 * const json = await runCommandJson('gh', ['issue', 'list', '--json', 'number'], { shell: true });
 * printJson(json);
 *
 * installProcessErrorHandlers({ prefix: '[my-script]' });
 */

/**
 * @typedef {{
 *   command: string,
 *   args: string[],
 *   code?: number | null,
 *   signal?: NodeJS.Signals | null,
 *   stdout?: string,
 *   stderr?: string,
 *   originalError?: unknown,
 * }} CliRuntimeErrorDetails
 */

export class CliRuntimeError extends Error {
  /**
   * @param {string} message
   * @param {CliRuntimeErrorDetails} details
   */
  constructor(message, details) {
    super(message);
    this.name = 'CliRuntimeError';
    this.details = details;
  }
}

/**
 * @param {string} command
 * @param {{ allowPath?: boolean, useCache?: boolean }} [options]
 * @returns {boolean}
 */
export function commandExists(command, options = {}) {
  const { allowPath = false, useCache = true } = options;
  if (!command || typeof command !== 'string') return false;
  if (!allowPath && (command.includes('/') || command.includes('\\'))) return false;

  if (useCache && commandExistsCache.has(command)) {
    return commandExistsCache.get(command) === true;
  }

  let exists = false;
  try {
    if (typeof Bun !== 'undefined' && typeof Bun.which === 'function') {
      exists = Boolean(Bun.which(command));
    } else {
      const isWindows = process.platform === 'win32';
      const pathEnv = process.env.PATH || '';
      const pathEntries = pathEnv.split(path.delimiter).filter(Boolean);
      const pathext = isWindows
        ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
        : [''];
      const commandHasExt = Boolean(path.extname(command));

      for (const entry of pathEntries) {
        if (isWindows) {
          if (commandHasExt) {
            const candidate = path.join(entry, command);
            try {
              accessSync(candidate, constants.F_OK);
              exists = true;
              break;
            } catch {
              // continue
            }
          } else {
            for (const ext of pathext) {
              const candidate = path.join(entry, `${command}${ext}`);
              try {
                accessSync(candidate, constants.F_OK);
                exists = true;
                break;
              } catch {
                // continue
              }
            }
            if (exists) break;
          }
        } else {
          const candidate = path.join(entry, command);
          try {
            accessSync(candidate, constants.X_OK);
            exists = true;
            break;
          } catch {
            // continue
          }
        }
      }
    }
  } catch {
    exists = false;
  }

  if (useCache) commandExistsCache.set(command, exists);
  return exists;
}

/**
 * @param {string} command
 * @param {string[]} args
 * @returns {string}
 */
export function formatCommand(command, args = []) {
  const serializedArgs = args.map((arg) => {
    if (/\s/.test(arg)) return `"${arg.replace(/"/g, '\\"')}"`;
    return arg;
  });
  return [command, ...serializedArgs].join(' ');
}

/**
 * @param {unknown} error
 * @returns {string}
 */
export function toErrorMessage(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {unknown} error
 * @param {{ stderr?: string, code?: number | null }} [extra]
 * @returns {string}
 */
export function formatSpawnError(command, args, error, extra = {}) {
  const label = formatCommand(command, args);
  const parts = [`Command failed: ${label}`];
  if (extra.code !== undefined && extra.code !== null) parts.push(`exit=${extra.code}`);
  if (extra.stderr) parts.push(`stderr=${extra.stderr.trim()}`);
  parts.push(`reason=${toErrorMessage(error)}`);
  return parts.join(' | ');
}

/**
 * @param {string} message
 * @param {number} [exitCode]
 * @param {{ logger?: Pick<Console, 'error'>, details?: unknown }} [options]
 * @returns {never}
 */
export function fatal(message, exitCode = 1, options = {}) {
  const logger = options.logger || console;
  logger.error(`Error: ${message}`);
  if (options.details !== undefined) {
    logger.error(typeof options.details === 'string' ? options.details : JSON.stringify(options.details, null, 2));
  }
  process.exit(exitCode);
}

/**
 * @typedef {{
 *   cwd?: string,
 *   env?: NodeJS.ProcessEnv,
 *   shell?: boolean,
 *   input?: string,
 *   stdio?: 'pipe' | 'inherit',
 *   logger?: Pick<Console, 'error'>,
 *   logCommand?: boolean,
 *   allowNonZero?: boolean,
 * }} RunCommandOptions
 */

/**
 * @param {string} command
 * @param {string[]} args
 * @param {RunCommandOptions} [options]
 * @returns {Promise<{ code: number | null, signal: NodeJS.Signals | null, stdout: string, stderr: string }>}
 */
export async function runCommand(command, args, options = {}) {
  const {
    cwd,
    env,
    shell = false,
    input,
    stdio = 'pipe',
    logger = console,
    logCommand = false,
    allowNonZero = false,
  } = options;

  if (logCommand) {
    logger.error(`Running: ${formatCommand(command, args)}`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      shell,
      stdio: stdio === 'inherit' ? 'inherit' : ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    if (stdio !== 'inherit') {
      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.on('error', (error) => {
      reject(new CliRuntimeError(formatSpawnError(command, args, error), {
        command,
        args,
        stdout,
        stderr,
        originalError: error,
      }));
    });

    child.on('close', (code, signal) => {
      if (!allowNonZero && code !== 0) {
        reject(new CliRuntimeError(formatSpawnError(command, args, new Error('non-zero exit code'), {
          stderr,
          code,
        }), {
          command,
          args,
          code,
          signal,
          stdout,
          stderr,
        }));
        return;
      }
      resolve({ code, signal, stdout, stderr });
    });

    if (input && child.stdin) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

/**
 * @typedef {RunCommandOptions & {
 *   parseMode?: 'strict' | 'loose',
 * }} RunCommandJsonOptions
 */

/**
 * Run a command and parse stdout as JSON.
 * - strict: throws on invalid JSON
 * - loose: returns trimmed stdout string when parsing fails
 *
 * @param {string} command
 * @param {string[]} args
 * @param {RunCommandJsonOptions} [options]
 * @returns {Promise<unknown>}
 */
export async function runCommandJson(command, args, options = {}) {
  const { parseMode = 'strict' } = options;
  const result = await runCommand(command, args, options);
  const raw = result.stdout.trim();

  try {
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    if (parseMode === 'loose') {
      return raw;
    }
    throw new CliRuntimeError(formatSpawnError(command, args, error, {
      stderr: result.stderr,
      code: result.code,
    }), {
      command,
      args,
      code: result.code,
      signal: result.signal,
      stdout: result.stdout,
      stderr: result.stderr,
      originalError: error,
    });
  }
}

/**
 * @param {unknown} value
 * @returns {void}
 */
export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Install standard process-level fatal handlers.
 *
 * @param {{
 *   logger?: Pick<Console, 'error'>,
 *   prefix?: string,
 *   exitCode?: number,
 *   cleanup?: (() => Promise<void> | void) | null,
 * }} [options]
 * @returns {() => void} unregister function
 */
export function installProcessErrorHandlers(options = {}) {
  const {
    logger = console,
    prefix = '',
    exitCode = 1,
    cleanup = null,
  } = options;

  const withPrefix = (label) => (prefix ? `${prefix} ${label}` : label);

  /** @param {unknown} reason */
  const handleFatalRejection = async (reason) => {
    logger.error(`${withPrefix('Unhandled rejection:')} ${toErrorMessage(reason)}`);
    if (cleanup) await cleanup();
    process.exit(exitCode);
  };

  /** @param {unknown} error */
  const handleFatalException = async (error) => {
    logger.error(`${withPrefix('Uncaught error:')} ${toErrorMessage(error)}`);
    if (cleanup) await cleanup();
    process.exit(exitCode);
  };

  process.on('unhandledRejection', handleFatalRejection);
  process.on('uncaughtException', handleFatalException);

  return () => {
    process.off('unhandledRejection', handleFatalRejection);
    process.off('uncaughtException', handleFatalException);
  };
}
