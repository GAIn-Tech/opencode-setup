#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Orchestrator = require('../../packages/opencode-model-router-x/src/strategies/orchestrator.js');

class FailingStrategy {
  getPriority() {
    return 100;
  }
  getName() {
    return 'FailingStrategy';
  }
  shouldApply() {
    return true;
  }
  async selectModel() {
    throw new Error('forced-strategy-failure');
  }
}

class StableStrategy {
  getPriority() {
    return 10;
  }
  getName() {
    return 'StableStrategy';
  }
  shouldApply() {
    return true;
  }
  async selectModel() {
    return { model_id: 'anthropic/claude-sonnet-4-5' };
  }
}

async function main() {
  const persistPath = path.join(os.tmpdir(), `fg05-strategy-health-${Date.now()}.json`);
  if (fs.existsSync(persistPath)) fs.unlinkSync(persistPath);

  const orchestrator = new Orchestrator([new FailingStrategy(), new StableStrategy()], {
    failureThreshold: 2,
    cooldownMs: 500,
    persistPath,
  });

  const task = { intent: 'orchestration' };
  const context = {};

  await orchestrator.selectModel(task, context);
  await orchestrator.selectModel(task, context);
  const duringBypass = await orchestrator.selectModel(task, context);

  const health1 = orchestrator.getStrategyHealth();
  const failingHealth = health1?.FailingStrategy;
  if (!failingHealth || Number(failingHealth.bypass_count || 0) < 1) {
    throw new Error('Expected failing strategy to enter bypass at least once');
  }

  if ((duringBypass?.strategy || '') !== 'StableStrategy') {
    throw new Error(`Expected StableStrategy during bypass, got ${duringBypass?.strategy || 'none'}`);
  }

  await sleep(600);
  const beforeRetryFailures = Number(health1?.FailingStrategy?.total_failures || 0);
  await orchestrator.selectModel(task, context);
  const health2 = orchestrator.getStrategyHealth();
  const afterRetryFailures = Number(health2?.FailingStrategy?.total_failures || 0);
  const afterRetryBypassCount = Number(health2?.FailingStrategy?.bypass_count || 0);
  if (afterRetryFailures < beforeRetryFailures || afterRetryBypassCount < 1) {
    throw new Error(
      `Expected healthy retry lifecycle after cooldown. got failures before=${beforeRetryFailures} after=${afterRetryFailures}, bypass_count=${afterRetryBypassCount}`
    );
  }

  if (!fs.existsSync(persistPath)) {
    throw new Error('Expected persisted strategy health file to be created');
  }

  console.log(
    JSON.stringify(
      {
        status: 'pass',
        persistPath,
        during_bypass_strategy: duringBypass.strategy,
        health_summary: orchestrator.getStrategyHealthSummary(),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
