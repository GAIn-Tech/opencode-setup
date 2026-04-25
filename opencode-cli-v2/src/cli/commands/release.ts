import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

type ReleaseSubcommand = 'portability-verdict';

const RELEASE_SCRIPT_MAP: Record<ReleaseSubcommand, string> = {
  'portability-verdict': 'release-portability-verdict.mjs'
};

export class ReleaseCommand extends BaseCommand {
  public readonly name = 'release';
  public readonly description = 'Release commands migrated from infrastructure scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode release <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: ['portability-verdict       Run scripts/release-portability-verdict.mjs']
    },
    {
      title: 'Options',
      lines: ['--help, -h                Show help for release']
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
        errorMessage: 'Missing release subcommand. Run "opencode release --help" for usage.'
      };
    }

    const subcommand = rawSubcommand as ReleaseSubcommand;
    const scriptName = RELEASE_SCRIPT_MAP[subcommand];
    if (scriptName === undefined) {
      return {
        exitCode: 1,
        errorMessage: `Unknown release subcommand: ${rawSubcommand}`
      };
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', scriptName);
    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Release script not found: ${scriptPath}`
      };
    }

    const run = spawnSync(process.execPath, [scriptPath, ...rest], {
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
