import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

type VerifySubcommand =
  | 'setup'
  | 'integrity'
  | 'bootstrap-prereqs'
  | 'bootstrap-manifest'
  | 'supply-chain'
  | 'portability'
  | 'plugin-readiness'
  | 'plugin-parity'
  | 'no-hidden-exec';

export class VerifyCommand extends BaseCommand {
  public readonly name = 'verify';
  public readonly description = 'Verification commands migrated from infrastructure scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode verify <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: [
        'setup                     Run scripts/verify-setup.mjs',
        'integrity                 Run scripts/integrity-guard.mjs',
        'bootstrap-prereqs         Run scripts/verify-bootstrap-prereqs.mjs',
        'bootstrap-manifest        Run scripts/verify-bootstrap-manifest.mjs',
        'supply-chain              Run scripts/supply-chain-guard.mjs',
        'portability               Run scripts/verify-portability.mjs',
        'plugin-readiness          Run scripts/verify-plugin-readiness.mjs',
        'plugin-parity             Run scripts/verify-plugin-parity.mjs',
        'no-hidden-exec            Run scripts/verify-no-hidden-exec.mjs'
      ]
    },
    {
      title: 'Options',
      lines: [
        '--required-bun-version <v>  (setup) Set OPENCODE_REQUIRED_BUN_VERSION for this run',
        '--bun-path <path>           (setup) Set OPENCODE_BUN_PATH for this run',
        '--plugin-scope <scope>      (setup) Set PLUGIN_SCOPE for this run',
        '--strict                    (bootstrap-prereqs|supply-chain|portability) Enable strict checks',
        '--json                      (bootstrap-prereqs|portability) Emit JSON output',
        '--probe-mcp                 (portability) Probe local MCP server coverage',
        '--release                   (supply-chain) Evaluate release-mode policy',
        '--release-mode              (supply-chain) Evaluate release-mode policy',
        '--help, -h                  Show help for verify'
      ]
    }
  ];

  protected async execute(
    args: readonly string[],
    _context: CommandContext
  ): Promise<CommandExecutionResult> {
    const [rawSubcommand, ...rest] = args;
    const subcommand = (rawSubcommand ?? 'setup') as VerifySubcommand;

    if (
      subcommand !== 'setup'
      && subcommand !== 'integrity'
      && subcommand !== 'bootstrap-prereqs'
      && subcommand !== 'bootstrap-manifest'
      && subcommand !== 'supply-chain'
      && subcommand !== 'portability'
      && subcommand !== 'plugin-readiness'
      && subcommand !== 'plugin-parity'
      && subcommand !== 'no-hidden-exec'
    ) {
      return {
        exitCode: 1,
        errorMessage: `Unknown verify subcommand: ${String(rawSubcommand)}`
      };
    }

    const options = this.parseOptions(rest);
    const scriptArgs: string[] = [];

    let scriptName = '';
    if (subcommand === 'setup') {
      scriptName = 'verify-setup.mjs';
    } else if (subcommand === 'integrity') {
      scriptName = 'integrity-guard.mjs';
    } else if (subcommand === 'bootstrap-prereqs') {
      scriptName = 'verify-bootstrap-prereqs.mjs';
      if (this.getBooleanOption(options, 'strict')) {
        scriptArgs.push('--strict');
      }
      if (this.getBooleanOption(options, 'json')) {
        scriptArgs.push('--json');
      }
    } else if (subcommand === 'bootstrap-manifest') {
      scriptName = 'verify-bootstrap-manifest.mjs';
    } else if (subcommand === 'supply-chain') {
      scriptName = 'supply-chain-guard.mjs';
      if (this.getBooleanOption(options, 'release')) {
        scriptArgs.push('--release');
      }
      if (this.getBooleanOption(options, 'release-mode')) {
        scriptArgs.push('--release-mode');
      }
      if (this.getBooleanOption(options, 'strict')) {
        scriptArgs.push('--strict');
      }
    } else if (subcommand === 'plugin-readiness') {
      scriptName = 'verify-plugin-readiness.mjs';
      scriptArgs.push(...rest);
    } else if (subcommand === 'plugin-parity') {
      scriptName = 'verify-plugin-parity.mjs';
      scriptArgs.push(...rest);
    } else if (subcommand === 'no-hidden-exec') {
      scriptName = 'verify-no-hidden-exec.mjs';
      scriptArgs.push(...rest);
    } else {
      scriptName = 'verify-portability.mjs';
      if (this.getBooleanOption(options, 'strict')) {
        scriptArgs.push('--strict');
      }
      if (this.getBooleanOption(options, 'probe-mcp')) {
        scriptArgs.push('--probe-mcp');
      }
      if (this.getBooleanOption(options, 'json')) {
        scriptArgs.push('--json');
      }
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', scriptName);

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Verify script not found: ${scriptPath}`
      };
    }

    const env = { ...process.env } as Record<string, string | undefined>;
    if (subcommand === 'setup') {
      const requiredBunVersion = this.getStringOption(options, 'required-bun-version');
      const bunPath = this.getStringOption(options, 'bun-path');
      const pluginScope = this.getStringOption(options, 'plugin-scope');

      if (requiredBunVersion !== undefined) {
        env.OPENCODE_REQUIRED_BUN_VERSION = requiredBunVersion;
      }
      if (bunPath !== undefined) {
        env.OPENCODE_BUN_PATH = bunPath;
      }
      if (pluginScope !== undefined) {
        env.PLUGIN_SCOPE = pluginScope;
      }
    }

    const run = spawnSync(process.execPath, [scriptPath, ...scriptArgs], {
      cwd: repoRoot,
      env,
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
