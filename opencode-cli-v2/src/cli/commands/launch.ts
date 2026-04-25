import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

type LaunchSubcommand = 'with-dashboard';

export class LaunchCommand extends BaseCommand {
  public readonly name = 'launch';
  public readonly description = 'Launch orchestration commands migrated from infrastructure scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode launch <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: ['with-dashboard            Run scripts/opencode-with-dashboard.mjs']
    },
    {
      title: 'Options',
      lines: [
        '--help, -h                Show help for launch',
        '-- <args...>               Forward additional args to opencode process'
      ]
    }
  ];

  protected async execute(
    args: readonly string[],
    _context: CommandContext
  ): Promise<CommandExecutionResult> {
    const [rawSubcommand, ...rest] = args;

    if (rawSubcommand === undefined) {
      return {
        exitCode: 1,
        errorMessage: 'Missing launch subcommand. Run "opencode launch --help" for usage.'
      };
    }

    const subcommand = rawSubcommand as LaunchSubcommand;
    if (subcommand !== 'with-dashboard') {
      return {
        exitCode: 1,
        errorMessage: `Unknown launch subcommand: ${subcommand}`
      };
    }

    const scriptArgs = rest[0] === '--' ? rest.slice(1) : rest;

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', 'opencode-with-dashboard.mjs');

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Launch script not found: ${scriptPath}`
      };
    }

    const run = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
      cwd: repoRoot,
      env: process.env,
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
