import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

export class HealthCommand extends BaseCommand {
  public readonly name = 'health';
  public readonly description = 'Run infrastructure health checks migrated from scripts/health-check.mjs.';
  public readonly aliases = ['doctor'] as const;

  protected readonly usage = 'opencode health [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Options',
      lines: [
        '--env-profile <profile>    Set OPENCODE_HEALTH_ENV_PROFILE (none|core|mcp|strict)',
        '--help, -h                 Show help for health'
      ]
    },
    {
      title: 'Examples',
      lines: ['opencode health', 'opencode health --env-profile strict']
    }
  ];

  protected async execute(
    args: readonly string[],
    _context: CommandContext
  ): Promise<CommandExecutionResult> {
    const options = this.parseOptions(args);
    const profile = this.getStringOption(options, 'env-profile');

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', 'health-check.mjs');

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Health check script not found: ${scriptPath}`
      };
    }

    const env = { ...process.env };
    if (profile !== undefined) {
      env.OPENCODE_HEALTH_ENV_PROFILE = profile;
    }

    const run = spawnSync(process.execPath, [scriptPath], {
      cwd: repoRoot,
      env,
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
