#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();
const policiesPath = path.join(root, 'packages', 'opencode-model-router-x', 'src', 'policies.json');
const requiredLayers = ['layer_1', 'layer_2', 'layer_3', 'layer_4', 'layer_5', 'layer_6'];

let failures = 0;
let warnings = 0;

function fail(message) {
  failures += 1;
  console.error(`[FAIL] ${message}`);
}

function warn(message) {
  warnings += 1;
  console.warn(`[WARN] ${message}`);
}

function pass(message) {
  console.log(`[PASS] ${message}`);
}

function main() {
  if (!existsSync(policiesPath)) {
    fail(`Missing policies file: ${policiesPath}`);
    process.exit(1);
  }

  let policies;
  try {
    policies = JSON.parse(readFileSync(policiesPath, 'utf8'));
  } catch (error) {
    fail(`Invalid JSON in policies file: ${String(error)}`);
    process.exit(1);
  }

  if (!policies.intentRouting || typeof policies.intentRouting !== 'object') {
    fail('intentRouting missing or invalid');
  }

  if (!policies.models || typeof policies.models !== 'object') {
    fail('models missing or invalid');
  }

  if (failures > 0) {
    process.exit(1);
  }

  const modelIds = new Set(Object.keys(policies.models));
  pass(`Model registry loaded (${modelIds.size} models)`);

  const intents = Object.entries(policies.intentRouting);
  if (intents.length === 0) {
    fail('intentRouting has no intents');
    process.exit(1);
  }

  for (const [intent, layers] of intents) {
    if (!layers || typeof layers !== 'object') {
      fail(`intent '${intent}' has invalid layer object`);
      continue;
    }

    for (const layer of requiredLayers) {
      if (!(layer in layers)) {
        fail(`intent '${intent}' missing ${layer}`);
        continue;
      }

      if (!Array.isArray(layers[layer])) {
        fail(`intent '${intent}' ${layer} must be an array`);
        continue;
      }

      for (const modelId of layers[layer]) {
        if (typeof modelId !== 'string') {
          fail(`intent '${intent}' ${layer} contains non-string model ID`);
          continue;
        }
        if (!modelIds.has(modelId)) {
          fail(`intent '${intent}' ${layer} references unknown model '${modelId}'`);
        }
      }
    }

    if (Array.isArray(layers.layer_1) && layers.layer_1.length === 0) {
      fail(`intent '${intent}' has empty layer_1`);
    }

    const allModels = requiredLayers.flatMap((layer) => (Array.isArray(layers[layer]) ? layers[layer] : []));
    const duplicates = allModels.filter((id, idx) => allModels.indexOf(id) !== idx);
    if (duplicates.length > 0) {
      warn(`intent '${intent}' has duplicate model IDs across layers: ${[...new Set(duplicates)].join(', ')}`);
    }
  }

  if (!policies.complexity_routing || typeof policies.complexity_routing !== 'object') {
    fail('complexity_routing missing or invalid');
  } else {
    for (const [level, cfg] of Object.entries(policies.complexity_routing)) {
      const pref = cfg?.model_preference;
      if (!Array.isArray(pref) || pref.length === 0) {
        fail(`complexity_routing '${level}' must define non-empty model_preference`);
        continue;
      }
      for (const modelId of pref) {
        if (!modelIds.has(modelId)) {
          fail(`complexity_routing '${level}' references unknown model '${modelId}'`);
        }
      }
    }
  }

  if (failures > 0) {
    console.error(`\n[FAIL] policies structural validation failed (${failures} error(s), ${warnings} warning(s))`);
    process.exit(1);
  }

  console.log(`\n[PASS] policies structural validation passed (${warnings} warning(s))`);
}

main();
