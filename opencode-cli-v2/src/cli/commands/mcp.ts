import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

type McpSubcommand = 'mirror-coherence' | 'smoke-harness';

export class McpCommand extends BaseCommand {
  public readonly name = 'mcp';
  public readonly description = 'MCP infrastructure commands migrated from scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode mcp <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: [
        'mirror-coherence          Run scripts/mcp-mirror-coherence.mjs',
        'smoke-harness             Run scripts/mcp-smoke-harness.mjs'
      ]
    },
    {
      title: 'Options',
      lines: [
        '--write                   (mirror-coherence) Sync files when drift detected',
        '--json                    (smoke-harness) Emit JSON payload',
        '--output <path>           (smoke-harness) Write JSON proof payload to file',
        '--days <n>                (smoke-harness) Recent exercise window in days',
        '--help, -h                Show help for mcp'
      ]
    }
  ];

  protected async execute(
    args: readonly string[],
    _context: CommandContext
  ): Promise<CommandExecutionResult> {
    const [rawSubcommand, ...rest] = args;

    if (rawSubcommand !== 'mirror-coherence' && rawSubcommand !== 'smoke-harness') {
      return {
        exitCode: 1,
        errorMessage: rawSubcommand === undefined
          ? 'Missing mcp subcommand. Run "opencode mcp --help" for usage.'
          : `Unknown mcp subcommand: ${rawSubcommand}`
      };
    }

    const subcommand = rawSubcommand as McpSubcommand;
    const options = this.parseOptions(rest);
    const scriptArgs: string[] = [];

    const scriptName = subcommand === 'mirror-coherence'
      ? 'mcp-mirror-coherence.mjs'
      : 'mcp-smoke-harness.mjs';

    if (subcommand === 'mirror-coherence') {
      if (this.getBooleanOption(options, 'write')) {
        scriptArgs.push('--write');
      }
    } else {
      if (this.getBooleanOption(options, 'json')) {
        scriptArgs.push('--json');
      }
      const output = this.getStringOption(options, 'output');
      if (output !== undefined) {
        scriptArgs.push('--output', output);
      }
      const days = this.getStringOption(options, 'days');
      if (days !== undefined) {
        scriptArgs.push('--days', days);
      }
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', scriptName);

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `MCP script not found: ${scriptPath}`
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
