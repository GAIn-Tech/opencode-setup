import type { PromptAdapter } from '../prompts';

export interface CliIO {
  readonly writeOut: (line: string) => void;
  readonly writeErr: (line: string) => void;
}

export interface GlobalCliOptions {
  readonly configPath?: string;
}

export interface CommandContext {
  readonly io: CliIO;
  readonly prompts: PromptAdapter;
  readonly globalOptions: GlobalCliOptions;
}

export interface CommandExecutionResult {
  readonly exitCode: number;
  readonly message?: string;
  readonly errorMessage?: string;
}

export interface ParsedOptionMap {
  readonly values: Record<string, string | boolean | undefined>;
  readonly positionals: string[];
}

export interface HelpSection {
  readonly title: string;
  readonly lines: readonly string[];
}

export abstract class BaseCommand {
  public abstract readonly name: string;
  public abstract readonly description: string;
  public abstract readonly aliases: readonly string[];

  protected abstract readonly usage: string;
  protected abstract readonly sections: readonly HelpSection[];

  public async run(args: readonly string[], context: CommandContext): Promise<CommandExecutionResult> {
    if (args.includes('--help') || args.includes('-h')) {
      return {
        exitCode: 0,
        message: this.getHelp()
      };
    }

    return this.execute(args, context);
  }

  public getHelp(): string {
    const header = [`${this.name}: ${this.description}`, '', `Usage: ${this.usage}`];
    const details = this.sections.flatMap((section) => [
      '',
      `${section.title}:`,
      ...section.lines.map((line) => `  ${line}`)
    ]);

    return [...header, ...details].join('\n');
  }

  protected parseOptions(args: readonly string[]): ParsedOptionMap {
    const values: Record<string, string | boolean | undefined> = {};
    const positionals: string[] = [];

    for (let index = 0; index < args.length; index += 1) {
      const token = args[index];
      if (token === undefined) {
        continue;
      }

      if (token.startsWith('--')) {
        const eq = token.indexOf('=');
        if (eq > 2) {
          const key = token.slice(2, eq);
          values[key] = token.slice(eq + 1);
          continue;
        }

        const key = token.slice(2);
        const next = args[index + 1];

        if (next !== undefined && !next.startsWith('-')) {
          values[key] = next;
          index += 1;
          continue;
        }

        values[key] = true;
        continue;
      }

      if (token.startsWith('-') && token.length === 2) {
        const shortKey = token.slice(1);
        const next = args[index + 1];

        if (next !== undefined && !next.startsWith('-')) {
          values[shortKey] = next;
          index += 1;
          continue;
        }

        values[shortKey] = true;
        continue;
      }

      positionals.push(token);
    }

    return {
      values,
      positionals
    };
  }

  protected getStringOption(
    options: ParsedOptionMap,
    longName: string,
    shortName?: string
  ): string | undefined {
    const longValue = options.values[longName];
    if (typeof longValue === 'string') {
      return longValue;
    }

    if (shortName === undefined) {
      return undefined;
    }

    const shortValue = options.values[shortName];
    return typeof shortValue === 'string' ? shortValue : undefined;
  }

  protected getBooleanOption(
    options: ParsedOptionMap,
    longName: string,
    shortName?: string
  ): boolean {
    if (options.values[longName] === true) {
      return true;
    }

    if (shortName === undefined) {
      return false;
    }

    return options.values[shortName] === true;
  }

  protected abstract execute(
    args: readonly string[],
    context: CommandContext
  ): Promise<CommandExecutionResult>;
}
