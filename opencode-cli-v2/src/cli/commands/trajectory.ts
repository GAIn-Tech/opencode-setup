import { promptForTaskInput } from '../prompts';
import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

type TrajectoryAction = 'save' | 'load' | 'list';

export class TrajectoryCommand extends BaseCommand {
  public readonly name = 'trajectory';
  public readonly description = 'Save, load, and inspect trajectory artifacts.';
  public readonly aliases = ['traj'] as const;

  protected readonly usage = 'opencode trajectory <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: [
        'list                      List known trajectories',
        'save <path>               Save current trajectory',
        'load <path>               Load trajectory for reuse'
      ]
    },
    {
      title: 'Options',
      lines: ['--config, -c <path>       Config file path for trajectory commands']
    }
  ];

  protected async execute(
    args: readonly string[],
    context: CommandContext
  ): Promise<CommandExecutionResult> {
    const [subcommand, ...rest] = args;
    const action: TrajectoryAction = this.normalizeAction(subcommand);
    const options = this.parseOptions(rest);

    if (action === 'list') {
      return {
        exitCode: 0,
        message: 'command=trajectory action=list'
      };
    }

    let path = options.positionals[0];
    if (path === undefined) {
      path = await promptForTaskInput(context.prompts, 'Trajectory path is required. Enter path:');
    }

    const configPath =
      this.getStringOption(options, 'config', 'c') ?? context.globalOptions.configPath ?? 'default';

    return {
      exitCode: 0,
      message: ['command=trajectory', `action=${action}`, `path=${path}`, `config=${configPath}`].join(' ')
    };
  }

  private normalizeAction(rawSubcommand: string | undefined): TrajectoryAction {
    if (rawSubcommand === 'save') {
      return 'save';
    }

    if (rawSubcommand === 'load') {
      return 'load';
    }

    return 'list';
  }
}
