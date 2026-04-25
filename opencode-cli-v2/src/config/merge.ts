import type { UnifiedConfig } from './schema';

type MergeableValue = unknown;
type MutableRecord = Record<string, MergeableValue>;

function isRecord(value: MergeableValue): value is MutableRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    const cloned: unknown[] = value.map((entry: unknown) => cloneValue(entry));
    return cloned as T;
  }

  if (isRecord(value)) {
    const result: MutableRecord = {};
    for (const [key, nested] of Object.entries(value)) {
      result[key] = cloneValue(nested);
    }
    return result as T;
  }

  return value;
}

function mergeTwoValues(base: MergeableValue, override: MergeableValue): MergeableValue {
  if (override === undefined) {
    return cloneValue(base);
  }

  if (Array.isArray(override)) {
    return cloneValue(override);
  }

  if (isRecord(base) && isRecord(override)) {
    const merged: MutableRecord = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(override)]);

    for (const key of keys) {
      const next = override[key] === undefined ? base[key] : override[key];
      merged[key] = mergeTwoValues(base[key], next);
    }

    return merged;
  }

  return cloneValue(override);
}

export function mergeConfigs<T extends object>(...configs: readonly (T | undefined)[]): T {
  let current: MergeableValue = {};

  for (const config of configs) {
    if (config === undefined) {
      continue;
    }

    current = mergeTwoValues(current, config);
  }

  return current as T;
}

function parseEnvValue(value: string): MergeableValue {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return '';
  }

  if (trimmed === 'true') {
    return true;
  }

  if (trimmed === 'false') {
    return false;
  }

  if (trimmed === 'null') {
    return null;
  }

  const numericValue = Number(trimmed);
  if (!Number.isNaN(numericValue) && /^[-+]?\d+(?:\.\d+)?$/.test(trimmed)) {
    return numericValue;
  }

  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed) as MergeableValue;
    } catch {
      return value;
    }
  }

  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }

  return value;
}

function setNestedPath(target: MutableRecord, path: readonly string[], value: MergeableValue): void {
  if (path.length === 0) {
    return;
  }

  let current: MutableRecord = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    if (segment === undefined) {
      continue;
    }

    const existing = current[segment];
    if (!isRecord(existing)) {
      const created: MutableRecord = {};
      current[segment] = created;
      current = created;
      continue;
    }

    current = existing;
  }

  const last = path[path.length - 1];
  if (last !== undefined) {
    current[last] = value;
  }
}

function envKeyToPath(envKey: string, prefix: string): readonly string[] {
  const body = envKey.slice(prefix.length);
  const placeholder = '___UNDERSCORE___';

  return body
    .replaceAll('__', placeholder)
    .split('_')
    .map((segment) => segment.toLowerCase().replaceAll(placeholder, '_'))
    .filter((segment) => segment.length > 0);
}

export interface EnvironmentOverrideOptions {
  readonly prefix?: string;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export function buildEnvOverrideObject(options: EnvironmentOverrideOptions = {}): Partial<UnifiedConfig> {
  const prefix = options.prefix ?? 'OPENCODE_';
  const env = options.env ?? process.env;
  const overrides: MutableRecord = {};

  for (const [key, raw] of Object.entries(env)) {
    if (!key.startsWith(prefix) || raw === undefined) {
      continue;
    }

    const path = envKeyToPath(key, prefix);
    if (path.length === 0) {
      continue;
    }

    setNestedPath(overrides, path, parseEnvValue(raw));
  }

  return overrides as Partial<UnifiedConfig>;
}

export function applyEnvironmentOverrides(config: UnifiedConfig, options: EnvironmentOverrideOptions = {}): UnifiedConfig {
  const envOverrides = buildEnvOverrideObject(options);
  return mergeConfigs(config, envOverrides as UnifiedConfig);
}

export function applyCliOverrides(
  config: UnifiedConfig,
  cliOverrides: Partial<UnifiedConfig> | undefined
): UnifiedConfig {
  if (cliOverrides === undefined) {
    return config;
  }

  return mergeConfigs(config, cliOverrides as UnifiedConfig);
}
