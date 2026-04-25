import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

type ValidateSubcommand =
  | 'config'
  | 'models'
  | 'launcher-contract'
  | 'policies-structure'
  | 'plugin-compatibility'
  | 'fallback-consistency'
  | 'control-plane-schema'
  | 'legacy-config'
  | 'legacy-skills'
  | 'legacy-agents'
  | 'legacy-plugins'
  | 'legacy-models'
  | 'legacy-routing'
  | 'legacy-state'
  | 'legacy-context'
  | 'legacy-learning'
  | 'legacy-health'
  | 'legacy-telemetry'
  | 'legacy-security'
  | 'legacy-governance'
  | 'legacy-docs'
  | 'legacy-tests'
  | 'legacy-ci';

const VALIDATE_SCRIPT_BY_SUBCOMMAND: Record<ValidateSubcommand, string> = {
  config: 'validate-config.mjs',
  models: 'validate-models.mjs',
  'launcher-contract': 'validate-launcher-contract.mjs',
  'policies-structure': 'validate-policies-structure.mjs',
  'plugin-compatibility': 'validate-plugin-compatibility.mjs',
  'fallback-consistency': 'validate-fallback-consistency.mjs',
  'control-plane-schema': 'validate-control-plane-schema.mjs',
  'legacy-config': 'validate-legacy-config.mjs',
  'legacy-skills': 'validate-legacy-skills.mjs',
  'legacy-agents': 'validate-legacy-agents.mjs',
  'legacy-plugins': 'validate-legacy-plugins.mjs',
  'legacy-models': 'validate-legacy-models.mjs',
  'legacy-routing': 'validate-legacy-routing.mjs',
  'legacy-state': 'validate-legacy-state.mjs',
  'legacy-context': 'validate-legacy-context.mjs',
  'legacy-learning': 'validate-legacy-learning.mjs',
  'legacy-health': 'validate-legacy-health.mjs',
  'legacy-telemetry': 'validate-legacy-telemetry.mjs',
  'legacy-security': 'validate-legacy-security.mjs',
  'legacy-governance': 'validate-legacy-governance.mjs',
  'legacy-docs': 'validate-legacy-docs.mjs',
  'legacy-tests': 'validate-legacy-tests.mjs',
  'legacy-ci': 'validate-legacy-ci.mjs'
};

export class ValidateCommand extends BaseCommand {
  public readonly name = 'validate';
  public readonly description = 'Validation commands migrated from infrastructure scripts.';
  public readonly aliases = [] as const;

  protected readonly usage = 'opencode validate <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: [
        'config                    Run scripts/validate-config.mjs',
        'models                    Run scripts/validate-models.mjs',
        'launcher-contract         Run scripts/validate-launcher-contract.mjs',
        'policies-structure        Run scripts/validate-policies-structure.mjs',
        'plugin-compatibility      Run scripts/validate-plugin-compatibility.mjs',
        'fallback-consistency      Run scripts/validate-fallback-consistency.mjs',
        'control-plane-schema      Run scripts/validate-control-plane-schema.mjs',
        'legacy-config             Run scripts/validate-legacy-config.mjs',
        'legacy-skills             Run scripts/validate-legacy-skills.mjs',
        'legacy-agents             Run scripts/validate-legacy-agents.mjs',
        'legacy-plugins            Run scripts/validate-legacy-plugins.mjs',
        'legacy-models             Run scripts/validate-legacy-models.mjs',
        'legacy-routing            Run scripts/validate-legacy-routing.mjs',
        'legacy-state              Run scripts/validate-legacy-state.mjs',
        'legacy-context            Run scripts/validate-legacy-context.mjs',
        'legacy-learning           Run scripts/validate-legacy-learning.mjs',
        'legacy-health             Run scripts/validate-legacy-health.mjs',
        'legacy-telemetry          Run scripts/validate-legacy-telemetry.mjs',
        'legacy-security           Run scripts/validate-legacy-security.mjs',
        'legacy-governance         Run scripts/validate-legacy-governance.mjs',
        'legacy-docs               Run scripts/validate-legacy-docs.mjs',
        'legacy-tests              Run scripts/validate-legacy-tests.mjs',
        'legacy-ci                 Run scripts/validate-legacy-ci.mjs'
      ]
    },
    {
      title: 'Options',
      lines: [
        '--file <path>              (config) Validate a specific config file',
        '--json                     (config) Emit JSON output',
        '--quiet                    (config) Suppress output (exit code only)',
        '--no-warnings              (config) Exclude warning checks',
        '--write                    (launcher-contract) Update contract artifacts',
        '--help, -h                 Show help for validate'
      ]
    }
  ];

  protected async execute(
    args: readonly string[],
    _context: CommandContext
  ): Promise<CommandExecutionResult> {
    const [rawSubcommand, ...rest] = args;
    const subcommand = (rawSubcommand ?? 'config') as ValidateSubcommand;

    if (!Object.hasOwn(VALIDATE_SCRIPT_BY_SUBCOMMAND, subcommand)) {
      return {
        exitCode: 1,
        errorMessage: `Unknown validate subcommand: ${subcommand}`
      };
    }

    const scriptArgs: string[] = [];
    const options = this.parseOptions(rest);

    let scriptName = VALIDATE_SCRIPT_BY_SUBCOMMAND[subcommand];
    if (subcommand === 'config') {
      const file = this.getStringOption(options, 'file', 'f');
      if (file !== undefined) {
        scriptArgs.push('--file', file);
      }
      if (this.getBooleanOption(options, 'json')) {
        scriptArgs.push('--json');
      }
      if (this.getBooleanOption(options, 'quiet')) {
        scriptArgs.push('--quiet');
      }
      if (this.getBooleanOption(options, 'no-warnings')) {
        scriptArgs.push('--no-warnings');
      }
    } else if (subcommand === 'launcher-contract') {
      if (this.getBooleanOption(options, 'write')) {
        scriptArgs.push('--write');
      }
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', scriptName);

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Validate script not found: ${scriptPath}`
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
