#!/usr/bin/env node

import { access, cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import YAML from 'yaml';

import { getLegacyAdapter, LEGACY_FILENAMES } from '../src/config/adapters/index.ts';
import { mergeConfigs } from '../src/config/merge.ts';
import { createDefaultConfig } from '../src/config/schema.ts';
import { validateConfig } from '../src/config/validation.ts';

const LEGACY_FILE_CANDIDATE_DIRS = ['.', 'opencode-config', '.opencode'];

const DATA_MAPPINGS = [
  ['.sisyphus/trajectories', 'data/trajectories'],
  ['.sisyphus/state', 'data/state'],
  ['.sisyphus/notepads', 'data/notepads'],
  ['.sisyphus/docs', 'data/docs'],
  ['.sisyphus/plans', 'data/plans'],
  ['todos', 'data/todos'],
  ['skill-rl-state.json', 'data/skill-rl-state.json'],
  ['rate-limit-fallback.json', 'data/rate-limit-fallback.json']
];

function parseArgs(argv) {
  const options = {
    source: process.cwd(),
    target: process.cwd(),
    output: '.opencode/config.yaml',
    dryRun: false,
    json: false,
    strict: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--source') {
      options.source = argv[++index] ?? options.source;
      continue;
    }

    if (token.startsWith('--source=')) {
      options.source = token.slice('--source='.length);
      continue;
    }

    if (token === '--target') {
      options.target = argv[++index] ?? options.target;
      continue;
    }

    if (token.startsWith('--target=')) {
      options.target = token.slice('--target='.length);
      continue;
    }

    if (token === '--output') {
      options.output = argv[++index] ?? options.output;
      continue;
    }

    if (token.startsWith('--output=')) {
      options.output = token.slice('--output='.length);
      continue;
    }

    if (token === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (token === '--json') {
      options.json = true;
      continue;
    }

    if (token === '--strict') {
      options.strict = true;
      continue;
    }
  }

  return options;
}

async function exists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function normalizeJson(value) {
  return JSON.stringify(value, null, 2);
}

function dedupe(values) {
  return [...new Set(values)];
}

function asObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value
    : undefined;
}

function sanitizePatch(patch) {
  const next = {
    ...patch
  };

  if (Array.isArray(next.plugins)) {
    next.plugins = next.plugins.filter((entry) => typeof entry === 'string');
  }

  const models = asObject(next.models);
  if (models) {
    const providers = asObject(models.providers);
    if (providers) {
      const sanitizedProviders = {};
      for (const [providerId, providerConfig] of Object.entries(providers)) {
        if (asObject(providerConfig)) {
          sanitizedProviders[providerId] = providerConfig;
        }
      }

      models.providers = sanitizedProviders;
      next.models = models;
    }
  }

  const mcp = asObject(next.mcp);
  if (mcp) {
    const servers = asObject(mcp.servers);
    if (servers) {
      const sanitizedServers = {};

      for (const [serverId, serverConfig] of Object.entries(servers)) {
        if (asObject(serverConfig)) {
          const normalizedServer = {
            ...serverConfig
          };

          if (Array.isArray(normalizedServer.command)) {
            const [command, ...args] = normalizedServer.command
              .map((entry) => String(entry))
              .filter((entry) => entry.length > 0);

            if (command) {
              normalizedServer.command = command;
              const existingArgs = Array.isArray(normalizedServer.args)
                ? normalizedServer.args.map((entry) => String(entry))
                : [];
              normalizedServer.args = [...args, ...existingArgs];
            } else {
              delete normalizedServer.command;
            }
          }

          sanitizedServers[serverId] = normalizedServer;
          continue;
        }

        if (typeof serverConfig === 'string') {
          sanitizedServers[serverId] = {
            command: serverConfig
          };
          continue;
        }

        if (typeof serverConfig === 'boolean') {
          sanitizedServers[serverId] = {
            enabled: serverConfig
          };
        }
      }

      mcp.servers = sanitizedServers;
      next.mcp = mcp;
    }
  }

  return next;
}

function resolveOutputPath(targetRoot, outputPath) {
  return path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(targetRoot, outputPath);
}

async function loadLegacyConfigFile(sourceRoot, fileName) {
  for (const baseDir of LEGACY_FILE_CANDIDATE_DIRS) {
    const candidate = path.resolve(sourceRoot, baseDir, fileName);
    if (!(await exists(candidate))) {
      continue;
    }

    const raw = await readFile(candidate, 'utf8');
    const parsed = fileName.endsWith('.yaml') || fileName.endsWith('.yml')
      ? YAML.parse(raw)
      : JSON.parse(raw);

    return {
      filePath: candidate,
      parsed: parsed ?? {}
    };
  }

  return undefined;
}

async function migrateConfigs(sourceRoot, issues) {
  let merged = createDefaultConfig();
  const migratedFiles = [];

  for (const fileName of LEGACY_FILENAMES) {
    const loaded = await loadLegacyConfigFile(sourceRoot, fileName);
    if (!loaded) {
      issues.warnings.push(`Legacy config not found: ${fileName}`);
      continue;
    }

    try {
      const adapter = getLegacyAdapter(fileName);
      const patch = sanitizePatch(adapter(loaded.parsed));
      const candidate = mergeConfigs(merged, patch);
      validateConfig(candidate);
      merged = candidate;
      migratedFiles.push({
        fileName,
        filePath: loaded.filePath
      });
    } catch (error) {
      issues.errors.push(`Failed to migrate ${loaded.filePath}: ${toErrorMessage(error)}`);
    }
  }

  const legacySources = dedupe([
    ...(Array.isArray(merged.legacy?.sources) ? merged.legacy.sources : []),
    ...migratedFiles.map((entry) => entry.filePath)
  ]);

  let validated;
  try {
    validated = validateConfig({
      ...merged,
      version: String(merged.version ?? '2.0').startsWith('2.') ? merged.version : '2.0',
      legacy: {
        ...(merged.legacy ?? {}),
        sources: legacySources,
        raw: merged.legacy?.raw ?? {}
      }
    });
  } catch (error) {
    issues.errors.push(`Final merged config validation failed: ${toErrorMessage(error)}`);
    validated = validateConfig({
      ...createDefaultConfig(),
      legacy: {
        ...createDefaultConfig().legacy,
        sources: legacySources,
        raw: {}
      }
    });
  }

  return {
    config: validated,
    migratedFiles
  };
}

