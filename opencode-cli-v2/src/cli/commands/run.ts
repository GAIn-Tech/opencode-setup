import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { promptForTaskInput } from '../prompts';
import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

export class RunCommand extends BaseCommand {
  public readonly name = 'run';
  public readonly description = 'Execute runtime tasks and migration run-scripts.';
  public readonly aliases = ['r', 'execute'] as const;

  protected readonly usage = 'opencode run [subcommand] [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: ['package-smokes            Run scripts/run-package-smokes.mjs']
    },
    {
      title: 'Options',
      lines: [
        '--task, -t <text>         Task prompt to execute',
        '--config, -c <path>       Config file path',
        '--trajectory, -T <path>   Save/load trajectory file',
        '--dry-run                 Validate plan without execution',
        '--json                    (package-smokes) Emit JSON output',
        '--help, -h                Show help for run'
      ]
    },
    {
      title: 'Examples',
      lines: [
        'opencode run --config agent.yaml --task "Implement auth"',
        'opencode run --trajectory task.json',
        'opencode run package-smokes --json'
      ]
    }
  ];

  protected async execute(
    args: readonly string[],
    context: CommandContext
  ): Promise<CommandExecutionResult> {
    const [candidateSubcommand, ...rest] = args;

    if (candidateSubcommand === 'package-smokes') {
      return this.executePackageSmokes(rest);
    }

    return this.executeTaskRun(args, context);
  }

  private async executeTaskRun(
    args: readonly string[],
    context: CommandContext
  ): Promise<CommandExecutionResult> {
    const options = this.parseOptions(args);

    const configPath =
      this.getStringOption(options, 'config', 'c') ?? context.globalOptions.configPath ?? 'default';

    const trajectoryPath = this.getStringOption(options, 'trajectory', 'T') ?? 'none';
    const dryRun = this.getBooleanOption(options, 'dry-run');

    let task = this.getStringOption(options, 'task', 't') ?? options.positionals[0];
    if (task === undefined && trajectoryPath === 'none') {
      task = await promptForTaskInput(context.prompts, 'Task is required. Enter task:');
    }

    const message = [
      'command=run',
      `task=${task ?? 'none'}`,
      `config=${configPath}`,
      `trajectory=${trajectoryPath}`,
      `dryRun=${String(dryRun)}`
    ].join(' ');

    return {
      exitCode: 0,
      message
    };
  }

  private async executePackageSmokes(args: readonly string[]): Promise<CommandExecutionResult> {
    const options = this.parseOptions(args);
    const scriptArgs: string[] = [];

    if (this.getBooleanOption(options, 'json')) {
      scriptArgs.push('--json');
    }

    if (this.getBooleanOption(options, 'dry-run')) {
      scriptArgs.push('--dry-run');
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', 'run-package-smokes.mjs');

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Run script not found: ${scriptPath}`
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
