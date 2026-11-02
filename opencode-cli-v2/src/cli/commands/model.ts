import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

export class ModelCommand extends BaseCommand {
  public readonly name = 'model';
  public readonly description = 'Model management commands migrated from infrastructure scripts.';
  public readonly aliases = ['models'] as const;

  protected readonly usage = 'opencode model <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: [
        'rollback                  Run scripts/model-rollback.mjs',
        'weekly-sync               Run scripts/weekly-model-sync.mjs'
      ]
    },
    {
      title: 'Options (model rollback)',
      lines: [
        '--to-last-good             Roll back to most recent known-good snapshot',
        '--to-timestamp <ISO-8601>  Roll back to snapshot at/before timestamp',
        '--dry-run                  Preview rollback actions without applying',
        '--help, -h                 Show help for model'
      ]
    }
  ];

  protected async execute(
    args: readonly string[],
    _context: CommandContext
  ): Promise<CommandExecutionResult> {
    const [subcommand, ...rest] = args;

    if (subcommand !== undefined && subcommand !== 'rollback' && subcommand !== 'weekly-sync') {
      return {
        exitCode: 1,
        errorMessage: `Unknown model subcommand: ${subcommand}`
      };
    }

    const options = this.parseOptions(rest);
    const scriptArgs: string[] = [];

    if (subcommand !== 'weekly-sync') {
      if (this.getBooleanOption(options, 'to-last-good')) {
        scriptArgs.push('--to-last-good');
      }

      const toTimestamp = this.getStringOption(options, 'to-timestamp');
      if (toTimestamp !== undefined) {
        scriptArgs.push('--to-timestamp', toTimestamp);
      }

      if (this.getBooleanOption(options, 'dry-run')) {
        scriptArgs.push('--dry-run');
      }
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(
      repoRoot,
      'scripts',
      subcommand === 'weekly-sync' ? 'weekly-model-sync.mjs' : 'model-rollback.mjs'
    );

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Model rollback script not found: ${scriptPath}`
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
