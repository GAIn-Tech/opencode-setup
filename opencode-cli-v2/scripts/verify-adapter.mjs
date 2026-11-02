#!/usr/bin/env node

import process from 'node:process';

import { AdapterHealthChecker } from '../src/adapters/health.ts';
import { ContextGovernorAdapter } from '../src/adapters/packages/context-governor.ts';
import { LearningAdapter } from '../src/adapters/packages/learning.ts';
import { ModelRouterAdapter } from '../src/adapters/packages/model-router.ts';
import { SisyphusAdapter } from '../src/adapters/packages/sisyphus.ts';
import { SkillsAdapter } from '../src/adapters/packages/skills.ts';
import { AntigravityAuthPluginAdapter } from '../src/adapters/plugins/antigravity-auth.ts';
import { AntigravityQuotaPluginAdapter } from '../src/adapters/plugins/antigravity-quota.ts';
import { LangfusePluginAdapter } from '../src/adapters/plugins/langfuse.ts';
import { NotifierPluginAdapter } from '../src/adapters/plugins/notifier.ts';
import { OhMyOpenCodePluginAdapter } from '../src/adapters/plugins/oh-my-opencode.ts';
import { OpencodeDcpPluginAdapter } from '../src/adapters/plugins/opencode-dcp.ts';
import { OpencodePtyPluginAdapter } from '../src/adapters/plugins/opencode-pty.ts';
import { PreloadSkillsPluginAdapter } from '../src/adapters/plugins/preload-skills.ts';
import { RateLimitFallbackPluginAdapter } from '../src/adapters/plugins/rate-limit-fallback.ts';
import { SafetyNetPluginAdapter } from '../src/adapters/plugins/safety-net.ts';
import { SecurityPluginAdapter } from '../src/adapters/plugins/security-plugin.ts';
import { TokenMonitorPluginAdapter } from '../src/adapters/plugins/token-monitor.ts';
import { MCPBridgeAdapter } from '../src/mcp/adapter.ts';

function parseArgs(argv) {
  return {
    json: argv.includes('--json')
  };
}

function toErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function createAdapters() {
  return [
    new ContextGovernorAdapter(),
    new LearningAdapter(),
    new ModelRouterAdapter(),
    new SisyphusAdapter(),
    new SkillsAdapter(),
    new MCPBridgeAdapter(),
    new AntigravityAuthPluginAdapter(),
    new AntigravityQuotaPluginAdapter(),
    new LangfusePluginAdapter(),
    new NotifierPluginAdapter(),
    new OhMyOpenCodePluginAdapter(),
    new OpencodeDcpPluginAdapter(),
    new OpencodePtyPluginAdapter(),
    new PreloadSkillsPluginAdapter(),
    new RateLimitFallbackPluginAdapter(),
    new SafetyNetPluginAdapter(),
    new SecurityPluginAdapter(),
    new TokenMonitorPluginAdapter()
  ];
}

async function runStage(adapter, stage) {
  try {
    if (stage === 'load') {
      await adapter.runLoad();
    } else if (stage === 'initialize') {
      await adapter.runInitialize();
    } else {
      await adapter.runShutdown();
    }

    return {
      ok: true
    };
  } catch (error) {
    return {
      ok: false,
      error: toErrorMessage(error)
    };
  }
}

function resolveExitCode(report) {
  const requiredFailure = report.adapters.some(
    (entry) =>
      entry.required &&
      (!entry.load.ok || !entry.initialize.ok || entry.health.status === 'unhealthy')
  );

  return requiredFailure ? 1 : 0;
}

function computeOverallStatus(report) {
  const hasRequiredFailure = report.adapters.some(
    (entry) =>
      entry.required &&
      (!entry.load.ok || !entry.initialize.ok || entry.health.status === 'unhealthy')
  );

  if (hasRequiredFailure) {
    return 'unhealthy';
  }

  const hasAnyIssue = report.adapters.some(
    (entry) =>
      !entry.load.ok ||
      !entry.initialize.ok ||
      entry.health.status === 'degraded' ||
      entry.health.status === 'unhealthy'
  );

  return hasAnyIssue ? 'degraded' : 'healthy';
}

function printHuman(report) {
  console.log('OpenCode CLI v2 adapter verification');
  console.log('===================================');
  console.log(`checked_at: ${report.checkedAt}`);
  console.log(`adapter_count: ${report.adapters.length}`);
  console.log(`overall_status: ${report.status}`);
  console.log('');

  for (const entry of report.adapters) {
    console.log(`[${entry.required ? 'required' : 'optional'}] ${entry.adapter}`);
    console.log(`  load: ${entry.load.ok ? 'ok' : 'failed'}`);
    if (!entry.load.ok) {
      console.log(`    error: ${entry.load.error}`);
    }

    console.log(`  initialize: ${entry.initialize.ok ? 'ok' : 'failed'}`);
    if (!entry.initialize.ok) {
      console.log(`    error: ${entry.initialize.error}`);
    }

    console.log(`  health: ${entry.health.status}`);
    if (entry.health.details) {
      console.log(`    details: ${entry.health.details}`);
    }

    console.log(`  runtime_status: ${entry.runtimeStatus}`);
  }

  if (report.issues.length > 0) {
    console.log('');
    console.log('issues:');
    for (const issue of report.issues) {
      console.log(`  - ${issue}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const adapters = createAdapters();
  const healthChecker = new AdapterHealthChecker();

  const reportEntries = [];

  for (const adapter of adapters) {
    const load = await runStage(adapter, 'load');
    const initialize = load.ok ? await runStage(adapter, 'initialize') : { ok: false, error: 'Skipped; load failed' };
    const health = await healthChecker.checkAdapter(adapter);

    reportEntries.push({
      adapter: adapter.name,
      required: adapter.required,
      load,
      initialize,
      health,
      runtimeStatus: adapter.getStatus()
    });
  }

  for (const adapter of [...adapters].reverse()) {
    await runStage(adapter, 'shutdown');
  }

  const issues = [];
  for (const entry of reportEntries) {
    if (!entry.load.ok) {
      issues.push(`${entry.adapter}: load failed (${entry.load.error})`);
    }

    if (!entry.initialize.ok) {
      issues.push(`${entry.adapter}: initialize failed (${entry.initialize.error})`);
    }

    if (entry.health.status !== 'healthy') {
      issues.push(`${entry.adapter}: health=${entry.health.status}${entry.health.details ? ` (${entry.health.details})` : ''}`);
    }
  }

  const report = {
    checkedAt: new Date().toISOString(),
    adapters: reportEntries,
    status: 'healthy',
    issues
  };

  report.status = computeOverallStatus(report);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  process.exit(resolveExitCode(report));
}

await main();
