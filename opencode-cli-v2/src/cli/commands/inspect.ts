import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

export class InspectCommand extends BaseCommand {
  public readonly name = 'inspect';
  public readonly description = 'Inspect trajectories with SWE-agent style output.';
  public readonly aliases = ['inspector'] as const;

  protected readonly usage = 'opencode inspect [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Options',
      lines: [
        '--trajectory, -T <path>   Trajectory file to inspect',
        '--step <number>           Inspect a specific step',
        '--help, -h                Show help for inspect'
      ]
    },
    {
      title: 'Examples',
      lines: ['opencode inspect --trajectory my-task.json']
    }
  ];

  protected async execute(
    args: readonly string[],
    _context: CommandContext
  ): Promise<CommandExecutionResult> {
    const options = this.parseOptions(args);
    const trajectory = this.getStringOption(options, 'trajectory', 'T') ?? options.positionals[0] ?? 'none';
    const step = this.getStringOption(options, 'step') ?? 'all';

    return {
      exitCode: 0,
      message: ['command=inspect', `trajectory=${trajectory}`, `step=${step}`].join(' ')
    };
  }
}
