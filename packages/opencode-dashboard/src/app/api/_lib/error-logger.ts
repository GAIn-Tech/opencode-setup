import os from 'os';
import path from 'path';
import fs from 'fs/promises';

// Error log directory
const ERROR_LOG_DIR = path.join(os.homedir(), '.opencode', 'logs');

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  source: string;
  message: string;
  stack?: string;
  metadata?: Record<string, unknown>;
}

export async function logError(
  source: string,
  message: string,
  options?: {
    error?: Error;
    metadata?: Record<string, unknown>;
    level?: LogLevel;
  }
): Promise<void> {
  const logEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: options?.level || 'error',
    source,
    message,
    metadata: options?.metadata
  };

  if (options?.error) {
    logEntry.stack = options.error.stack;
  }

  try {
    // Ensure log directory exists
    await fs.mkdir(ERROR_LOG_DIR, { recursive: true });

    // Write to daily log file
    const date = new Date().toISOString().split('T')[0];
    const logFile = path.join(ERROR_LOG_DIR, `error-${date}.ndjson`);
    
    await fs.appendFile(logFile, JSON.stringify(logEntry) + '\n', 'utf-8');
  } catch (writeError) {
    // Fallback to console if file write fails
    console.error('[error-logger] Failed to write to log file:', writeError);
    console.error('[error-logger] Log entry:', logEntry);
  }
}

export function createErrorLogger(source: string) {
  return (message: string, options?: { error?: Error; metadata?: Record<string, unknown> }) => {
    return logError(source, message, options);
  };
}
