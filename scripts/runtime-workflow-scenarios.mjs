#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { getRuntime } from './bootstrap-runtime.mjs';

export const RUNTIME_WORKFLOW_JSON_MARKER = '__RUNTIME_WORKFLOW_JSON__';
export const MIN_NON_MOCKED_SCENARIO_RATIO = 0.6;
export const CRITICAL_REAL_SCENARIOS = Object.freeze(['setup', 'sync', 'verify', 'report']);

const REASON_CODES = Object.freeze({
  OK: 'OK',
  MOCKED_RATIO_BELOW_THRESHOLD: 'SCENARIO_MOCKED_RATIO_BELOW_THRESHOLD',
  CRITICAL_REAL_MISSING: 'SCENARIO_CRITICAL_REAL_MISSING',
  REAL_EXECUTION_FAILED: 'SCENARIO_REAL_EXECUTION_FAILED',
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function policyFailure(reasonCode, reason, details = {}) {
  return { ok: false, reasonCode, reason, details };
}

function policySuccess(details = {}) {
  return { ok: true, reasonCode: REASON_CODES.OK, reason: 'ok', details };
}

function collectScenarioExecutionStats(scenarios) {
  const tracked = Object.entries(scenarios).filter(([, scenario]) => {
    const mode = String(scenario?.executionMode || '').toLowerCase();
    return mode === 'real' || mode === 'mocked';
  });

  const real = tracked.filter(([, scenario]) => String(scenario.executionMode).toLowerCase() === 'real');
  const mocked = tracked.length - real.length;
  const ratio = tracked.length > 0 ? real.length / tracked.length : 0;

  return {
    trackedCount: tracked.length,
    realCount: real.length,
    mockedCount: mocked,
    ratio,
    tracked,
  };
}

export function evaluateWorkflowScenarios(payload) {
  const scenarios = payload?.scenarios || {};
  const healthy = scenarios.healthyCodeEdit;
  const compressed = scenarios.compressedResearch;
  const touchpoints = scenarios.serviceTouchpoints;
  const workflow = scenarios.workflowPersistence;

  if (!healthy?.attachedRuntimeContext) {
    return policyFailure('SCENARIO_POLICY_VALIDATION_FAILED', 'healthyCodeEdit did not attach runtime context');
  }

  if (healthy?.budgetAction !== 'none' || healthy?.compressionActive !== false) {
    return policyFailure('SCENARIO_POLICY_VALIDATION_FAILED', 'healthyCodeEdit expected budgetAction none with inactive compression');
  }

  if (healthy?.adaptiveRetries !== 3 || healthy?.adaptiveBackoff !== 1000) {
    return policyFailure('SCENARIO_POLICY_VALIDATION_FAILED', 'healthyCodeEdit adaptive options did not preserve healthy defaults');
  }

  if (!compressed?.attachedRuntimeContext) {
    return policyFailure('SCENARIO_POLICY_VALIDATION_FAILED', 'compressedResearch did not attach runtime context');
  }

  if (compressed?.budgetAction !== 'compress_urgent' || compressed?.compressionActive !== true) {
    return policyFailure('SCENARIO_POLICY_VALIDATION_FAILED', 'compressedResearch expected compress_urgent budget action');
  }

  if (compressed?.adaptiveRetries !== 1 || compressed?.adaptiveBackoff !== 3000) {
    return policyFailure('SCENARIO_POLICY_VALIDATION_FAILED', 'compressedResearch adaptive options did not tighten for compression');
  }

  const compressionTools = Array.isArray(compressed?.compressionRecommendedTools)
    ? compressed.compressionRecommendedTools
    : [];
  if (!compressionTools.includes('distill_run_tool')) {
    return policyFailure('SCENARIO_POLICY_VALIDATION_FAILED', 'compressedResearch missing distill_run_tool recommendation');
  }

  const compressionSkills = Array.isArray(compressed?.compressionRecommendedSkills)
    ? compressed.compressionRecommendedSkills
    : [];
  for (const skill of ['dcp', 'distill', 'context-governor']) {
    if (!compressionSkills.includes(skill)) {
      return policyFailure('SCENARIO_POLICY_VALIDATION_FAILED', `compressedResearch missing compression skill ${skill}`);
    }
  }

  if (!touchpoints?.dashboard?.running || touchpoints?.dashboard?.port !== 3000) {
    return policyFailure('SCENARIO_POLICY_VALIDATION_FAILED', 'serviceTouchpoints dashboard status did not propagate');
  }

  if (touchpoints?.health?.status !== 'warn' || touchpoints?.healthSnapshot?.checkCount !== 4) {
    return policyFailure('SCENARIO_POLICY_VALIDATION_FAILED', 'serviceTouchpoints health snapshot did not propagate');
  }

  if (workflow?.execute?.runId !== 'workflow-run-1' || workflow?.resume?.status !== 'resumed') {
    return policyFailure('SCENARIO_POLICY_VALIDATION_FAILED', 'workflowPersistence execution/resume results were incorrect');
  }

  if (workflow?.state?.step !== 2) {
    return policyFailure('SCENARIO_POLICY_VALIDATION_FAILED', 'workflowPersistence state snapshot was incorrect');
  }

  const executionStats = collectScenarioExecutionStats(scenarios);
  if (executionStats.ratio < MIN_NON_MOCKED_SCENARIO_RATIO) {
    return policyFailure(
      REASON_CODES.MOCKED_RATIO_BELOW_THRESHOLD,
      `non-mocked scenario ratio ${executionStats.ratio.toFixed(2)} below required ${MIN_NON_MOCKED_SCENARIO_RATIO.toFixed(2)}`,
      {
        requiredRatio: MIN_NON_MOCKED_SCENARIO_RATIO,
        actualRatio: executionStats.ratio,
        realCount: executionStats.realCount,
        mockedCount: executionStats.mockedCount,
        trackedCount: executionStats.trackedCount,
      },
    );
  }

  for (const scenarioName of CRITICAL_REAL_SCENARIOS) {
    const scenario = scenarios[scenarioName];
    if (!scenario || String(scenario.executionMode || '').toLowerCase() !== 'real') {
      return policyFailure(
        REASON_CODES.CRITICAL_REAL_MISSING,
        `critical scenario ${scenarioName} must exist and run in real mode`,
        { scenario: scenarioName },
      );
    }
    if (scenario.executionOk !== true) {
      return policyFailure(
        REASON_CODES.REAL_EXECUTION_FAILED,
        `critical real scenario ${scenarioName} did not complete successfully`,
        { scenario: scenarioName, error: scenario.error || null },
      );
    }
  }

  return policySuccess({
    requiredRatio: MIN_NON_MOCKED_SCENARIO_RATIO,
    actualRatio: executionStats.ratio,
    realCount: executionStats.realCount,
    mockedCount: executionStats.mockedCount,
    trackedCount: executionStats.trackedCount,
    criticalRealScenarios: CRITICAL_REAL_SCENARIOS,
  });
}

async function runTaskScenario(runtime, taskContext, collaborators) {
  const original = {
    contextBridge: runtime.contextBridge,
    preloadSkills: runtime.preloadSkills,
    advisor: runtime.advisor,
  };

  let capturedTaskContext = null;
  let capturedAdaptiveOptions = null;

  runtime.contextBridge = collaborators.contextBridge;
  runtime.preloadSkills = collaborators.preloadSkills;
  runtime.advisor = collaborators.advisor;

  try {
    await runtime.executeTaskWithEvidence(taskContext, async (context, _skills, adaptiveOptions) => {
      capturedTaskContext = clone(context);
      capturedAdaptiveOptions = clone(adaptiveOptions);
      return {
        success: true,
        message: 'scenario executed',
      };
    });
  } finally {
    runtime.contextBridge = original.contextBridge;
    runtime.preloadSkills = original.preloadSkills;
    runtime.advisor = original.advisor;
  }

  return {
    attachedRuntimeContext: Boolean(capturedTaskContext?.runtimeContext && capturedTaskContext?.runtime_context),
    budgetAction: capturedAdaptiveOptions?.budgetAction || null,
    compressionActive: capturedAdaptiveOptions?.compressionActive === true,
    adaptiveRetries: capturedAdaptiveOptions?.retries ?? null,
    adaptiveBackoff: capturedAdaptiveOptions?.backoff ?? null,
    recommendedTools: capturedAdaptiveOptions?.recommendedTools || [],
    compressionRecommendedTools: capturedAdaptiveOptions?.compressionRecommendedTools || [],
    compressionRecommendedSkills: capturedAdaptiveOptions?.compressionRecommendedSkills || [],
    executionMode: 'mocked',
    executionOk: true,
  };
}

async function runRealScenario(name, executor) {
  try {
    const detail = await executor();
    return {
      name,
      executionMode: 'real',
      executionOk: true,
      detail,
    };
  } catch (error) {
    return {
      name,
      executionMode: 'real',
      executionOk: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runCriticalRealScenarios(runtime) {
  const setup = await runRealScenario('setup', async () => {
    if (typeof runtime.resolveRuntimeContext !== 'function') {
      throw new Error('runtime.resolveRuntimeContext unavailable');
    }
    const ctx = await runtime.resolveRuntimeContext({
      task: 'runtime-workflow-setup',
      sessionId: 'runtime-workflow-suite',
      model: 'openai/gpt-5.2',
    });
    if (!ctx || typeof ctx !== 'object') {
      throw new Error('resolveRuntimeContext returned invalid payload');
    }
    return { hasContext: true };
  });

  const sync = await runRealScenario('sync', async () => {
    if (typeof runtime.selectToolsForTask !== 'function') {
      throw new Error('runtime.selectToolsForTask unavailable');
    }
    const selected = await runtime.selectToolsForTask({
      task: 'runtime-workflow-sync',
      sessionId: 'runtime-workflow-suite',
      model: 'openai/gpt-5.2',
    });
    return {
      toolCount: Array.isArray(selected?.tools) ? selected.tools.length : 0,
      totalTokens: Number(selected?.totalTokens || 0),
    };
  });

  const verify = await runRealScenario('verify', async () => {
    if (typeof runtime.checkContextBudget !== 'function') {
      throw new Error('runtime.checkContextBudget unavailable');
    }
    const budget = await runtime.checkContextBudget({
      sessionId: 'runtime-workflow-suite',
      model: 'openai/gpt-5.2',
      proposedTokens: 500,
    });
    if (!budget || typeof budget !== 'object') {
      throw new Error('checkContextBudget returned invalid payload');
    }
    return {
      action: budget.action || null,
      pct: Number.isFinite(budget.pct) ? budget.pct : null,
    };
  });

  const report = await runRealScenario('report', async () => {
    if (typeof runtime.getIntegrationStatus !== 'function') {
      throw new Error('runtime.getIntegrationStatus unavailable');
    }
    const status = runtime.getIntegrationStatus();
    if (!status || typeof status !== 'object') {
      throw new Error('getIntegrationStatus returned invalid payload');
    }
    return {
      loadedIntegrationCount: Object.values(status).filter(Boolean).length,
    };
  });

  return { setup, sync, verify, report };
}

export async function runRuntimeWorkflowScenarios() {
  const runtime = getRuntime({ sessionId: 'runtime-workflow-suite' });

  const healthyCodeEdit = await runTaskScenario(runtime, {
    task: 'healthy-code-edit',
    sessionId: 'runtime-workflow-suite',
    model: 'openai/gpt-5.2',
  }, {
    contextBridge: {
      evaluateAndCompress: () => ({
        action: 'none',
        reason: 'Healthy budget for standard edit flow',
        pct: 32,
      }),
    },
    preloadSkills: {
      selectTools: () => ({
        tools: [{ id: 'grep_query', tier: 0 }],
        totalTokens: 400,
      }),
    },
    advisor: {
      advise: () => ({ risk_score: 12, quota_risk: 0.1 }),
    },
  });

  const compressedResearch = await runTaskScenario(runtime, {
    task: 'compressed-research',
    sessionId: 'runtime-workflow-suite',
    model: 'openai/gpt-5.2',
  }, {
    contextBridge: {
      evaluateAndCompress: () => ({
        action: 'compress_urgent',
        reason: 'Workflow probe forced critical budget state',
        pct: 87,
      }),
    },
    preloadSkills: {
      selectTools: () => ({
        tools: [
          { id: 'grep_query', tier: 0 },
          { id: 'distill_run_tool', tier: 1 },
        ],
        totalTokens: 950,
      }),
    },
    advisor: {
      advise: () => ({ risk_score: 18, quota_risk: 0.2 }),
    },
  });

  const criticalReal = await runCriticalRealScenarios(runtime);

  const originalDashboardLauncher = runtime.dashboardLauncher;
  const originalHealthd = runtime.healthd;
  const originalWorkflowExecutor = runtime.workflowExecutor;
  const originalWorkflowStore = runtime.workflowStore;

  runtime.dashboardLauncher = {
    checkDashboard: () => ({ running: true, port: 3000 }),
    ensureDashboard: (openInBrowser = false) => ({ running: true, port: 3000, openInBrowser }),
    stopDashboard: () => ({ stopped: true }),
  };

  runtime.healthd = {
    runCheck: async () => ({ status: 'warn', plugins: { status: 'warn' }, mcps: { status: 'ok' } }),
    status: 'warn',
    lastResult: { status: 'warn', plugins: { status: 'warn' }, mcps: { status: 'ok' } },
    checkCount: 4,
  };

  runtime.workflowExecutor = {
    execute: async (_def, input, runId) => ({ runId: runId || 'workflow-run-1', status: 'completed', context: { input } }),
    resume: async (runId) => ({ runId, status: 'resumed' }),
  };

  runtime.workflowStore = {
    getRunState: (runId) => ({ runId, status: 'running', step: 2 }),
  };

  try {
    const serviceTouchpoints = {
      dashboard: runtime.getDashboardStatus(),
      ensuredDashboard: runtime.ensureDashboardRunning(false),
      health: await runtime.runRuntimeHealthCheck(),
      healthSnapshot: runtime.getRuntimeHealthStatus(),
    };

    const workflowPersistence = {
      execute: await runtime.executeWorkflow({ name: 'workflow-suite' }, { stage: 'start' }, 'workflow-run-1'),
      resume: await runtime.resumeWorkflow('workflow-run-1', { name: 'workflow-suite' }),
      state: runtime.getWorkflowState('workflow-run-1'),
    };

    return {
      generatedAt: new Date().toISOString(),
      scenarios: {
        healthyCodeEdit,
        compressedResearch,
        setup: criticalReal.setup,
        sync: criticalReal.sync,
        verify: criticalReal.verify,
        report: criticalReal.report,
        serviceTouchpoints,
        workflowPersistence,
      },
    };
  } finally {
    runtime.dashboardLauncher = originalDashboardLauncher;
    runtime.healthd = originalHealthd;
    runtime.workflowExecutor = originalWorkflowExecutor;
    runtime.workflowStore = originalWorkflowStore;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const outputJson = args.includes('--json');
  const outputIndex = args.indexOf('--output');
  const outputPath = outputIndex !== -1 && args[outputIndex + 1] ? args[outputIndex + 1] : null;
  const payload = await runRuntimeWorkflowScenarios();
  const evaluation = evaluateWorkflowScenarios(payload);
  const fullPayload = { ...payload, evaluation };

  if (outputPath) {
    const dir = path.dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(outputPath, JSON.stringify(fullPayload, null, 2), 'utf8');
    console.error(`[OK] Runtime workflow scenarios proof written to ${outputPath}`);
  } else if (outputJson) {
    process.stdout.write(`${RUNTIME_WORKFLOW_JSON_MARKER}${JSON.stringify(fullPayload)}`);
  } else {
    console.log('# Runtime Workflow Scenarios');
    console.log(`- healthyCodeEdit budgetAction: ${payload.scenarios.healthyCodeEdit.budgetAction}`);
    console.log(`- compressedResearch budgetAction: ${payload.scenarios.compressedResearch.budgetAction}`);
    console.log(`- dashboard running: ${payload.scenarios.serviceTouchpoints.dashboard?.running ? 'yes' : 'no'}`);
    console.log(`- health status: ${payload.scenarios.serviceTouchpoints.healthSnapshot?.status || 'missing'}`);
    console.log(`- workflow execute status: ${payload.scenarios.workflowPersistence.execute?.status || 'missing'}`);
  }

  if (!evaluation.ok) {
    throw new Error(`[runtime:workflow-scenarios] ${evaluation.reason}`);
  }
}

const thisFilePath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(thisFilePath);

if (isDirectRun) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
