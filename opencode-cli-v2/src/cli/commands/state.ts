import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

type StateSubcommand =
  | 'preload-persist'
  | 'init-kb'
  | 'meta-super-cycle'
  | 'synthesize-meta-kb'
  | 'skill-profile-loader';

export class StateCommand extends BaseCommand {
  public readonly name = 'state';
  public readonly description = 'State persistence commands migrated from infrastructure scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode state <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: [
        'preload-persist           Run scripts/preload-state-persist.mjs',
        'init-kb                   Run scripts/init-kb.mjs',
        'meta-super-cycle          Run scripts/meta-super-cycle.mjs',
        'synthesize-meta-kb        Run scripts/synthesize-meta-kb.mjs',
        'skill-profile-loader      Run scripts/skill-profile-loader.mjs'
      ]
    },
    {
      title: 'Options',
      lines: [
        '--export                  (preload-persist) Persist state file overrides to disk',
        '--import                  (preload-persist) Load disk overrides to state file',
        '--sync                    (preload-persist) Report sync delta between state and disk',
        '--dry-run                 (preload-persist) Preview without writes',
        '--apply                   (preload-persist) Apply import/export writes',
        '--clear                   (preload-persist) Clear state file after export',
        '--help, -h                Show help for state'
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
        errorMessage: 'Missing state subcommand. Run "opencode state --help" for usage.'
      };
    }

    const subcommand = rawSubcommand as StateSubcommand;
    if (
      subcommand !== 'preload-persist'
      && subcommand !== 'init-kb'
      && subcommand !== 'meta-super-cycle'
      && subcommand !== 'synthesize-meta-kb'
      && subcommand !== 'skill-profile-loader'
    ) {
      return {
        exitCode: 1,
        errorMessage: `Unknown state subcommand: ${String(rawSubcommand)}`
      };
    }

    const options = this.parseOptions(rest);
    const scriptArgs: string[] = [];

    let scriptName = 'preload-state-persist.mjs';
    if (subcommand === 'preload-persist') {
      if (this.getBooleanOption(options, 'export')) {
        scriptArgs.push('--export');
      }
      if (this.getBooleanOption(options, 'import')) {
        scriptArgs.push('--import');
      }
      if (this.getBooleanOption(options, 'sync')) {
        scriptArgs.push('--sync');
      }
      if (this.getBooleanOption(options, 'dry-run')) {
        scriptArgs.push('--dry-run');
      }
      if (this.getBooleanOption(options, 'apply')) {
        scriptArgs.push('--apply');
      }
      if (this.getBooleanOption(options, 'clear')) {
        scriptArgs.push('--clear');
      }
      scriptArgs.push(...options.positionals);
    } else if (subcommand === 'init-kb') {
      scriptName = 'init-kb.mjs';
      scriptArgs.push(...rest);
    } else if (subcommand === 'meta-super-cycle') {
      scriptName = 'meta-super-cycle.mjs';
      scriptArgs.push(...rest);
    } else if (subcommand === 'synthesize-meta-kb') {
      scriptName = 'synthesize-meta-kb.mjs';
      scriptArgs.push(...rest);
    } else {
      scriptName = 'skill-profile-loader.mjs';
      scriptArgs.push(...rest);
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', scriptName);

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `State script not found: ${scriptPath}`
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
