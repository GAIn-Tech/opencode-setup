import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

export class IngestCommand extends BaseCommand {
  public readonly name = 'ingest';
  public readonly description = 'Session ingestion commands migrated from scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode ingest <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: ['sessions                  Run scripts/ingest-sessions.mjs']
    },
    {
      title: 'Options',
      lines: ['--help, -h                Show help for ingest']
    }
  ];

  protected async execute(
    args: readonly string[],
    _context: CommandContext
  ): Promise<CommandExecutionResult> {
    const [subcommand] = args;

    if (subcommand !== 'sessions') {
      return {
        exitCode: 1,
        errorMessage: subcommand === undefined
          ? 'Missing ingest subcommand. Run "opencode ingest --help" for usage.'
          : `Unknown ingest subcommand: ${subcommand}`
      };
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', 'ingest-sessions.mjs');

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Ingest script not found: ${scriptPath}`
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
