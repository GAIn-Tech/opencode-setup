import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

type CheckSubcommand = 'runtime-compliance' | 'env-contract' | 'hardcoded-paths' | 'learning-gate' | 'agents-drift';

export class CheckCommand extends BaseCommand {
  public readonly name = 'check';
  public readonly description = 'Compliance checks migrated from infrastructure scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode check <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: [
        'runtime-compliance        Run scripts/runtime-context-compliance.mjs',
        'env-contract              Run scripts/env-contract-check.mjs',
        'hardcoded-paths           Run scripts/check-hardcoded-paths.mjs',
        'learning-gate             Run scripts/learning-gate.mjs',
        'agents-drift              Run scripts/check-agents-drift.mjs'
      ]
    },
    {
      title: 'Options',
      lines: [
        '--json                    (runtime-compliance) Emit JSON marker payload',
        '--output <path>           (runtime-compliance) Write proof payload to path',
        '--write-allowlist         (hardcoded-paths) Generate allowlist from current codebase',
        '--staged                  (learning-gate) Check staged changes only',
        '--base <ref>              (learning-gate) Diff against base ref',
        '--verify-hashes           (learning-gate) Treat hash drift as hard failure',
        '--generate-hashes         (learning-gate) Refresh governance hash baseline',
        '--dry-run                 (agents-drift) Print report/proposal without writing files',
        '--help, -h                Show help for check'
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
        errorMessage: 'Missing check subcommand. Run "opencode check --help" for usage.'
      };
    }

    const subcommand = rawSubcommand as CheckSubcommand | undefined;

    if (
      subcommand !== undefined
      && subcommand !== 'runtime-compliance'
      && subcommand !== 'env-contract'
      && subcommand !== 'hardcoded-paths'
      && subcommand !== 'learning-gate'
      && subcommand !== 'agents-drift'
    ) {
      return {
        exitCode: 1,
        errorMessage: `Unknown check subcommand: ${subcommand}`
      };
    }

    const options = this.parseOptions(rest);
    const scriptArgs: string[] = [];

    let scriptName = '';
    if (subcommand === 'runtime-compliance') {
      scriptName = 'runtime-context-compliance.mjs';
      if (this.getBooleanOption(options, 'json')) {
        scriptArgs.push('--json');
      }
      const outputPath = this.getStringOption(options, 'output');
      if (outputPath !== undefined) {
        scriptArgs.push('--output', outputPath);
      }
    } else if (subcommand === 'env-contract') {
      scriptName = 'env-contract-check.mjs';
    } else if (subcommand === 'hardcoded-paths') {
      scriptName = 'check-hardcoded-paths.mjs';
      if (this.getBooleanOption(options, 'write-allowlist')) {
        scriptArgs.push('--write-allowlist');
      }
    } else if (subcommand === 'agents-drift') {
      scriptName = 'check-agents-drift.mjs';
      if (this.getBooleanOption(options, 'dry-run')) {
        scriptArgs.push('--dry-run');
      }
    } else {
      scriptName = 'learning-gate.mjs';
      if (this.getBooleanOption(options, 'staged')) {
        scriptArgs.push('--staged');
      }
      const base = this.getStringOption(options, 'base');
      if (base !== undefined) {
        scriptArgs.push('--base', base);
      }
      if (this.getBooleanOption(options, 'verify-hashes')) {
        scriptArgs.push('--verify-hashes');
      }
      if (this.getBooleanOption(options, 'generate-hashes')) {
        scriptArgs.push('--generate-hashes');
      }
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', scriptName);

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Check script not found: ${scriptPath}`
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
