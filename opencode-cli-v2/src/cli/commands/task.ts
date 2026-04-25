import { promptForTaskInput } from '../prompts';
import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

type TaskAction = 'list' | 'queue' | 'cancel';

export class TaskCommand extends BaseCommand {
  public readonly name = 'task';
  public readonly description = 'Manage task queue state and execution order.';
  public readonly aliases = ['tasks'] as const;

  protected readonly usage = 'opencode task <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: [
        'list                      List queued tasks',
        'queue [task]              Queue a task for later execution',
        'cancel <id>               Cancel queued task by id'
      ]
    }
  ];

  protected async execute(
    args: readonly string[],
    context: CommandContext
  ): Promise<CommandExecutionResult> {
    const [subcommand, ...rest] = args;
    const action: TaskAction = this.normalizeAction(subcommand);
    const options = this.parseOptions(rest);

    if (action === 'list') {
      return {
        exitCode: 0,
        message: 'command=task action=list'
      };
    }

    if (action === 'cancel') {
      const id = options.positionals[0] ?? 'none';
      return {
        exitCode: 0,
        message: ['command=task', 'action=cancel', `id=${id}`].join(' ')
      };
    }

    let task = options.positionals[0] ?? this.getStringOption(options, 'task', 't');
    if (task === undefined) {
      task = await promptForTaskInput(context.prompts, 'Task is required. Enter task to queue:');
    }

    return {
      exitCode: 0,
      message: ['command=task', 'action=queue', `task=${task}`].join(' ')
    };
  }

  private normalizeAction(rawSubcommand: string | undefined): TaskAction {
    if (rawSubcommand === 'queue') {
      return 'queue';
    }

    if (rawSubcommand === 'cancel') {
      return 'cancel';
    }

    return 'list';
  }
}
