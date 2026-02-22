#!/usr/bin/env node

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { resolveRoot } from './resolve-root.mjs';

const root = resolveRoot();

function readJson(relativePath) {
  const filePath = path.join(root, relativePath);
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function parseDelegationModelsFromYaml(relativePath) {
  const filePath = path.join(root, relativePath);
  const content = readFileSync(filePath, 'utf8');
  const models = new Set();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = line.match(/^models:\s*\[([^\]]*)\]\s*$/);
    if (!match) continue;

    const parts = match[1]
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => part.replace(/^['"]|['"]$/g, ''));

    for (const model of parts) {
      models.add(model);
    }
  }

  return models;
}

function collectCatalogIndex(opencodeConfig) {
  const providerToModels = new Map();
  const modelNames = new Set();
  const models = opencodeConfig?.models || {};

  for (const [provider, providerConfig] of Object.entries(models)) {
    const providerModels = providerConfig?.models || {};
    const modelSet = new Set(Object.keys(providerModels));
    providerToModels.set(provider, modelSet);
    for (const modelName of modelSet) {
      modelNames.add(modelName);
    }
  }

  return { providerToModels, modelNames };
}

function parseProviderModel(modelRef) {
  if (typeof modelRef !== 'string') return null;
  const [provider, ...modelParts] = modelRef.split('/');
  if (!provider || modelParts.length === 0) return null;
  return { provider, modelName: modelParts.join('/') };
}

function main() {
  const opencodeConfig = readJson('opencode-config/opencode.json');
  const omoConfig = readJson('opencode-config/oh-my-opencode.json');
  const delegationModels = parseDelegationModelsFromYaml('opencode-config/config.yaml');

  const errors = [];
  const { providerToModels, modelNames } = collectCatalogIndex(opencodeConfig);

  const enabledAgents = Array.isArray(omoConfig?.agents?.enabled) ? omoConfig.agents.enabled : [];
  for (const agent of enabledAgents) {
    const config = omoConfig?.agents?.[agent];
    const modelRef = config?.model;
    if (!modelRef) {
      errors.push(`Agent '${agent}' is enabled but has no model configured.`);
      continue;
    }

    const parsed = parseProviderModel(modelRef);
    if (!parsed) {
      errors.push(`Agent '${agent}' has invalid model reference '${modelRef}'. Expected 'provider/model'.`);
      continue;
    }

    const providerModels = providerToModels.get(parsed.provider);
    if (!providerModels) {
      errors.push(`Agent '${agent}' references unknown provider '${parsed.provider}' in '${modelRef}'.`);
      continue;
    }

    if (!providerModels.has(parsed.modelName)) {
      errors.push(`Agent '${agent}' references unknown model '${parsed.modelName}' for provider '${parsed.provider}'.`);
    }
  }

  for (const modelName of delegationModels) {
    if (!modelNames.has(modelName)) {
      errors.push(`Delegation model '${modelName}' in config.yaml is not present in opencode model catalog.`);
    }
  }

  const omoMcp = omoConfig?.mcp && typeof omoConfig.mcp === 'object' ? Object.keys(omoConfig.mcp) : [];
  const catalogMcp = opencodeConfig?.mcp && typeof opencodeConfig.mcp === 'object' ? opencodeConfig.mcp : {};
  for (const server of omoMcp) {
    if (!Object.prototype.hasOwnProperty.call(catalogMcp, server)) {
      errors.push(`oh-my-opencode MCP '${server}' is not declared in opencode.json MCP catalog.`);
    }
  }

  if (errors.length > 0) {
    console.error(`config-coherence: FAIL (${errors.length} issue${errors.length === 1 ? '' : 's'})`);
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(
    `config-coherence: PASS (${enabledAgents.length} enabled agent models, ${delegationModels.size} delegation models, ${omoMcp.length} MCP references)`
  );
}

main();
