import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

import { LEGACY_FILENAMES, getLegacyAdapter, type LegacyConfigFormat } from './adapters';
import { applyCliOverrides, applyEnvironmentOverrides, mergeConfigs } from './merge';
import { detectLegacyFormat, migrateConfigObject, type ConfigFormat } from './migration';
import { createDefaultConfig, type UnifiedConfig } from './schema';
import type { ConfigLoadSources } from './types';
import { validateConfig } from './validation';

export interface LoadConfigFileResult {
  readonly path: string;
  readonly format: ConfigFormat;
  readonly migrated: boolean;
  readonly config: UnifiedConfig;
}

export interface LoadConfigOptions {
  readonly cwd?: string;
  readonly defaults?: UnifiedConfig;
  readonly globalPath?: string;
  readonly projectPath?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly envPrefix?: string;
  readonly cliOverrides?: Partial<UnifiedConfig>;
  readonly includeLegacyDiscovery?: boolean;
}

export interface LoadConfigResult {
  readonly config: UnifiedConfig;
  readonly sources: ConfigLoadSources;
}

const DEFAULT_GLOBAL_CONFIG_PATH = join(homedir(), '.config', 'opencode', 'config.yaml');
const DEFAULT_PROJECT_CONFIG_PATH = '.opencode/config.yaml';

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function parseConfigText(text: string, filePath: string): unknown {
  const lowerPath = filePath.toLowerCase();
  if (lowerPath.endsWith('.yaml') || lowerPath.endsWith('.yml')) {
    return parseYaml(text);
  }

  return JSON.parse(text) as unknown;
}

function normalizeParsed(value: unknown): unknown {
  return value ?? {};
}

export async function loadConfigFile(filePath: string): Promise<LoadConfigFileResult> {
  const rawText = await readFile(filePath, 'utf8');
  const parsed = normalizeParsed(parseConfigText(rawText, filePath));
  const format = detectLegacyFormat(filePath, parsed);
  const migrated = migrateConfigObject(parsed, format, filePath);

  return {
    path: filePath,
    format,
    migrated: migrated.migrated,
    config: migrated.config
  };
}

async function loadOptionalConfig(path: string): Promise<LoadConfigFileResult | undefined> {
  if (!(await exists(path))) {
    return undefined;
  }

  return loadConfigFile(path);
}

async function loadLegacyConfigSet(baseDir: string): Promise<readonly LoadConfigFileResult[]> {
  const entries: LoadConfigFileResult[] = [];

  for (const fileName of LEGACY_FILENAMES) {
    const fullPath = join(baseDir, fileName);
    if (!(await exists(fullPath))) {
      continue;
    }

    const rawText = await readFile(fullPath, 'utf8');
    const parsed = normalizeParsed(parseConfigText(rawText, fullPath));
    const format = detectLegacyFormat(fullPath, parsed);

    if (format === 'unified') {
      entries.push({
        path: fullPath,
        format,
        migrated: false,
        config: validateConfig(parsed)
      });
      continue;
    }

    const adapter = getLegacyAdapter(format);
    const patch = adapter(parsed);
    const withSource = {
      ...patch,
      legacy: {
        ...patch.legacy,
        sources: [...(patch.legacy?.sources ?? []), fullPath]
      }
    };

    validateConfig(mergeConfigs(createDefaultConfig(), withSource as UnifiedConfig));

    entries.push({
      path: fullPath,
      format,
      migrated: true,
      config: withSource as UnifiedConfig
    });
  }

  return entries;
}

function dedupePaths(paths: readonly string[]): string[] {
  return [...new Set(paths)];
}

function mergeLegacyRaw(configs: readonly UnifiedConfig[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};

  for (const config of configs) {
    Object.assign(merged, config.legacy.raw);
  }

  return merged;
}

export async function loadConfig(options: LoadConfigOptions = {}): Promise<LoadConfigResult> {
  const cwd = options.cwd ?? process.cwd();
  const defaults = options.defaults ?? createDefaultConfig();
  const globalPath = options.globalPath ?? DEFAULT_GLOBAL_CONFIG_PATH;
  const projectPath = options.projectPath ?? join(cwd, DEFAULT_PROJECT_CONFIG_PATH);
  const includeLegacyDiscovery = options.includeLegacyDiscovery ?? true;

  const globalLayer = await loadOptionalConfig(globalPath);
  const projectLayer = await loadOptionalConfig(projectPath);

  const legacyLayers: LoadConfigFileResult[] = [];
  if (includeLegacyDiscovery && globalLayer === undefined) {
    legacyLayers.push(...(await loadLegacyConfigSet(dirname(globalPath))));
  }

  if (includeLegacyDiscovery && projectLayer === undefined) {
    legacyLayers.push(...(await loadLegacyConfigSet(cwd)));
    legacyLayers.push(...(await loadLegacyConfigSet(join(cwd, 'opencode-config'))));
  }

  let merged = mergeConfigs(
    defaults,
    globalLayer?.config,
    projectLayer?.config,
    ...legacyLayers.map((entry) => entry.config)
  );

  merged = applyEnvironmentOverrides(merged, {
    env: options.env,
    prefix: options.envPrefix
  });
  merged = applyCliOverrides(merged, options.cliOverrides);

  const legacyPaths = dedupePaths(
    legacyLayers.map((entry) => entry.path).concat(merged.legacy.sources)
  );

  const validated = validateConfig({
    ...merged,
    legacy: {
      ...merged.legacy,
      sources: legacyPaths,
      raw: mergeLegacyRaw(legacyLayers.map((entry) => entry.config).concat([merged]))
    }
  });

  return {
    config: validated,
    sources: {
      defaults: true,
      globalPath: globalLayer?.path,
      projectPath: projectLayer?.path,
      legacyPaths
    }
  };
}

export { DEFAULT_GLOBAL_CONFIG_PATH, DEFAULT_PROJECT_CONFIG_PATH, type LegacyConfigFormat };
