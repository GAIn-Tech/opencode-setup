import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

export class TestCommand extends BaseCommand {
  public readonly name = 'test';
  public readonly description = 'Infrastructure test commands migrated from scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode test <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: ['fault-injection           Run scripts/fault-injection-tests.mjs']
    },
    {
      title: 'Options',
      lines: ['--help, -h                Show help for test']
    }
  ];

  protected async execute(
    args: readonly string[],
    _context: CommandContext
  ): Promise<CommandExecutionResult> {
    const [subcommand] = args;

    if (subcommand !== 'fault-injection') {
      return {
        exitCode: 1,
        errorMessage: subcommand === undefined
          ? 'Missing test subcommand. Run "opencode test --help" for usage.'
          : `Unknown test subcommand: ${subcommand}`
      };
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', 'fault-injection-tests.mjs');

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Fault injection script not found: ${scriptPath}`
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
