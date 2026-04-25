import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

type CiSubcommand = 'warning-budget';

export class CiCommand extends BaseCommand {
  public readonly name = 'ci';
  public readonly description = 'CI governance commands migrated from infrastructure scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode ci <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: ['warning-budget            Run scripts/ci-warning-budget.mjs']
    },
    {
      title: 'Options',
      lines: [
        '--capture                 (warning-budget) Capture and persist warning baseline',
        '--help, -h                Show help for ci'
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
        errorMessage: 'Missing ci subcommand. Run "opencode ci --help" for usage.'
      };
    }

    const subcommand = rawSubcommand as CiSubcommand;
    if (subcommand !== 'warning-budget') {
      return {
        exitCode: 1,
        errorMessage: `Unknown ci subcommand: ${subcommand}`
      };
    }

    const options = this.parseOptions(rest);
    const scriptArgs: string[] = [];

    if (this.getBooleanOption(options, 'capture')) {
      scriptArgs.push('--capture');
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', 'ci-warning-budget.mjs');

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `CI script not found: ${scriptPath}`
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
