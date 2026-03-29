#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { getRuntime } from './bootstrap-runtime.mjs';

export function evaluateRuntimeExecution(payload) {
  if (!payload?.attachedRuntimeContext) {
    return { ok: false, reason: 'runtime context was not attached to executeTaskWithEvidence taskContext' };
  }

  if (payload?.budgetAction !== 'compress_urgent') {
    return { ok: false, reason: `expected budgetAction compress_urgent, got ${payload?.budgetAction || 'missing'}` };
  }

  if (payload?.compressionActive !== true) {
    return { ok: false, reason: 'compressionActive was not propagated into adaptive options' };
  }

  const recommendedTools = Array.isArray(payload?.compressionRecommendedTools)
    ? payload.compressionRecommendedTools
    : [];
  if (!recommendedTools.includes('distill_run_tool')) {
    return { ok: false, reason: 'distill_run_tool missing from compressionRecommendedTools' };
  }

  const recommendedSkills = Array.isArray(payload?.compressionRecommendedSkills)
    ? payload.compressionRecommendedSkills
    : [];
  if (!recommendedSkills.includes('dcp')) {
    return { ok: false, reason: 'dcp missing from compressionRecommendedSkills' };
  }

  if (payload?.adaptiveRetries !== 1) {
    return { ok: false, reason: `expected adaptive retries 1, got ${payload?.adaptiveRetries}` };
  }

  if (payload?.adaptiveBackoff !== 3000) {
    return { ok: false, reason: `expected adaptive backoff 3000, got ${payload?.adaptiveBackoff}` };
  }

  return { ok: true, reason: 'ok' };
}

export const RUNTIME_CONTEXT_JSON_MARKER = '__RUNTIME_CONTEXT_JSON__';

export async function runRuntimeCompliance() {
  const runtime = getRuntime({ sessionId: 'runtime-compliance-session' });
  const originalContextBridge = runtime.contextBridge;
  const originalPreloadSkills = runtime.preloadSkills;
  const originalAdvisor = runtime.advisor;

  let capturedTaskContext = null;
  let capturedAdaptiveOptions = null;

  runtime.contextBridge = {
    evaluateAndCompress: () => ({
      action: 'compress_urgent',
      reason: 'Compliance probe forced critical budget state',
      pct: 85,
    }),
  };

  runtime.preloadSkills = {
    selectTools: () => ({
      tools: [
        { id: 'grep_query', tier: 0 },
        { id: 'distill_run_tool', tier: 1 },
      ],
      totalTokens: 900,
    }),
  };

  runtime.advisor = {
    advise: () => ({
      risk_score: 20,
      quota_risk: 0.25,
    }),
  };

  try {
    await runtime.executeTaskWithEvidence(
      {
        task: 'runtime-context-compliance',
        sessionId: 'runtime-compliance-session',
        model: 'openai/gpt-5.2',
      },
      async (taskContext, _skills, adaptiveOptions) => {
        capturedTaskContext = taskContext;
        capturedAdaptiveOptions = adaptiveOptions;
        return {
          success: true,
          message: 'runtime compliance executed',
        };
      }
    );
  } finally {
    runtime.contextBridge = originalContextBridge;
    runtime.preloadSkills = originalPreloadSkills;
    runtime.advisor = originalAdvisor;
  }

  return {
    generatedAt: new Date().toISOString(),
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

async function main() {
  const args = process.argv.slice(2);
  const outputJson = args.includes('--json');
  const outputIndex = args.indexOf('--output');
  const outputPath = outputIndex !== -1 && args[outputIndex + 1] ? args[outputIndex + 1] : null;
  const payload = await runRuntimeCompliance();
  const evaluation = evaluateRuntimeExecution(payload);
  const fullPayload = { ...payload, evaluation };
  
  if (outputPath) {
    const dir = path.dirname(outputPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(outputPath, JSON.stringify(fullPayload, null, 2), 'utf8');
    console.error(`[OK] Runtime context compliance proof written to ${outputPath}`);
  } else if (outputJson) {
    process.stdout.write(`${RUNTIME_CONTEXT_JSON_MARKER}${JSON.stringify(fullPayload)}`);
  } else {
    console.log('# Runtime Context Compliance');
    console.log(`- attachedRuntimeContext: ${payload.attachedRuntimeContext ? 'yes' : 'no'}`);
    console.log(`- budgetAction: ${payload.budgetAction}`);
    console.log(`- compressionActive: ${payload.compressionActive ? 'yes' : 'no'}`);
    console.log(`- adaptiveRetries: ${payload.adaptiveRetries}`);
    console.log(`- adaptiveBackoff: ${payload.adaptiveBackoff}`);
    console.log(`- compressionRecommendedTools: ${payload.compressionRecommendedTools.join(', ')}`);
    console.log(`- compressionRecommendedSkills: ${payload.compressionRecommendedSkills.join(', ')}`);
  }

  if (!evaluation.ok) {
    throw new Error(`[runtime:compliance] ${evaluation.reason}`);
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
