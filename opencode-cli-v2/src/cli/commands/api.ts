import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

export class ApiCommand extends BaseCommand {
  public readonly name = 'api';
  public readonly description = 'API checks migrated from infrastructure scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode api <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: ['sanity                    Run scripts/api-sanity.mjs']
    },
    {
      title: 'Options',
      lines: [
        '--base-url <url>           Set API_BASE_URL for this run',
        '--timeout-ms <n>           Set API_SANITY_TIMEOUT_MS for this run',
        '--help, -h                 Show help for api'
      ]
    }
  ];

  protected async execute(
    args: readonly string[],
    _context: CommandContext
  ): Promise<CommandExecutionResult> {
    const [subcommand, ...rest] = args;

    if (subcommand !== 'sanity') {
      return {
        exitCode: 1,
        errorMessage: subcommand === undefined
          ? 'Missing api subcommand. Run "opencode api --help" for usage.'
          : `Unknown api subcommand: ${subcommand}`
      };
    }

    const options = this.parseOptions(rest);
    const env = { ...process.env } as Record<string, string | undefined>;

    const baseUrl = this.getStringOption(options, 'base-url');
    if (baseUrl !== undefined) {
      env.API_BASE_URL = baseUrl;
    }

    const timeoutMs = this.getStringOption(options, 'timeout-ms');
    if (timeoutMs !== undefined) {
      env.API_SANITY_TIMEOUT_MS = timeoutMs;
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', 'api-sanity.mjs');

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `API sanity script not found: ${scriptPath}`
      };
    }

    const run = spawnSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      env,
      encoding: 'utf8'
    });

    const stdout = `${run.stdout ?? ''}`.trimEnd();
    const stderr = `${run.stderr ?? ''}`.trimEnd();

    return {
      exitCode: run.status ?? 1,
      message: stdout.length > 0 ? stdout : undefined,
      errorMessage: stderr.length > 0 ? stderr : undefined
    };
  }
}
