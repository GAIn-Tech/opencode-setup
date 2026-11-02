#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { resolveRoot } from './resolve-root.mjs';

const ROOT = resolveRoot();
const schemaPath = path.join(ROOT, 'opencode-config-schema.json');

function fail(message) {
  throw new Error(`validate-control-plane-schema: ${message}`);
}

function main() {
  if (!fs.existsSync(schemaPath)) {
    fail(`missing schema file at ${schemaPath}`);
  }

  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const props = schema?.properties ?? {};

  const requiredTopLevel = ['runtime', 'performance', 'database', 'logging', 'sessions', 'features', 'paths'];
  for (const key of requiredTopLevel) {
    if (!props[key]) {
      fail(`missing top-level schema property '${key}'`);
    }
  }

  const controlPlaneSections = ['fallback_policy', 'plugin_lifecycle', 'telemetry_fidelity'];
  for (const key of controlPlaneSections) {
    if (!props[key]) {
      fail(`missing control-plane schema section '${key}'`);
    }
    if (props[key].type !== 'object') {
      fail(`schema section '${key}' must be type object`);
    }
  }

  const fallbackProps = props.fallback_policy?.properties ?? {};
  if (!fallbackProps.fallbackModels && !fallbackProps.fallback_models) {
    fail("fallback_policy must define 'fallbackModels' or 'fallback_models'");
  }

  const pluginProps = props.plugin_lifecycle?.properties ?? {};
  if (!pluginProps.health_check_interval_ms) {
    fail("plugin_lifecycle must define 'health_check_interval_ms'");
  }

  const fidelityProps = props.telemetry_fidelity?.properties ?? {};
  if (!fidelityProps.default_mode) {
    fail("telemetry_fidelity must define 'default_mode'");
  }

  const strictSections = ['runtime', 'performance', 'database', 'logging', 'sessions', 'features', 'paths'];
  for (const key of strictSections) {
    if (!Object.prototype.hasOwnProperty.call(props[key] || {}, 'additionalProperties')) {
      fail(`schema section '${key}' should explicitly define additionalProperties`);
    }
  }

  console.log('validate-control-plane-schema: PASS');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
