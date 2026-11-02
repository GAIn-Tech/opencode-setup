import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

export class SetupCommand extends BaseCommand {
  public readonly name = 'setup';
  public readonly description = 'Setup commands migrated from infrastructure scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode setup <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: ['resilient                Run scripts/setup-resilient.mjs']
    },
    {
      title: 'Options (setup resilient)',
      lines: [
        '--offline                 Run setup in offline mode',
        '--allow-global-writes     Allow global environment mutations',
        '--report-file <path>      Write setup report payload to file',
        '--help, -h                Show help for setup'
      ]
    }
  ];

  protected async execute(
    args: readonly string[],
    _context: CommandContext
  ): Promise<CommandExecutionResult> {
    const [subcommand, ...rest] = args;

    if (subcommand !== undefined && subcommand !== 'resilient') {
      return {
        exitCode: 1,
        errorMessage: `Unknown setup subcommand: ${subcommand}`
      };
    }

    const options = this.parseOptions(rest);
    const scriptArgs: string[] = [];

    if (this.getBooleanOption(options, 'offline')) {
      scriptArgs.push('--offline');
    }
    if (this.getBooleanOption(options, 'allow-global-writes')) {
      scriptArgs.push('--allow-global-writes');
    }
    const reportFile = this.getStringOption(options, 'report-file');
    if (reportFile !== undefined) {
      scriptArgs.push('--report-file', reportFile);
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', 'setup-resilient.mjs');

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Setup resilient script not found: ${scriptPath}`
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
