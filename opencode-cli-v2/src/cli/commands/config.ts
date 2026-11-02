import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

type ConfigAction = 'get' | 'set' | 'copy' | 'validate' | 'migrate';

export class ConfigCommand extends BaseCommand {
  public readonly name = 'config';
  public readonly description = 'Get, set, validate, and migrate CLI configuration.';
  public readonly aliases = ['cfg'] as const;

  protected readonly usage = 'opencode config <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: [
        'get <key>                 Read config value',
        'set <key> <value>         Write config value',
        'copy                      Run scripts/copy-config.mjs',
        'validate                  Validate current config',
        'migrate                   Migrate config schema'
      ]
    }
  ];

  protected async execute(
    args: readonly string[],
    context: CommandContext
  ): Promise<CommandExecutionResult> {
    const [subcommand, ...rest] = args;
    const action: ConfigAction = this.normalizeAction(subcommand);
    const options = this.parseOptions(rest);
    const scopedConfig =
      this.getStringOption(options, 'config', 'c') ?? context.globalOptions.configPath ?? 'default';

    if (action === 'copy') {
      const repoRoot = path.resolve(import.meta.dir, '../../../../');
      const scriptPath = path.join(repoRoot, 'scripts', 'copy-config.mjs');

      if (!existsSync(scriptPath)) {
        return {
          exitCode: 1,
          errorMessage: `Copy config script not found: ${scriptPath}`
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

    if (action === 'validate' || action === 'migrate') {
      return {
        exitCode: 0,
        message: ['command=config', `action=${action}`, `config=${scopedConfig}`].join(' ')
      };
    }

    const key = options.positionals[0] ?? 'none';

    if (action === 'get') {
      return {
        exitCode: 0,
        message: ['command=config', 'action=get', `key=${key}`, `config=${scopedConfig}`].join(' ')
      };
    }

    const value = options.positionals[1] ?? 'none';
    return {
      exitCode: 0,
      message: [
        'command=config',
        'action=set',
        `key=${key}`,
        `value=${value}`,
        `config=${scopedConfig}`
      ].join(' ')
    };
  }

  private normalizeAction(rawSubcommand: string | undefined): ConfigAction {
    if (rawSubcommand === 'get') {
      return 'get';
    }

    if (rawSubcommand === 'set') {
      return 'set';
    }

    if (rawSubcommand === 'copy') {
      return 'copy';
    }

    if (rawSubcommand === 'migrate') {
      return 'migrate';
    }

    return 'validate';
  }
}
