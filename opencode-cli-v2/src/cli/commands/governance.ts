import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

type GovernanceSubcommand = 'docs-check' | 'docs-gate';

const GOVERNANCE_SCRIPT_MAP: Record<GovernanceSubcommand, string> = {
  'docs-check': 'docs-governance-check.mjs',
  'docs-gate': 'docs-gate.mjs'
};

export class GovernanceCommand extends BaseCommand {
  public readonly name = 'governance';
  public readonly description = 'Governance checks migrated from infrastructure scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode governance <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: [
        'docs-check                Run scripts/docs-governance-check.mjs',
        'docs-gate                 Run scripts/docs-gate.mjs'
      ]
    },
    {
      title: 'Options',
      lines: ['--help, -h                Show help for governance']
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
        errorMessage: 'Missing governance subcommand. Run "opencode governance --help" for usage.'
      };
    }

    const subcommand = rawSubcommand as GovernanceSubcommand;
    const scriptName = GOVERNANCE_SCRIPT_MAP[subcommand];
    if (scriptName === undefined) {
      return {
        exitCode: 1,
        errorMessage: `Unknown governance subcommand: ${rawSubcommand}`
      };
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', scriptName);
    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Governance script not found: ${scriptPath}`
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
