import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

export class RunBatchCommand extends BaseCommand {
  public readonly name = 'run-batch';
  public readonly description = 'Execute tasks in batch mode from a task file.';
  public readonly aliases = ['batch'] as const;

  protected readonly usage = 'opencode run-batch [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Options',
      lines: [
        '--config, -c <path>       Batch config file path',
        '--tasks <path>            File containing tasks to run',
        '--trajectory, -T <path>   Save combined trajectory output',
        '--help, -h                Show help for run-batch'
      ]
    },
    {
      title: 'Examples',
      lines: ['opencode run-batch --config batch.yaml --tasks tasks.txt']
    }
  ];

  protected async execute(
    args: readonly string[],
    context: CommandContext
  ): Promise<CommandExecutionResult> {
    const options = this.parseOptions(args);
    const configPath =
      this.getStringOption(options, 'config', 'c') ?? context.globalOptions.configPath ?? 'default';
    const tasksPath = this.getStringOption(options, 'tasks') ?? options.positionals[0] ?? 'none';
    const trajectoryPath = this.getStringOption(options, 'trajectory', 'T') ?? 'none';

    return {
      exitCode: 0,
      message: [
        'command=run-batch',
        `config=${configPath}`,
        `tasks=${tasksPath}`,
        `trajectory=${trajectoryPath}`
      ].join(' ')
    };
  }
}
