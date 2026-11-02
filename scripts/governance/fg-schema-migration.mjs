#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ConfigLoader } = require('../../packages/opencode-config-loader/src/index.js');

function main() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fg-schema-migration-'));
  const configPath = path.join(tmpDir, '.opencode.config.json');

  const legacy = {
    version: '1.0.0',
    fallback_policy: {
      providerPriority: ['anthropic', 'openai'],
      fallbackModels: [{ providerID: 'anthropic', modelID: 'claude-sonnet-4-5' }],
    },
    plugin_lifecycle: {
      healthCheckIntervalMs: 2500,
    },
    telemetry_fidelity: {
      defaultMode: 'degraded',
    },
  };

  fs.writeFileSync(configPath, JSON.stringify(legacy, null, 2), 'utf8');

  const loader = new ConfigLoader(configPath);
  const config = loader.load();

  if (!Array.isArray(config?.fallback_policy?.provider_priority)) {
    throw new Error('Migration failed: fallback_policy.provider_priority missing');
  }
  if (!Array.isArray(config?.fallback_policy?.fallback_models)) {
    throw new Error('Migration failed: fallback_policy.fallback_models missing');
  }
  if (config?.plugin_lifecycle?.health_check_interval_ms !== 2500) {
    throw new Error('Migration failed: plugin_lifecycle.health_check_interval_ms not mapped');
  }
  if (config?.telemetry_fidelity?.default_mode !== 'degraded') {
    throw new Error('Migration failed: telemetry_fidelity.default_mode not mapped');
  }
  if (config?.schema_version !== '1.1.0') {
    throw new Error(`Migration failed: expected schema_version=1.1.0 got ${config?.schema_version}`);
  }

  console.log(
    JSON.stringify(
      {
        status: 'pass',
        schema_version: config.schema_version,
        provider_priority: config.fallback_policy.provider_priority,
        plugin_health_interval: config.plugin_lifecycle.health_check_interval_ms,
        telemetry_default_mode: config.telemetry_fidelity.default_mode,
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
