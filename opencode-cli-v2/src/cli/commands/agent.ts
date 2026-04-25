import { promptForTaskInput } from '../prompts';
import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

type AgentAction = 'list' | 'spawn' | 'kill';

export class AgentCommand extends BaseCommand {
  public readonly name = 'agent';
  public readonly description = 'Manage spawned agents and runtime workers.';
  public readonly aliases = ['agents'] as const;

  protected readonly usage = 'opencode agent <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: [
        'list                      List active agents',
        'spawn [options]           Spawn a new agent instance',
        'kill <id>                 Kill a running agent'
      ]
    },
    {
      title: 'Spawn Options',
      lines: [
        '--type <name>             Agent type/profile to spawn',
        '--task <text>             Task for spawned agent',
        '--config, -c <path>       Config file path'
      ]
    }
  ];

  protected async execute(
    args: readonly string[],
    context: CommandContext
  ): Promise<CommandExecutionResult> {
    const [subcommand, ...rest] = args;
    const action: AgentAction = this.normalizeAction(subcommand);
    const options = this.parseOptions(rest);

    if (action === 'list') {
      return {
        exitCode: 0,
        message: 'command=agent action=list'
      };
    }

    if (action === 'kill') {
      const id = options.positionals[0] ?? 'none';
      return {
        exitCode: 0,
        message: ['command=agent', 'action=kill', `id=${id}`].join(' ')
      };
    }

    const type = this.getStringOption(options, 'type') ?? 'default';
    const configPath =
      this.getStringOption(options, 'config', 'c') ?? context.globalOptions.configPath ?? 'default';
    let task = this.getStringOption(options, 'task') ?? options.positionals[0];
    if (task === undefined) {
      task = await promptForTaskInput(context.prompts, 'Agent task is required. Enter task:');
    }

    return {
      exitCode: 0,
      message: [
        'command=agent',
        'action=spawn',
        `type=${type}`,
        `task=${task}`,
        `config=${configPath}`
      ].join(' ')
    };
  }

  private normalizeAction(rawSubcommand: string | undefined): AgentAction {
    if (rawSubcommand === 'spawn') {
      return 'spawn';
    }

    if (rawSubcommand === 'kill') {
      return 'kill';
    }

    return 'list';
  }
}