async function copyData(sourceRoot, targetRoot, dryRun, issues) {
  const copied = [];

  for (const [fromRel, toRel] of DATA_MAPPINGS) {
    const sourcePath = path.resolve(sourceRoot, fromRel);
    if (!(await exists(sourcePath))) {
      issues.warnings.push(`Data source missing: ${fromRel}`);
      continue;
    }

    const targetPath = path.resolve(targetRoot, toRel);
    copied.push({
      sourcePath,
      targetPath
    });

    if (dryRun) {
      continue;
    }

    await mkdir(path.dirname(targetPath), { recursive: true });
    await cp(sourcePath, targetPath, {
      recursive: true,
      force: true,
      preserveTimestamps: true
    });
  }

  return copied;
}

async function verifyMigration(configPath, copiedData, dryRun, issues) {
  if (dryRun) {
    return {
      configVerified: false,
      copiedVerified: false,
      verifiedEntries: 0
    };
  }

  let configVerified = false;
  try {
    const text = await readFile(configPath, 'utf8');
    const parsed = YAML.parse(text);
    const validated = validateConfig(parsed);
    configVerified = String(validated.version).startsWith('2.');
    if (!configVerified) {
      issues.errors.push('Migrated config does not report a v2 version');
    }
  } catch (error) {
    issues.errors.push(`Failed to verify migrated config: ${toErrorMessage(error)}`);
  }

  let copiedVerified = true;
  for (const entry of copiedData) {
    if (!(await exists(entry.targetPath))) {
      copiedVerified = false;
      issues.errors.push(`Missing migrated data path: ${entry.targetPath}`);
      continue;
    }

    const sourceStats = await stat(entry.sourcePath);
    const targetStats = await stat(entry.targetPath);
    if (sourceStats.isDirectory() !== targetStats.isDirectory()) {
      copiedVerified = false;
      issues.errors.push(`Type mismatch after copy: ${entry.targetPath}`);
    }
  }

  return {
    configVerified,
    copiedVerified,
    verifiedEntries: copiedData.length
  };
}

function toErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function printHuman(summary) {
  console.log('OpenCode CLI v2 migration report');
  console.log('================================');
  console.log(`source: ${summary.source}`);
  console.log(`target: ${summary.target}`);
  console.log(`config: ${summary.configPath}`);
  console.log(`dryRun: ${summary.dryRun}`);
  console.log('');

  console.log(`migrated config files: ${summary.migratedFiles.length}`);
  for (const entry of summary.migratedFiles) {
    console.log(`  - ${entry.fileName}: ${entry.filePath}`);
  }

  console.log(`migrated data entries: ${summary.copiedData.length}`);
  for (const entry of summary.copiedData) {
    console.log(`  - ${entry.sourcePath} -> ${entry.targetPath}`);
  }

  console.log('');
  console.log(
    `verification: config=${summary.verification.configVerified} data=${summary.verification.copiedVerified} entries=${summary.verification.verifiedEntries}`
  );

  if (summary.issues.warnings.length > 0) {
    console.log('');
    console.log('warnings:');
    for (const warning of summary.issues.warnings) {
      console.log(`  - ${warning}`);
    }
  }

  if (summary.issues.errors.length > 0) {
    console.log('');
    console.log('errors:');
    for (const error of summary.issues.errors) {
      console.log(`  - ${error}`);
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourceRoot = path.resolve(options.source);
  const targetRoot = path.resolve(options.target);
  const configPath = resolveOutputPath(targetRoot, options.output);

  const issues = {
    warnings: [],
    errors: []
  };

  if (!(await exists(sourceRoot))) {
    issues.errors.push(`Source directory does not exist: ${sourceRoot}`);
  }

  if (issues.errors.length > 0) {
    const failed = {
      source: sourceRoot,
      target: targetRoot,
      configPath,
      dryRun: options.dryRun,
      migratedFiles: [],
      copiedData: [],
      verification: {
        configVerified: false,
        copiedVerified: false,
        verifiedEntries: 0
      },
      issues
    };

    if (options.json) {
      console.log(normalizeJson(failed));
    } else {
      printHuman(failed);
    }

    process.exit(1);
  }

  const migrated = await migrateConfigs(sourceRoot, issues);

  if (!options.dryRun) {
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, YAML.stringify(migrated.config), 'utf8');
  }

  const copiedData = await copyData(sourceRoot, targetRoot, options.dryRun, issues);
  const verification = await verifyMigration(configPath, copiedData, options.dryRun, issues);

  const summary = {
    source: sourceRoot,
    target: targetRoot,
    configPath,
    dryRun: options.dryRun,
    migratedFiles: migrated.migratedFiles,
    copiedData,
    verification,
    issues
  };

  if (options.json) {
    console.log(normalizeJson(summary));
  } else {
    printHuman(summary);
  }

  const hasErrors = issues.errors.length > 0;
  const hasWarnings = issues.warnings.length > 0;
  process.exit(hasErrors || (options.strict && hasWarnings) ? 1 : 0);
}

await main();
