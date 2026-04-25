import pkg from '../../package.json';
import { createCommands } from './commands';
import type { BaseCommand, CliIO, CommandExecutionResult, GlobalCliOptions } from './commands';
import { createPromptAdapter } from './prompts';
import type { PromptAdapter } from './prompts';

interface ParsedCliInput {
  readonly commandName?: string;
  readonly commandArgs: readonly string[];
  readonly globalOptions: GlobalCliOptions;
  readonly showHelp: boolean;
  readonly showVersion: boolean;
}

export interface CliExecutionOutput {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ExecuteCliOptions {
  readonly prompts?: PromptAdapter;
}

function createInMemoryIO(): { io: CliIO; readonly out: string[]; readonly err: string[] } {
  const out: string[] = [];
  const err: string[] = [];

  return {
    io: {
      writeOut: (line: string) => out.push(line),
      writeErr: (line: string) => err.push(line)
    },
    out,
    err
  };
}

function parseCliInput(argv: readonly string[]): ParsedCliInput {
  const commandArgs: string[] = [];
  let commandName: string | undefined;
  let showHelp = false;
  let showVersion = false;
  let configPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) {
      continue;
    }

    if (commandName === undefined) {
      if (token === '--help' || token === '-h') {
        showHelp = true;
        continue;
      }

      if (token === '--version' || token === '-v' || token === '-V') {
        showVersion = true;
        continue;
      }

      if (token === '--config' || token === '-c') {
        const next = argv[index + 1];
        if (next !== undefined) {
          configPath = next;
          index += 1;
          continue;
        }
      }

      if (token.startsWith('--config=')) {
        configPath = token.slice('--config='.length);
        continue;
      }

      if (!token.startsWith('-')) {
        commandName = token;
        continue;
      }
    }

    commandArgs.push(token);
  }

  return {
    commandName,
    commandArgs,
    globalOptions: {
      configPath
    },
    showHelp,
    showVersion
  };
}

function renderRootHelp(commands: readonly BaseCommand[]): string {
  const commandLines = commands.map((command) => {
    const aliases = command.aliases.length > 0 ? ` (aliases: ${command.aliases.join(', ')})` : '';
    return `  ${command.name.padEnd(11, ' ')} ${command.description}${aliases}`;
  });

  return [
    'OpenCode CLI v2',
    '',
    'Usage: opencode <command> [options]',
    '',
    'Commands:',
    ...commandLines,
    '',
    'Global Options:',
    '  --help, -h                Show help output',
    '  --version, -v             Show CLI version',
    '  --config, -c <path>       Global config file',
    '',
    'Run "opencode <command> --help" for command-specific usage.'
  ].join('\n');
}

function resolveCommand(commands: readonly BaseCommand[], commandName: string): BaseCommand | undefined {
  return commands.find((candidate) => {
    if (candidate.name === commandName) {
      return true;
    }

    return candidate.aliases.includes(commandName);
  });
}

async function executeCommand(
  command: BaseCommand,
  args: readonly string[],
  io: CliIO,
  prompts: PromptAdapter,
  globalOptions: GlobalCliOptions
): Promise<CommandExecutionResult> {
  return command.run(args, {
    io,
    prompts,
    globalOptions
  });
}

export async function executeCli(
  argv: readonly string[],
  options: ExecuteCliOptions = {}
): Promise<CliExecutionOutput> {
  const commands = createCommands();
  const parsed = parseCliInput(argv);
  const mem = createInMemoryIO();
  const prompts = options.prompts ?? createPromptAdapter();

  if (parsed.showVersion) {
    mem.io.writeOut(pkg.version);
    return {
      exitCode: 0,
      stdout: `${mem.out.join('\n')}\n`,
      stderr: mem.err.join('\n')
    };
  }

  if (parsed.showHelp || parsed.commandName === undefined) {
    mem.io.writeOut(renderRootHelp(commands));
    return {
      exitCode: 0,
      stdout: `${mem.out.join('\n')}\n`,
      stderr: mem.err.join('\n')
    };
  }

  const command = resolveCommand(commands, parsed.commandName);
  if (command === undefined) {
    mem.io.writeErr(`Unknown command: ${parsed.commandName}`);
    mem.io.writeErr('Run "opencode --help" to see available commands.');
    return {
      exitCode: 1,
      stdout: mem.out.join('\n'),
      stderr: `${mem.err.join('\n')}\n`
    };
  }

  const result = await executeCommand(
    command,
    parsed.commandArgs,
    mem.io,
    prompts,
    parsed.globalOptions
  );

  if (result.message !== undefined) {
    mem.io.writeOut(result.message);
  }

  if (result.errorMessage !== undefined) {
    mem.io.writeErr(result.errorMessage);
  }

  return {
    exitCode: result.exitCode,
    stdout: mem.out.length > 0 ? `${mem.out.join('\n')}\n` : '',
    stderr: mem.err.length > 0 ? `${mem.err.join('\n')}\n` : ''
  };
}

export async function runCli(argv: readonly string[]): Promise<number> {
  const commands = createCommands();
  const parsed = parseCliInput(argv);
  const io: CliIO = {
    writeOut: (line) => console.log(line),
    writeErr: (line) => console.error(line)
  };

  if (parsed.showVersion) {
    io.writeOut(pkg.version);
    return 0;
  }

  if (parsed.showHelp || parsed.commandName === undefined) {
    io.writeOut(renderRootHelp(commands));
    return 0;
  }

  const command = resolveCommand(commands, parsed.commandName);
  if (command === undefined) {
    io.writeErr(`Unknown command: ${parsed.commandName}`);
    io.writeErr('Run "opencode --help" to see available commands.');
    return 1;
  }

  const result = await executeCommand(
    command,
    parsed.commandArgs,
    io,
    createPromptAdapter(),
    parsed.globalOptions
  );

  if (result.message !== undefined) {
    io.writeOut(result.message);
  }

  if (result.errorMessage !== undefined) {
    io.writeErr(result.errorMessage);
  }

  return result.exitCode;
}

if (import.meta.main) {
  const code = await runCli(Bun.argv.slice(2));
  process.exit(code);
}

export * from './commands';
export * from './prompts';
