import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

export class RepairCommand extends BaseCommand {
  public readonly name = 'repair';
  public readonly description = 'Guided environment remediation via scripts/repair.mjs.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode repair [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Options',
      lines: [
        '--safe                    Run in safe mode (default)',
        '--unsafe                  Enable unsafe mode (includes hash regeneration)',
        '--rollback <backup-id>    Restore from repair backup id',
        '--help, -h                Show help for repair'
      ]
    }
  ];

  protected async execute(
    args: readonly string[],
    _context: CommandContext
  ): Promise<CommandExecutionResult> {
    const options = this.parseOptions(args);
    const scriptArgs: string[] = [];

    if (this.getBooleanOption(options, 'safe')) {
      scriptArgs.push('--safe');
    }

    if (this.getBooleanOption(options, 'unsafe')) {
      scriptArgs.push('--unsafe');
    }

    const rollbackId = this.getStringOption(options, 'rollback');
    if (rollbackId !== undefined) {
      scriptArgs.push('--rollback', rollbackId);
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', 'repair.mjs');

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Repair script not found: ${scriptPath}`
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
