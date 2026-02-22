#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LearningEngine } = require('../../packages/opencode-learning-engine/src/index.js');

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function main() {
  const home = os.homedir();
  const sessionId = `fg04_${Date.now()}`;
  const sessionDir = path.join(home, '.opencode', 'messages', sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const validMsg = {
    timestamp: new Date().toISOString(),
    type: 'tool_use',
    name: 'bash',
    input: { command: 'npm test' },
    provenance: { signature_valid: true },
  };

  const invalidMsg = {
    timestamp: new Date().toISOString(),
    type: 'tool_use',
    name: 'bash',
    input: { command: 'npm test' },
    provenance: { signature_valid: false },
  };

  writeJson(path.join(sessionDir, '1.json'), validMsg);
  writeJson(path.join(sessionDir, '2.json'), invalidMsg);

  const engine = new LearningEngine({
    autoLoad: false,
    autoSave: false,
    requireValidProvenance: true,
  });

  const invalidEvent = engine.ingestEvent({
    type: 'tool-usage',
    payload: {
      tool: 'bash',
      success: true,
      provenance: { signature_valid: false },
    },
  });

  if (invalidEvent.success !== false || invalidEvent.reason !== 'invalid_provenance') {
    throw new Error('Invalid provenance event was not rejected');
  }

  const validEvent = engine.ingestEvent({
    type: 'tool-usage',
    payload: {
      tool: 'bash',
      success: true,
      provenance: { signature_valid: true },
    },
  });

  if (validEvent.success !== true) {
    throw new Error('Valid provenance event was not accepted');
  }

  const beforeRejectedCounter = Number(engine.provenanceRejectedCount || 0);
  const sessionResult = engine.ingestSession(sessionId);
  const afterRejectedCounter = Number(engine.provenanceRejectedCount || 0);
  const rejectedDelta = afterRejectedCounter - beforeRejectedCounter;

  if (sessionResult?.error) {
    throw new Error(`Session ingestion failed: ${sessionResult.error}`);
  }

  if (rejectedDelta < 1) {
    throw new Error(`Expected at least one provenance rejection during session ingestion. got rejectedDelta=${rejectedDelta}`);
  }

  if (Number(sessionResult?.message_count || 0) < 1) {
    throw new Error(`Expected at least one accepted message in session ingestion. got message_count=${sessionResult?.message_count || 0}`);
  }

  console.log(
    JSON.stringify(
      {
        status: 'pass',
        session_id: sessionId,
        event_invalid_rejected: true,
        event_valid_accepted: true,
        session_result: sessionResult,
        rejected_delta: rejectedDelta,
        total_provenance_rejected_counter: engine.provenanceRejectedCount,
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
