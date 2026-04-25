import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

type SystemSubcommand = 'health';

export class SystemCommand extends BaseCommand {
  public readonly name = 'system';
  public readonly description = 'System-level health commands migrated from infrastructure scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode system <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: ['health                    Run scripts/system-health.mjs']
    },
    {
      title: 'Options',
      lines: [
        '--json                    (health) Emit JSON report',
        '--verbose                 (health) Include detailed report sections',
        '--help, -h                Show help for system'
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
        errorMessage: 'Missing system subcommand. Run "opencode system --help" for usage.'
      };
    }

    const subcommand = rawSubcommand as SystemSubcommand;
    if (subcommand !== 'health') {
      return {
        exitCode: 1,
        errorMessage: `Unknown system subcommand: ${subcommand}`
      };
    }

    const options = this.parseOptions(rest);
    const scriptArgs: string[] = [];

    if (this.getBooleanOption(options, 'json')) {
      scriptArgs.push('--json');
    }
    if (this.getBooleanOption(options, 'verbose')) {
      scriptArgs.push('--verbose');
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', 'system-health.mjs');

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `System script not found: ${scriptPath}`
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
