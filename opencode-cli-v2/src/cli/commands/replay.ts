import { promptForTaskInput } from '../prompts';
import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

export class ReplayCommand extends BaseCommand {
  public readonly name = 'replay';
  public readonly description = 'Replay a saved trajectory step-by-step.';
  public readonly aliases = ['rp'] as const;

  protected readonly usage = 'opencode replay <trajectory> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Options',
      lines: [
        '--step <number>           Replay up to a specific step',
        '--help, -h                Show help for replay'
      ]
    },
    {
      title: 'Examples',
      lines: ['opencode replay my-task.json --step 5']
    }
  ];

  protected async execute(
    args: readonly string[],
    context: CommandContext
  ): Promise<CommandExecutionResult> {
    const options = this.parseOptions(args);
    const trajectory =
      options.positionals[0]
      ?? this.getStringOption(options, 'trajectory')
      ?? await promptForTaskInput(context.prompts, 'Trajectory path is required. Enter path:');

    const step = this.getStringOption(options, 'step') ?? 'all';

    return {
      exitCode: 0,
      message: ['command=replay', `trajectory=${trajectory}`, `step=${step}`].join(' ')
    };
  }
}
