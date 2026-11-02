#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PluginLifecycleSupervisor } = require('../../packages/opencode-plugin-lifecycle/src/index.js');

function main() {
  const statePath = path.join(os.tmpdir(), `fg-plugin-supervisor-${Date.now()}.json`);
  if (fs.existsSync(statePath)) fs.unlinkSync(statePath);

  const sup = new PluginLifecycleSupervisor({ statePath, quarantineCrashThreshold: 2 });

  // healthy initialization
  let r1 = sup.evaluateMany([
    { name: 'supermemory', configured: true, discovered: true, heartbeat_ok: true, dependency_ok: true },
  ]);
  if (r1.healthy !== 1) {
    throw new Error('Expected healthy plugin on initialization');
  }

  // degrade via missing heartbeat (candidate)
  let r2 = sup.evaluateMany([
    { name: 'supermemory', configured: true, discovered: true, heartbeat_ok: false, dependency_ok: true },
  ]);
  const degradedCandidate = r2.items.find((i) => i.name === 'supermemory');
  if (!degradedCandidate || degradedCandidate.status !== 'degraded' || degradedCandidate.quarantine !== false) {
    throw new Error('Expected degraded candidate state on heartbeat loss');
  }

  // quarantine via crash-loop threshold
  let r3 = sup.evaluateMany([
    { name: 'supermemory', configured: true, discovered: true, heartbeat_ok: false, dependency_ok: true, crash_count: 2 },
  ]);
  const quarantined = r3.items.find((i) => i.name === 'supermemory');
  if (!quarantined || quarantined.reason_code !== 'crash-loop' || quarantined.quarantine !== true) {
    throw new Error('Expected active quarantine on crash-loop threshold');
  }

  // recover
  let r4 = sup.evaluateMany([
    { name: 'supermemory', configured: true, discovered: true, heartbeat_ok: true, dependency_ok: true, crash_count: 0 },
  ]);
  const recovered = r4.items.find((i) => i.name === 'supermemory');
  if (!recovered || recovered.status !== 'healthy' || recovered.quarantine !== false) {
    throw new Error('Expected healthy recovered state');
  }

  if (!fs.existsSync(statePath)) {
    throw new Error('Expected persisted lifecycle state file');
  }

  console.log(
    JSON.stringify(
      {
        status: 'pass',
        statePath,
        transition_reason: recovered.transition_reason,
        quarantined_reason: quarantined.reason_code,
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
