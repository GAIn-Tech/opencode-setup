import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

type CommitSubcommand = 'governance';

export class CommitCommand extends BaseCommand {
  public readonly name = 'commit';
  public readonly description = 'Commit governance commands migrated from infrastructure scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode commit <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: ['governance                Run scripts/commit-governance.mjs']
    },
    {
      title: 'Options',
      lines: [
        '--base <ref>               (governance) Base ref for commit range',
        '--head <ref>               (governance) Head ref for commit range (default: HEAD)',
        '--staged                   (governance) Validate staged changes using message file or HEAD',
        '--message-file <path>      (governance) Commit message file for staged validation',
        '--help, -h                 Show help for commit'
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
        errorMessage: 'Missing commit subcommand. Run "opencode commit --help" for usage.'
      };
    }

    const subcommand = rawSubcommand as CommitSubcommand;
    if (subcommand !== 'governance') {
      return {
        exitCode: 1,
        errorMessage: `Unknown commit subcommand: ${String(rawSubcommand)}`
      };
    }

    const options = this.parseOptions(rest);
    const scriptArgs: string[] = [];

    const base = this.getStringOption(options, 'base');
    if (base !== undefined) {
      scriptArgs.push('--base', base);
    }

    const head = this.getStringOption(options, 'head');
    if (head !== undefined) {
      scriptArgs.push('--head', head);
    }

    if (this.getBooleanOption(options, 'staged')) {
      scriptArgs.push('--staged');
    }

    const messageFile = this.getStringOption(options, 'message-file');
    if (messageFile !== undefined) {
      scriptArgs.push('--message-file', messageFile);
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', 'commit-governance.mjs');

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Commit governance script not found: ${scriptPath}`
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
