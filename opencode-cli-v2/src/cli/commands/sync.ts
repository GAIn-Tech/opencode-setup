import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

export class SyncCommand extends BaseCommand {
  public readonly name = 'sync';
  public readonly description = 'Synchronization commands migrated from infrastructure scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode sync <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: [
        'reconcile                 Run scripts/sync-reconcile.mjs',
        'project-learnings         Run scripts/sync-project-learnings.mjs'
      ]
    },
    {
      title: 'Options',
      lines: [
        '--project <path>           (project-learnings) Project root containing .sisyphus/kb',
        '--dry-run                  (project-learnings) Preview merge without writing global KB',
        '--help, -h                 Show help for sync'
      ]
    }
  ];

  protected async execute(
    args: readonly string[],
    _context: CommandContext
  ): Promise<CommandExecutionResult> {
    const [subcommand, ...rest] = args;

    if (subcommand !== 'reconcile' && subcommand !== 'project-learnings') {
      return {
        exitCode: 1,
        errorMessage: subcommand === undefined
          ? 'Missing sync subcommand. Run "opencode sync --help" for usage.'
          : `Unknown sync subcommand: ${subcommand}`
      };
    }

    const options = this.parseOptions(rest);
    const scriptArgs: string[] = [];
    const scriptName = subcommand === 'reconcile' ? 'sync-reconcile.mjs' : 'sync-project-learnings.mjs';

    if (subcommand === 'project-learnings') {
      const projectPath = this.getStringOption(options, 'project');
      if (projectPath !== undefined) {
        scriptArgs.push('--project', projectPath);
      }
      if (this.getBooleanOption(options, 'dry-run')) {
        scriptArgs.push('--dry-run');
      }
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', scriptName);

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Sync script not found: ${scriptPath}`
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
