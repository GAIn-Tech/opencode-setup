#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((p / 100) * (sorted.length - 1))));
  return sorted[idx] || 0;
}

function main() {
  const queuePath = path.join(os.tmpdir(), `fg10-policy-review-${Date.now()}.json`);
  const now = Date.now();

  const items = [];
  for (let i = 0; i < 80; i++) {
    items.push({
      id: `ok_${i}`,
      status: 'pending',
      created_at: new Date(now - i * 10 * 60 * 1000).toISOString(),
    });
  }
  for (let i = 0; i < 4; i++) {
    items.push({
      id: `old_${i}`,
      status: 'pending',
      created_at: new Date(now - (18 + i) * 60 * 60 * 1000).toISOString(),
    });
  }

  fs.writeFileSync(
    queuePath,
    JSON.stringify({ version: '1.0.0', updated_at: new Date().toISOString(), items }, null, 2),
    'utf8'
  );

  const pendingAges = items.map((item) => (now - Date.parse(item.created_at)) / (1000 * 60 * 60));
  const p95 = percentile(pendingAges, 95);

  if (p95 > 24) {
    throw new Error(`Expected p95 queue age <= 24h for synthetic dataset, got ${p95}`);
  }

  console.log(
    JSON.stringify(
      {
        status: 'pass',
        queuePath,
        pending: items.length,
        p95_age_hours: Number(p95.toFixed(2)),
        target_hours: 24,
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
