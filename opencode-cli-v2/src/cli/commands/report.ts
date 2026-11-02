import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

type ReportSubcommand = 'portability';

const REPORT_SCRIPT_MAP: Record<ReportSubcommand, string> = {
  portability: 'generate-portability-report.mjs'
};

export class ReportCommand extends BaseCommand {
  public readonly name = 'report';
  public readonly description = 'Report generation commands migrated from infrastructure scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode report <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: ['portability              Run scripts/generate-portability-report.mjs']
    },
    {
      title: 'Options',
      lines: ['--help, -h                Show help for report']
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
        errorMessage: 'Missing report subcommand. Run "opencode report --help" for usage.'
      };
    }

    const subcommand = rawSubcommand as ReportSubcommand;
    const scriptName = REPORT_SCRIPT_MAP[subcommand];
    if (scriptName === undefined) {
      return {
        exitCode: 1,
        errorMessage: `Unknown report subcommand: ${rawSubcommand}`
      };
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', scriptName);
    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Report script not found: ${scriptPath}`
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
