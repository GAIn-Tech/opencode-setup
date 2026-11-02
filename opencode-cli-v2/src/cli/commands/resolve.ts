import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

export class ResolveCommand extends BaseCommand {
  public readonly name = 'resolve';
  public readonly description = 'Path resolution commands migrated from infrastructure scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode resolve <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: ['root                     Run scripts/resolve-root.mjs']
    },
    {
      title: 'Options',
      lines: ['--help, -h                Show help for resolve']
    }
  ];

  protected async execute(
    args: readonly string[],
    _context: CommandContext
  ): Promise<CommandExecutionResult> {
    const [subcommand] = args;

    if (subcommand !== undefined && subcommand !== 'root') {
      return {
        exitCode: 1,
        errorMessage: `Unknown resolve subcommand: ${subcommand}`
      };
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', 'resolve-root.mjs');

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Resolve root script not found: ${scriptPath}`
      };
    }

    const run = spawnSync(process.execPath, [scriptPath], {
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
