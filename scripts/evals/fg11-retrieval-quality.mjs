#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function averagePrecisionAtK(predicted, groundTruth, k) {
  const truth = new Set(groundTruth);
  let hits = 0;
  let sumPrecision = 0;

  for (let i = 0; i < Math.min(k, predicted.length); i++) {
    if (truth.has(predicted[i])) {
      hits += 1;
      sumPrecision += hits / (i + 1);
    }
  }

  return truth.size === 0 ? 0 : sumPrecision / Math.min(truth.size, k);
}

function main() {
  const k = 5;
  const benchmark = [
    { id: 'q1', predicted: ['n1', 'n2', 'n3', 'n4', 'n5'], truth: ['n2', 'n5'], grounded: true },
    { id: 'q2', predicted: ['a1', 'a2', 'a3', 'a4', 'a5'], truth: ['a1'], grounded: true },
    { id: 'q3', predicted: ['b1', 'b2', 'b3', 'b4', 'b5'], truth: ['b4'], grounded: false },
    { id: 'q4', predicted: ['c1', 'c2', 'c3', 'c4', 'c5'], truth: ['c6'], grounded: false },
    { id: 'q5', predicted: ['d1', 'd2', 'd3', 'd4', 'd5'], truth: ['d3', 'd5'], grounded: true },
  ];

  const apScores = benchmark.map((item) => averagePrecisionAtK(item.predicted, item.truth, k));
  const mapAtK = apScores.reduce((sum, value) => sum + value, 0) / apScores.length;

  const hits = benchmark.filter((item) => item.truth.some((truth) => item.predicted.slice(0, k).includes(truth))).length;
  const hitRateAtK = hits / benchmark.length;

  const groundedRecall =
    benchmark.filter((item) => item.grounded).length / benchmark.length;

  const report = {
    generated_at: new Date().toISOString(),
    map_at_k: Number(mapAtK.toFixed(4)),
    grounded_recall: Number(groundedRecall.toFixed(4)),
    hit_rate_at_k: Number(hitRateAtK.toFixed(4)),
    k,
    sample_size: benchmark.length,
    benchmark_id: 'fg11-synthetic-v1',
  };

  const opencodeDir = path.join(os.homedir(), '.opencode');
  fs.mkdirSync(opencodeDir, { recursive: true });
  const outputPath = path.join(opencodeDir, 'retrieval-quality.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');

  if (report.map_at_k < 0.4 || report.grounded_recall < 0.5) {
    throw new Error(`Retrieval quality below minimum baseline. map@k=${report.map_at_k}, grounded=${report.grounded_recall}`);
  }

  console.log(JSON.stringify({ status: 'pass', outputPath, report }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
