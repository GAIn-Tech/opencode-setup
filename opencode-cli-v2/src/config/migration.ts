import { basename } from 'node:path';

import {
  LEGACY_FILENAMES,
  getLegacyAdapter,
  type LegacyConfigFormat
} from './adapters';
import { mergeConfigs } from './merge';
import { createDefaultConfig, type UnifiedConfig } from './schema';
import { validateConfig } from './validation';

export type ConfigFormat = 'unified' | LegacyConfigFormat;

export interface MigrationResult {
  readonly config: UnifiedConfig;
  readonly format: ConfigFormat;
  readonly migrated: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

export function detectLegacyFormat(filePath: string, parsed: unknown): ConfigFormat {
  const source = asRecord(parsed);
  if (typeof source.version === 'string' && source.version.startsWith('2.')) {
    return 'unified';
  }

  const fileName = basename(filePath).toLowerCase();
  if (LEGACY_FILENAMES.includes(fileName as LegacyConfigFormat)) {
    return fileName as LegacyConfigFormat;
  }

  if ('provider' in source || 'plugin' in source) {
    return 'opencode.json';
  }

  if ('account_selection_strategy' in source || 'quota_fallback' in source) {
    return 'antigravity.json';
  }

  if ('google_auth' in source || 'agents' in source) {
    return 'oh-my-opencode.json';
  }

  if ('skills' in source && 'commands' in source) {
    return 'compound-engineering.json';
  }

  if ('global_rules' in source || 'delegation' in source) {
    return 'config.yaml';
  }

  if ('runtime' in source || 'performance' in source) {
    return '.opencode.config.json';
  }

  return 'unified';
}

export function migrateConfigObject(
  parsed: unknown,
  format: ConfigFormat,
  sourcePath?: string
): MigrationResult {
  if (format === 'unified') {
    return {
      config: validateConfig(parsed),
      format,
      migrated: false
    };
  }

  const adapter = getLegacyAdapter(format);
  const migrated = adapter(parsed);

  const merged = mergeConfigs(createDefaultConfig(), migrated as UnifiedConfig);
  const validated = validateConfig(merged);
  const sources = [...validated.legacy.sources];
  if (sourcePath !== undefined) {
    sources.push(sourcePath);
  }

  return {
    config: {
      ...validated,
      legacy: {
        ...validated.legacy,
        sources
      }
    },
    format,
    migrated: true
  };
}
