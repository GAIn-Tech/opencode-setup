import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

type RuntimeSubcommand =
  | 'telemetry'
  | 'tool-surface'
  | 'skill-tracker'
  | 'workflow-scenarios'
  | 'report-mcp-lifecycle';

export class RuntimeCommand extends BaseCommand {
  public readonly name = 'runtime';
  public readonly description = 'Runtime checks and proofs migrated from infrastructure scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode runtime <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: [
        'telemetry                 Run scripts/runtime-tool-telemetry.mjs',
        'tool-surface              Run scripts/runtime-tool-surface-proof.mjs',
        'skill-tracker             Run scripts/runtime-skill-tracker.mjs',
        'workflow-scenarios        Run scripts/runtime-workflow-scenarios.mjs',
        'report-mcp-lifecycle      Run scripts/report-mcp-lifecycle.mjs'
      ]
    },
    {
      title: 'Options',
      lines: [
        '--output <path>           (tool-surface) Write runtime proof JSON to path',
        '--prompt <text>           (tool-surface) Override proof prompt input',
        '--stdin-file <path>       (skill-tracker) Pipe JSON hook payload to stdin',
        '--help, -h                Show help for runtime'
      ]
    }
  ];

  protected async execute(
    args: readonly string[],
    _context: CommandContext
  ): Promise<CommandExecutionResult> {
    const [rawSubcommand, ...rest] = args;

    if (rawSubcommand === undefined) {
      return {
        exitCode: 1,
        errorMessage: 'Missing runtime subcommand. Run "opencode runtime --help" for usage.'
      };
    }

    const subcommand = rawSubcommand as RuntimeSubcommand | undefined;
    if (
      subcommand !== 'telemetry'
      && subcommand !== 'tool-surface'
      && subcommand !== 'skill-tracker'
      && subcommand !== 'workflow-scenarios'
      && subcommand !== 'report-mcp-lifecycle'
    ) {
      return {
        exitCode: 1,
        errorMessage: `Unknown runtime subcommand: ${rawSubcommand}`
      };
    }

    const options = this.parseOptions(rest);
    const scriptArgs: string[] = [];

    let scriptName = '';
    let stdin: string | undefined;
    if (subcommand === 'telemetry') {
      scriptName = 'runtime-tool-telemetry.mjs';
    } else if (subcommand === 'tool-surface') {
      scriptName = 'runtime-tool-surface-proof.mjs';
      const output = this.getStringOption(options, 'output');
      if (output !== undefined) {
        scriptArgs.push('--output', output);
      }

      const prompt = this.getStringOption(options, 'prompt', 'p');
      if (prompt !== undefined) {
        scriptArgs.push(prompt);
      }
    } else {
      if (subcommand === 'skill-tracker') {
        scriptName = 'runtime-skill-tracker.mjs';
        const stdinFile = this.getStringOption(options, 'stdin-file');
        if (stdinFile !== undefined) {
          stdin = readFileSync(path.resolve(stdinFile), 'utf8');
        }
      } else if (subcommand === 'workflow-scenarios') {
        scriptName = 'runtime-workflow-scenarios.mjs';
      } else {
        scriptName = 'report-mcp-lifecycle.mjs';
      }
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', scriptName);

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Runtime script not found: ${scriptPath}`
      };
    }

    const run = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
      cwd: repoRoot,
      env: process.env,
      encoding: 'utf8',
      input: stdin
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
