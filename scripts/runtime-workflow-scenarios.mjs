#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRuntime } from './bootstrap-runtime.mjs';

export const RUNTIME_WORKFLOW_JSON_MARKER = '__RUNTIME_WORKFLOW_JSON__';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function evaluateWorkflowScenarios(payload) {
  const scenarios = payload?.scenarios || {};
  const healthy = scenarios.healthyCodeEdit;
  const compressed = scenarios.compressedResearch;
  const touchpoints = scenarios.serviceTouchpoints;
  const workflow = scenarios.workflowPersistence;

  if (!healthy?.attachedRuntimeContext) {
    return { ok: false, reason: 'healthyCodeEdit did not attach runtime context' };
  }

  if (healthy?.budgetAction !== 'none' || healthy?.compressionActive !== false) {
    return { ok: false, reason: 'healthyCodeEdit expected budgetAction none with inactive compression' };
  }

  if (healthy?.adaptiveRetries !== 3 || healthy?.adaptiveBackoff !== 1000) {
    return { ok: false, reason: 'healthyCodeEdit adaptive options did not preserve healthy defaults' };
  }

  if (!compressed?.attachedRuntimeContext) {
    return { ok: false, reason: 'compressedResearch did not attach runtime context' };
  }

  if (compressed?.budgetAction !== 'compress_urgent' || compressed?.compressionActive !== true) {
    return { ok: false, reason: 'compressedResearch expected compress_urgent budget action' };
  }

  if (compressed?.adaptiveRetries !== 1 || compressed?.adaptiveBackoff !== 3000) {
    return { ok: false, reason: 'compressedResearch adaptive options did not tighten for compression' };
  }

  const compressionTools = Array.isArray(compressed?.compressionRecommendedTools)
    ? compressed.compressionRecommendedTools
    : [];
  if (!compressionTools.includes('distill_run_tool')) {
    return { ok: false, reason: 'compressedResearch missing distill_run_tool recommendation' };
  }

  const compressionSkills = Array.isArray(compressed?.compressionRecommendedSkills)
    ? compressed.compressionRecommendedSkills
    : [];
  for (const skill of ['dcp', 'distill', 'context-governor']) {
    if (!compressionSkills.includes(skill)) {
      return { ok: false, reason: `compressedResearch missing compression skill ${skill}` };
    }
  }

  if (!touchpoints?.dashboard?.running || touchpoints?.dashboard?.port !== 3000) {
    return { ok: false, reason: 'serviceTouchpoints dashboard status did not propagate' };
  }

  if (touchpoints?.health?.status !== 'warn' || touchpoints?.healthSnapshot?.checkCount !== 4) {
    return { ok: false, reason: 'serviceTouchpoints health snapshot did not propagate' };
  }

  if (workflow?.execute?.runId !== 'workflow-run-1' || workflow?.resume?.status !== 'resumed') {
    return { ok: false, reason: 'workflowPersistence execution/resume results were incorrect' };
  }

  if (workflow?.state?.step !== 2) {
    return { ok: false, reason: 'workflowPersistence state snapshot was incorrect' };
  }

  return { ok: true, reason: 'ok' };
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
  };
}

export async function runRuntimeWorkflowScenarios() {
  const runtime = getRuntime({ sessionId: 'runtime-workflow-suite' });

  const healthyCodeEdit = await runTaskScenario(runtime, {
    task: 'healthy-code-edit',
    sessionId: 'runtime-workflow-suite',
    model: 'anthropic/claude-sonnet-4-5',
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
    model: 'anthropic/claude-sonnet-4-5',
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
  const outputJson = process.argv.includes('--json');
  const payload = await runRuntimeWorkflowScenarios();
  const evaluation = evaluateWorkflowScenarios(payload);

  if (outputJson) {
    process.stdout.write(`${RUNTIME_WORKFLOW_JSON_MARKER}${JSON.stringify({ ...payload, evaluation })}`);
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
