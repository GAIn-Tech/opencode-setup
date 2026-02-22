#!/usr/bin/env node

import { registerSubsystem, startHealthChecks, getSchedulerTelemetry } from '../../packages/opencode-health-check/src/index.js';
import { setTimeout as sleep } from 'node:timers/promises';

async function main() {
  registerSubsystem('fg08-a', {
    checkInterval: 120,
    checkFn: async () => {
      await sleep(10);
      return { healthy: true };
    },
  });
  registerSubsystem('fg08-b', {
    checkInterval: 120,
    checkFn: async () => {
      await sleep(10);
      return { healthy: true };
    },
  });
  registerSubsystem('fg08-c', {
    checkInterval: 120,
    checkFn: async () => {
      await sleep(10);
      return { healthy: true };
    },
  });

  startHealthChecks();
  await sleep(2200);

  const telemetry = getSchedulerTelemetry();
  if ((telemetry.tickCount || 0) < 12) {
    throw new Error(`Insufficient scheduler ticks for validation: ${telemetry.tickCount}`);
  }
  if ((telemetry.overlapRate || 0) > 0.05) {
    throw new Error(`Polling overlap too high: ${telemetry.overlapRate}`);
  }

  console.log(
    JSON.stringify(
      {
        status: 'pass',
        tickCount: telemetry.tickCount,
        overlapRate: telemetry.overlapRate,
        maxConcurrentChecks: telemetry.maxConcurrentChecks,
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
