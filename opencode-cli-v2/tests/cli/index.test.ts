import { describe, expect, test } from 'bun:test';

import { executeCli } from '../../src/cli';
import type { PromptAdapter } from '../../src/cli/prompts';

interface PromptOverrides {
  readonly taskInput?: string;
  readonly selectedAgent?: string;
  readonly confirmed?: boolean;
}

function createPrompts(overrides: PromptOverrides = {}): PromptAdapter {
  return {
    askTaskInput: async () => overrides.taskInput ?? 'prompted task',
    selectAgent: async () => overrides.selectedAgent ?? 'prom-agent',
    confirm: async () => overrides.confirmed ?? true
  };
}

describe('CLI framework', () => {
  test('renders root help with all primary commands', async () => {
    const result = await executeCli(['--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode <command> [options]');
    expect(result.stdout).toContain('api');
    expect(result.stdout).toContain('run');
    expect(result.stdout).toContain('runtime');
    expect(result.stdout).toContain('agent');
    expect(result.stdout).toContain('task');
    expect(result.stdout).toContain('skills');
    expect(result.stdout).toContain('repair');
    expect(result.stdout).toContain('mcp');
    expect(result.stdout).toContain('ingest');
    expect(result.stdout).toContain('test');
    expect(result.stdout).toContain('doctor');
    expect(result.stdout).toContain('ci');
    expect(result.stdout).toContain('commit');
    expect(result.stdout).toContain('config');
    expect(result.stdout).toContain('governance');
    expect(result.stdout).toContain('launch');
    expect(result.stdout).toContain('link');
    expect(result.stdout).toContain('release');
    expect(result.stdout).toContain('report');
    expect(result.stdout).toContain('sync');
    expect(result.stdout).toContain('state');
    expect(result.stdout).toContain('system');
    expect(result.stdout).toContain('verify');
    expect(result.stdout).toContain('validate');
    expect(result.stdout).toContain('check');
    expect(result.stdout).toContain('setup');
    expect(result.stdout).toContain('resolve');
    expect(result.stdout).toContain('bootstrap');
    expect(result.stdout).toContain('model');
    expect(result.stdout).toContain('health');
    expect(result.stdout).toContain('inspect');
    expect(result.stdout).toContain('trajectory');
  });

  test('supports version flag', async () => {
    const result = await executeCli(['--version'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim().length).toBeGreaterThan(0);
  });

  test('returns error for unknown command', async () => {
    const result = await executeCli(['unknown-command'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown command');
  });

  test('run command prompts for missing task input', async () => {
    const result = await executeCli(['run'], {
      prompts: createPrompts({ taskInput: 'implement auth' })
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('command=run');
    expect(result.stdout).toContain('task=implement auth');
  });

  test('run command accepts trajectory option', async () => {
    const result = await executeCli(['run', '--trajectory', 'task.json'], {
      prompts: createPrompts()
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('trajectory=task.json');
  });

  test('run command has help output', async () => {
    const result = await executeCli(['run', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode run [subcommand] [options]');
    expect(result.stdout).toContain('package-smokes');
  });

  test('api command has help output', async () => {
    const result = await executeCli(['api', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode api <subcommand> [options]');
    expect(result.stdout).toContain('sanity');
  });

  test('runtime command has help output', async () => {
    const result = await executeCli(['runtime', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode runtime <subcommand> [options]');
    expect(result.stdout).toContain('telemetry');
    expect(result.stdout).toContain('tool-surface');
    expect(result.stdout).toContain('skill-tracker');
    expect(result.stdout).toContain('workflow-scenarios');
    expect(result.stdout).toContain('report-mcp-lifecycle');
  });

  test('run-batch command has help output', async () => {
    const result = await executeCli(['run-batch', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode run-batch [options]');
  });

  test('replay command has help output', async () => {
    const result = await executeCli(['replay', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode replay <trajectory> [options]');
  });

  test('agent command supports list', async () => {
    const result = await executeCli(['agent', 'list'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('command=agent');
    expect(result.stdout).toContain('action=list');
  });

  test('agent spawn prompts for missing task', async () => {
    const result = await executeCli(['agent', 'spawn', '--type', 'prom'], {
      prompts: createPrompts({ taskInput: 'spawned task' })
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('action=spawn');
    expect(result.stdout).toContain('task=spawned task');
  });

  test('agent command has help output', async () => {
    const result = await executeCli(['agent', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode agent <subcommand> [options]');
  });

  test('task queue prompts for description when omitted', async () => {
    const result = await executeCli(['task', 'queue'], {
      prompts: createPrompts({ taskInput: 'queued task' })
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('command=task');
    expect(result.stdout).toContain('action=queue');
    expect(result.stdout).toContain('task=queued task');
  });

  test('task command has help output', async () => {
    const result = await executeCli(['task', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode task <subcommand> [options]');
  });

  test('skills info command resolves skill name', async () => {
    const result = await executeCli(['skills', 'info', 'git-master'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('command=skills');
    expect(result.stdout).toContain('action=info');
    expect(result.stdout).toContain('name=git-master');
  });

  test('skills command has help output', async () => {
    const result = await executeCli(['skills', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode skills <subcommand> [options]');
    expect(result.stdout).toContain('evaluate-routing');
    expect(result.stdout).toContain('check-overlap');
    expect(result.stdout).toContain('import-antigravity');
    expect(result.stdout).toContain('normalize-superpowers');
  });

  test('skill alias resolves to skills command', async () => {
    const result = await executeCli(['skill', 'list'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('command=skills');
    expect(result.stdout).toContain('action=list');
  });

  test('config set supports key and value', async () => {
    const result = await executeCli(['config', 'set', 'models.default', 'claude-sonnet'], {
      prompts: createPrompts()
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('command=config');
    expect(result.stdout).toContain('action=set');
    expect(result.stdout).toContain('key=models.default');
    expect(result.stdout).toContain('value=claude-sonnet');
  });

  test('config command has help output', async () => {
    const result = await executeCli(['config', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode config <subcommand> [options]');
    expect(result.stdout).toContain('copy');
  });

  test('repair command has help output', async () => {
    const result = await executeCli(['repair', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode repair [options]');
    expect(result.stdout).toContain('--unsafe');
    expect(result.stdout).toContain('--rollback <backup-id>');
  });

  test('mcp command has help output', async () => {
    const result = await executeCli(['mcp', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode mcp <subcommand> [options]');
    expect(result.stdout).toContain('mirror-coherence');
    expect(result.stdout).toContain('smoke-harness');
  });

  test('ingest command has help output', async () => {
    const result = await executeCli(['ingest', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode ingest <subcommand> [options]');
    expect(result.stdout).toContain('sessions');
  });

  test('test command has help output', async () => {
    const result = await executeCli(['test', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode test <subcommand> [options]');
    expect(result.stdout).toContain('fault-injection');
  });

  test('doctor command has help output', async () => {
    const result = await executeCli(['doctor', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode doctor [options]');
    expect(result.stdout).toContain('--json');
  });

  test('ci command has help output', async () => {
    const result = await executeCli(['ci', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode ci <subcommand> [options]');
    expect(result.stdout).toContain('warning-budget');
  });

  test('commit command has help output', async () => {
    const result = await executeCli(['commit', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode commit <subcommand> [options]');
    expect(result.stdout).toContain('governance');
  });

  test('verify command has help output', async () => {
    const result = await executeCli(['verify', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode verify <subcommand> [options]');
    expect(result.stdout).toContain('setup');
    expect(result.stdout).toContain('integrity');
    expect(result.stdout).toContain('bootstrap-prereqs');
    expect(result.stdout).toContain('bootstrap-manifest');
    expect(result.stdout).toContain('supply-chain');
    expect(result.stdout).toContain('portability');
    expect(result.stdout).toContain('plugin-readiness');
    expect(result.stdout).toContain('plugin-parity');
    expect(result.stdout).toContain('no-hidden-exec');
  });

  test('validate command has help output', async () => {
    const result = await executeCli(['validate', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode validate <subcommand> [options]');
    expect(result.stdout).toContain('config');
    expect(result.stdout).toContain('models');
    expect(result.stdout).toContain('launcher-contract');
    expect(result.stdout).toContain('policies-structure');
    expect(result.stdout).toContain('plugin-compatibility');
    expect(result.stdout).toContain('fallback-consistency');
    expect(result.stdout).toContain('control-plane-schema');
    expect(result.stdout).toContain('legacy-config');
    expect(result.stdout).toContain('legacy-skills');
    expect(result.stdout).toContain('legacy-agents');
    expect(result.stdout).toContain('legacy-plugins');
    expect(result.stdout).toContain('legacy-models');
    expect(result.stdout).toContain('legacy-routing');
    expect(result.stdout).toContain('legacy-state');
    expect(result.stdout).toContain('legacy-context');
    expect(result.stdout).toContain('legacy-learning');
    expect(result.stdout).toContain('legacy-health');
    expect(result.stdout).toContain('legacy-telemetry');
    expect(result.stdout).toContain('legacy-security');
    expect(result.stdout).toContain('legacy-governance');
    expect(result.stdout).toContain('legacy-docs');
    expect(result.stdout).toContain('legacy-tests');
    expect(result.stdout).toContain('legacy-ci');
  });

  test('validate legacy subcommands support --help', async () => {
    const legacySubcommands = [
      'legacy-config',
      'legacy-skills',
      'legacy-agents',
      'legacy-plugins',
      'legacy-models',
      'legacy-routing',
      'legacy-state',
      'legacy-context',
      'legacy-learning',
      'legacy-health',
      'legacy-telemetry',
      'legacy-security',
      'legacy-governance',
      'legacy-docs',
      'legacy-tests',
      'legacy-ci'
    ] as const;

    for (const subcommand of legacySubcommands) {
      const result = await executeCli(['validate', subcommand, '--help'], {
        prompts: createPrompts()
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Usage: opencode validate <subcommand> [options]');
      expect(result.stdout).toContain(subcommand);
    }
  });

  test('sync command has help output', async () => {
    const result = await executeCli(['sync', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode sync <subcommand> [options]');
    expect(result.stdout).toContain('reconcile');
    expect(result.stdout).toContain('project-learnings');
  });

  test('launch command has help output', async () => {
    const result = await executeCli(['launch', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode launch <subcommand> [options]');
    expect(result.stdout).toContain('with-dashboard');
  });

  test('link command has help output', async () => {
    const result = await executeCli(['link', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode link <subcommand> [options]');
    expect(result.stdout).toContain('packages');
  });

  test('state command has help output', async () => {
    const result = await executeCli(['state', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode state <subcommand> [options]');
    expect(result.stdout).toContain('preload-persist');
    expect(result.stdout).toContain('init-kb');
    expect(result.stdout).toContain('meta-super-cycle');
    expect(result.stdout).toContain('synthesize-meta-kb');
    expect(result.stdout).toContain('skill-profile-loader');
  });

  test('governance command has help output', async () => {
    const result = await executeCli(['governance', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode governance <subcommand> [options]');
    expect(result.stdout).toContain('docs-check');
    expect(result.stdout).toContain('docs-gate');
  });

  test('report command has help output', async () => {
    const result = await executeCli(['report', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode report <subcommand> [options]');
    expect(result.stdout).toContain('portability');
  });

  test('release command has help output', async () => {
    const result = await executeCli(['release', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode release <subcommand> [options]');
    expect(result.stdout).toContain('portability-verdict');
  });

  test('system command has help output', async () => {
    const result = await executeCli(['system', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode system <subcommand> [options]');
    expect(result.stdout).toContain('health');
  });

  test('check command has help output', async () => {
    const result = await executeCli(['check', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode check <subcommand> [options]');
    expect(result.stdout).toContain('runtime-compliance');
    expect(result.stdout).toContain('env-contract');
    expect(result.stdout).toContain('hardcoded-paths');
    expect(result.stdout).toContain('learning-gate');
    expect(result.stdout).toContain('agents-drift');
  });

  test('setup command has help output', async () => {
    const result = await executeCli(['setup', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode setup <subcommand> [options]');
    expect(result.stdout).toContain('resilient');
  });

  test('resolve command has help output', async () => {
    const result = await executeCli(['resolve', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode resolve <subcommand> [options]');
    expect(result.stdout).toContain('root');
  });

  test('bootstrap command has help output', async () => {
    const result = await executeCli(['bootstrap', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode bootstrap [subcommand] [options]');
    expect(result.stdout).toContain('cache-guard');
    expect(result.stdout).toContain('--status');
  });

  test('model command has help output', async () => {
    const result = await executeCli(['model', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode model <subcommand> [options]');
    expect(result.stdout).toContain('rollback');
    expect(result.stdout).toContain('weekly-sync');
  });

  test('health command has help output', async () => {
    const result = await executeCli(['health', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode health [options]');
  });

  test('inspect command supports trajectory flag', async () => {
    const result = await executeCli(['inspect', '--trajectory', 'trace.json'], {
      prompts: createPrompts()
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('command=inspect');
    expect(result.stdout).toContain('trajectory=trace.json');
  });

  test('inspect command has help output', async () => {
    const result = await executeCli(['inspect', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode inspect [options]');
  });

  test('trajectory load supports path and config', async () => {
    const result = await executeCli(
      ['trajectory', 'load', 'trace.json', '--config', 'agent.yaml'],
      {
        prompts: createPrompts()
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('command=trajectory');
    expect(result.stdout).toContain('action=load');
    expect(result.stdout).toContain('path=trace.json');
    expect(result.stdout).toContain('config=agent.yaml');
  });

  test('trajectory command has help output', async () => {
    const result = await executeCli(['trajectory', '--help'], { prompts: createPrompts() });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Usage: opencode trajectory <subcommand> [options]');
  });
});
