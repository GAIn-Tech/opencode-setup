import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

export class BootstrapCommand extends BaseCommand {
  public readonly name = 'bootstrap';
  public readonly description = 'Bootstrap commands migrated from infrastructure scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode bootstrap [subcommand] [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: [
        'runtime                   Run scripts/bootstrap-runtime.mjs (default)',
        'cache-guard               Run scripts/bootstrap-cache-guard.mjs'
      ]
    },
    {
      title: 'Options',
      lines: [
        '--status                   (runtime) Force status output mode',
        '--offline                  (cache-guard) Verify offline cache prerequisites',
        '--help, -h                 Show help for bootstrap'
      ]
    },
    {
      title: 'Examples',
      lines: ['opencode bootstrap', 'opencode bootstrap runtime --status', 'opencode bootstrap cache-guard --offline']
    }
  ];

  protected async execute(
    args: readonly string[],
    _context: CommandContext
  ): Promise<CommandExecutionResult> {
    const [rawSubcommand, ...rest] = args;

    if (rawSubcommand !== undefined && rawSubcommand !== 'runtime' && rawSubcommand !== 'cache-guard') {
      return {
        exitCode: 1,
        errorMessage: `Unknown bootstrap subcommand: ${rawSubcommand}`
      };
    }

    const subcommand = rawSubcommand ?? 'runtime';
    const options = this.parseOptions(rawSubcommand === undefined ? args : rest);

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(
      repoRoot,
      'scripts',
      subcommand === 'runtime' ? 'bootstrap-runtime.mjs' : 'bootstrap-cache-guard.mjs'
    );

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Bootstrap script not found: ${scriptPath}`
      };
    }

    const scriptArgs: string[] = [];
    if (subcommand === 'runtime') {
      if (this.getBooleanOption(options, 'status')) {
        scriptArgs.push('--status');
      }
    } else if (this.getBooleanOption(options, 'offline')) {
      scriptArgs.push('--offline');
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
