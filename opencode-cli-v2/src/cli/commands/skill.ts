import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

import { BaseCommand } from './base';
import type { CommandContext, CommandExecutionResult, HelpSection } from './base';

type SkillsSubcommand =
  | 'list'
  | 'info'
  | 'evaluate-routing'
  | 'routing-gates'
  | 'check-coverage'
  | 'check-consistency'
  | 'validate-import'
  | 'manage'
  | 'check-overlap'
  | 'consolidate'
  | 'import-antigravity'
  | 'normalize-superpowers';

const SKILLS_SCRIPT_MAP: Record<Exclude<SkillsSubcommand, 'list' | 'info'>, string> = {
  'evaluate-routing': 'skill-routing-evaluator.mjs',
  'routing-gates': 'run-skill-routing-gates.mjs',
  'check-coverage': 'check-skill-coverage.mjs',
  'check-consistency': 'check-skill-consistency.mjs',
  'validate-import': 'validate-skill-import.mjs',
  manage: 'skills-manage.mjs',
  'check-overlap': 'check-skill-overlap-governance.mjs',
  consolidate: 'consolidate-skills.mjs',
  'import-antigravity': 'import-antigravity-skills.mjs',
  'normalize-superpowers': 'normalize-superpowers-skills.mjs'
};

export class SkillCommand extends BaseCommand {
  public readonly name = 'skills';
  public readonly description = 'Skill governance and management commands migrated from infrastructure scripts.';
  public readonly aliases = ['skill'] as const;

  protected readonly usage = 'opencode skills <subcommand> [options]';

  protected readonly sections: readonly HelpSection[] = [
    {
      title: 'Subcommands',
      lines: [
        'list                      List installed skills',
        'info <name>               Show details for a skill',
        'evaluate-routing          Run scripts/skill-routing-evaluator.mjs',
        'routing-gates             Run scripts/run-skill-routing-gates.mjs',
        'check-coverage            Run scripts/check-skill-coverage.mjs',
        'check-consistency         Run scripts/check-skill-consistency.mjs',
        'validate-import           Run scripts/validate-skill-import.mjs',
        'manage                    Run scripts/skills-manage.mjs',
        'check-overlap             Run scripts/check-skill-overlap-governance.mjs',
        'consolidate               Run scripts/consolidate-skills.mjs',
        'import-antigravity        Run scripts/import-antigravity-skills.mjs',
        'normalize-superpowers     Run scripts/normalize-superpowers-skills.mjs'
      ]
    },
    {
      title: 'Options',
      lines: ['--help, -h                Show help for skills']
    }
  ];

  protected async execute(
    args: readonly string[],
    _context: CommandContext
  ): Promise<CommandExecutionResult> {
    const [rawSubcommand, ...rest] = args;
    const subcommand = (rawSubcommand ?? 'list') as SkillsSubcommand;

    if (subcommand === 'list') {
      return {
        exitCode: 0,
        message: 'command=skills action=list'
      };
    }

    if (subcommand === 'info') {
      const options = this.parseOptions(rest);
      const name = options.positionals[0] ?? 'none';

      return {
        exitCode: 0,
        message: ['command=skills', 'action=info', `name=${name}`].join(' ')
      };
    }

    const scriptName = SKILLS_SCRIPT_MAP[subcommand];
    if (scriptName === undefined) {
      return {
        exitCode: 1,
        errorMessage: `Unknown skills subcommand: ${rawSubcommand}`
      };
    }

    const repoRoot = path.resolve(import.meta.dir, '../../../../');
    const scriptPath = path.join(repoRoot, 'scripts', scriptName);

    if (!existsSync(scriptPath)) {
      return {
        exitCode: 1,
        errorMessage: `Skills script not found: ${scriptPath}`
      };
    }

    const run = spawnSync(process.execPath, [scriptPath, ...rest], {
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
