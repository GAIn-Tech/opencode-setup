#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { resolveRoot } from './resolve-root.mjs';

const ROOT = resolveRoot();
const fallbackConfigPath = path.join(ROOT, 'opencode-config', 'rate-limit-fallback.json');
const strategyPath = path.join(ROOT, 'packages', 'opencode-model-router-x', 'src', 'strategies', 'fallback-layer-strategy.js');

function fail(msg) {
  throw new Error(`validate-fallback-consistency: ${msg}`);
}

const PROVIDER_ALIASES = new Map([
  ['google', 'antigravity'],
  ['antigravity', 'antigravity'],
]);

const NON_PROVIDER_MODEL_FAMILIES = new Set(['deepseek']);

function normalizeProvider(provider) {
  return PROVIDER_ALIASES.get(provider) || provider;
}

function parseLayerProviders(fileText) {
  const layerSection = fileText.match(/#LAYERS\s*=\s*\[([\s\S]*?)\];/);
  if (!layerSection) return [];
  const providers = [...layerSection[1].matchAll(/['"]([a-z0-9-]+)['"]/gi)].map((m) => m[1]);
  return [...new Set(providers)];
}

function parseStrategyCatalogProviders(fileText) {
  const catalogSection = fileText.match(/#MODEL_CATALOG\s*=\s*\{([\s\S]*?)\n\s*\};/);
  if (!catalogSection) return [];
  const providers = [...catalogSection[1].matchAll(/^\s{4}([a-z0-9-]+)\s*:\s*\{/gim)].map((m) => m[1]);
  return [...new Set(providers)];
}

function main() {
  if (!fs.existsSync(fallbackConfigPath)) fail(`missing ${fallbackConfigPath}`);
  if (!fs.existsSync(strategyPath)) fail(`missing ${strategyPath}`);

  const fallback = JSON.parse(fs.readFileSync(fallbackConfigPath, 'utf8'));
  const strategyText = fs.readFileSync(strategyPath, 'utf8');

  const configProviders = [
    ...new Set(
      (fallback?.fallbackModels || [])
        .map((entry) => entry?.providerID)
        .filter((entry) => typeof entry === 'string' && entry.length > 0)
        .map((entry) => normalizeProvider(entry))
        .filter((entry) => !NON_PROVIDER_MODEL_FAMILIES.has(entry))
    ),
  ];

  if (configProviders.length === 0) {
    fail('no providers found in opencode-config/rate-limit-fallback.json fallbackModels');
  }

  const layerProviders = parseLayerProviders(strategyText).map((entry) => normalizeProvider(entry));
  if (layerProviders.length === 0) {
    fail('could not parse provider layers from fallback-layer-strategy.js');
  }

  const catalogProviders = parseStrategyCatalogProviders(strategyText)
    .map((entry) => normalizeProvider(entry))
    .filter((entry) => !NON_PROVIDER_MODEL_FAMILIES.has(entry));

  const missingInLayers = [...new Set(configProviders.filter((provider) => !layerProviders.includes(provider)))];
  const missingInConfig = [...new Set(layerProviders.filter((provider) => !configProviders.includes(provider)))];
  const catalogUnreachable = catalogProviders.filter((provider) => !layerProviders.includes(provider));

  const errors = [];
  if (missingInLayers.length > 0) {
    errors.push(`providers present in config but missing in strategy layers: ${missingInLayers.join(', ')}`);
  }
  if (missingInConfig.length > 0) {
    errors.push(`providers present in strategy layers but missing in config: ${missingInConfig.join(', ')}`);
  }
  if (catalogUnreachable.length > 0) {
    console.warn(
      `validate-fallback-consistency: WARN providers present in strategy catalog but unreachable by layer order: ${[
        ...new Set(catalogUnreachable),
      ].join(', ')}`
    );
  }

  if (errors.length > 0) {
    fail(errors.join(' | '));
  }

  console.log('validate-fallback-consistency: PASS');
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
