#!/usr/bin/env node

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const requiredKeys = [
  'OPENCODE_BUN_PATH',
  'OPENCODE_REQUIRED_BUN_VERSION',
  'OPENCODE_ROOT',
  'OPENCODE_CONFIG_HOME',
  'OPENCODE_DATA_HOME',
  'PLUGIN_SCOPE',
  'BUN_INSTALL',
  'ANTHROPIC_API_KEYS',
  'OPENAI_API_KEYS',
  'GOOGLE_API_KEYS',
  'GITHUB_TOKEN',
  'TAVILY_API_KEY',
  'SUPERMEMORY_API_KEY',
];

const optionalPathKeys = [
  'OPENCODE_BUN_PATH',
  'OPENCODE_ROOT',
  'OPENCODE_CONFIG_HOME',
  'OPENCODE_DATA_HOME',
  'BUN_INSTALL',
  'TMPDIR',
  'TEMP',
  'TMP',
];

const numericRules = [
  { key: 'RATE_LIMIT_COOLDOWN_MS', min: 1, max: Number.MAX_SAFE_INTEGER },
  { key: 'RATE_LIMIT_MAX_FAILURES', min: 1, max: Number.MAX_SAFE_INTEGER },
  { key: 'QUOTA_WARNING_THRESHOLD', min: 0, max: 100 },
  { key: 'QUOTA_CRITICAL_THRESHOLD', min: 0, max: 100 },
];

const runtimeContractFields = [
  ...requiredKeys,
  ...optionalPathKeys,
  ...numericRules.map((rule) => rule.key),
  'LC_ALL',
  'LANG',
  'TZ',
  'OPENAI_API_KEYS',
  'XDG_CACHE_HOME',
];

const runtimeProbeFieldSet = new Set(runtimeContractFields);

function issue(code, message) {
  return { code, message };
}

function parseEnvExample(content) {
  const entries = new Map();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    entries.set(key, value);
  }
  return entries;
}

function isAbsolutePath(value) {
  if (!value) return false;
  if (path.isAbsolute(value)) return true;
  if (/^[A-Za-z]:[\\/]/.test(value)) return true;
  if (/^\\\\[^\\]+\\[^\\]+/.test(value)) return true;
  return false;
}

function isSemver(value) {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

function parseInteger(value) {
  if (!/^-?\d+$/.test(value)) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function validateSchemaContract(entries) {
  const issues = [];

  const missing = requiredKeys.filter((key) => !entries.has(key));
  for (const key of missing) {
    issues.push(issue('ENV_SCHEMA_MISSING_KEY', `Missing in .env.example: ${key}`));
  }

  const expectedBunVersion = String(entries.get('OPENCODE_REQUIRED_BUN_VERSION') || '').trim();
  if (!expectedBunVersion) {
    issues.push(issue('ENV_SCHEMA_INVALID_FIELD', 'OPENCODE_REQUIRED_BUN_VERSION must be non-empty.'));
  } else if (!isSemver(expectedBunVersion)) {
    issues.push(
      issue(
        'ENV_SCHEMA_INVALID_FIELD',
        `OPENCODE_REQUIRED_BUN_VERSION must be semver (found: ${expectedBunVersion}).`,
      ),
    );
  }

  for (const key of optionalPathKeys) {
    const rawValue = String(entries.get(key) || '').trim();
    if (!rawValue) continue;
    if (!isAbsolutePath(rawValue)) {
      issues.push(
        issue('ENV_SCHEMA_INVALID_FIELD', `${key} must be an absolute path when set (found: ${rawValue}).`),
      );
    }
  }

  const numericValues = new Map();
  for (const rule of numericRules) {
    const rawValue = String(entries.get(rule.key) || '').trim();
    if (!rawValue) {
      issues.push(issue('ENV_SCHEMA_INVALID_FIELD', `${rule.key} must be non-empty.`));
      continue;
    }

    const numericValue = parseInteger(rawValue);
    if (numericValue === null) {
      issues.push(issue('ENV_SCHEMA_INVALID_FIELD', `${rule.key} must be an integer (found: ${rawValue}).`));
      continue;
    }

    if (numericValue < rule.min || numericValue > rule.max) {
      issues.push(
        issue(
          'ENV_SCHEMA_INVALID_FIELD',
          `${rule.key} must be between ${rule.min} and ${rule.max} (found: ${numericValue}).`,
        ),
      );
      continue;
    }

    numericValues.set(rule.key, numericValue);
  }

  const warning = numericValues.get('QUOTA_WARNING_THRESHOLD');
  const critical = numericValues.get('QUOTA_CRITICAL_THRESHOLD');
  if (typeof warning === 'number' && typeof critical === 'number' && warning >= critical) {
    issues.push(
      issue(
        'ENV_SCHEMA_INVALID_FIELD',
        `QUOTA_WARNING_THRESHOLD (${warning}) must be lower than QUOTA_CRITICAL_THRESHOLD (${critical}).`,
      ),
    );
  }

  return issues;
}

function validateRuntimeValues(values) {
  const issues = [];

  const runtimeBunVersion = String(values.OPENCODE_REQUIRED_BUN_VERSION ?? '').trim();
  if (runtimeBunVersion && !isSemver(runtimeBunVersion)) {
    issues.push(
      issue(
        'ENV_REALIZATION_MISMATCH',
        `Runtime OPENCODE_REQUIRED_BUN_VERSION must be semver when set (found: ${runtimeBunVersion}).`,
      ),
    );
  }

  for (const key of optionalPathKeys) {
    const rawValue = String(values[key] ?? '').trim();
    if (!rawValue) continue;
    if (!isAbsolutePath(rawValue)) {
      issues.push(
        issue('ENV_REALIZATION_MISMATCH', `Runtime ${key} must be an absolute path when set (found: ${rawValue}).`),
      );
    }
  }

  const numericValues = new Map();
  for (const rule of numericRules) {
    const rawValue = String(values[rule.key] ?? '').trim();
    if (!rawValue) continue;

    const numericValue = parseInteger(rawValue);
    if (numericValue === null) {
      issues.push(
        issue('ENV_REALIZATION_MISMATCH', `Runtime ${rule.key} must be an integer when set (found: ${rawValue}).`),
      );
      continue;
    }

    if (numericValue < rule.min || numericValue > rule.max) {
      issues.push(
        issue(
          'ENV_REALIZATION_MISMATCH',
          `Runtime ${rule.key} must be between ${rule.min} and ${rule.max} when set (found: ${numericValue}).`,
        ),
      );
      continue;
    }

    numericValues.set(rule.key, numericValue);
  }

  const warning = numericValues.get('QUOTA_WARNING_THRESHOLD');
  const critical = numericValues.get('QUOTA_CRITICAL_THRESHOLD');
  if (typeof warning === 'number' && typeof critical === 'number' && warning >= critical) {
    issues.push(
      issue(
        'ENV_REALIZATION_MISMATCH',
        `Runtime QUOTA_WARNING_THRESHOLD (${warning}) must be lower than QUOTA_CRITICAL_THRESHOLD (${critical}).`,
      ),
    );
  }

  return issues;
}

function captureRuntimeProbe({ fields = runtimeContractFields, env = process.env, cwd = process.cwd() } = {}) {
  const requestedFields = Array.from(new Set(fields));
  const script = `
const fields = ${JSON.stringify(requestedFields)};
const values = Object.fromEntries(fields.map((key) => [key, Object.prototype.hasOwnProperty.call(process.env, key) ? process.env[key] : null]));
console.log(JSON.stringify({
  platform: process.platform,
  nodeVersion: process.version,
  cwd: process.cwd(),
  values,
}));
`.trim();

  const result = spawnSync(process.execPath, ['-e', script], {
    cwd,
    env,
    encoding: 'utf8',
  });

  if (result.error) {
    return {
      ok: false,
      issues: [
        issue('ENV_PROBE_FAILED', `Runtime probe process failed to start: ${result.error.message}`),
      ],
    };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      issues: [
        issue(
          'ENV_PROBE_FAILED',
          `Runtime probe exited with status ${String(result.status)}${result.stderr ? ` (${result.stderr.trim()})` : ''}.`,
        ),
      ],
    };
  }

  const stdout = String(result.stdout || '').trim();
  if (!stdout) {
    return {
      ok: false,
      issues: [issue('ENV_PROBE_FAILED', 'Runtime probe produced empty output.')],
    };
  }

  try {
    const payload = JSON.parse(stdout);
    return {
      ok: true,
      payload,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      issues: [issue('ENV_PROBE_FAILED', `Runtime probe returned invalid JSON: ${message}`)],
    };
  }
}

function evaluateRuntimeRealization(probePayload, { expectedFields = runtimeContractFields } = {}) {
  const issues = [];
  const values = probePayload && typeof probePayload === 'object' ? probePayload.values : null;

  if (!values || typeof values !== 'object') {
    return [issue('ENV_PROBE_FAILED', 'Runtime probe payload missing values map.')];
  }

  for (const field of expectedFields) {
    if (!Object.prototype.hasOwnProperty.call(values, field)) {
      issues.push(issue('ENV_REALIZATION_MISMATCH', `Runtime probe missing expected contract field: ${field}`));
    }
  }

  issues.push(...validateRuntimeValues(values));
  return issues;
}

function evaluateEnvContract({ envExampleContent, runtimeProbeResult } = {}) {
  const envExample = envExampleContent ?? readFileSync('.env.example', 'utf8');
  const entries = parseEnvExample(envExample);
  const schemaIssues = validateSchemaContract(entries);

  if (schemaIssues.length > 0) {
    return {
      ok: false,
      phase: 'schema',
      issues: schemaIssues,
    };
  }

  const probe = runtimeProbeResult ?? captureRuntimeProbe();
  if (!probe.ok) {
    return {
      ok: false,
      phase: 'runtime',
      issues: probe.issues,
    };
  }

  const runtimeIssues = evaluateRuntimeRealization(probe.payload, {
    expectedFields: Array.from(runtimeProbeFieldSet),
  });

  if (runtimeIssues.length > 0) {
    return {
      ok: false,
      phase: 'runtime',
      issues: [
        issue(
          'ENV_SCHEMA_VALID_RUNTIME_INVALID',
          'Environment schema is valid but runtime realization violates contract.',
        ),
        ...runtimeIssues,
      ],
    };
  }

  return {
    ok: true,
    phase: 'pass',
    issues: [],
  };
}

function main() {
  const result = evaluateEnvContract();

  if (!result.ok) {
    console.error(`env-contract-check: FAIL (${result.issues.length} issue${result.issues.length === 1 ? '' : 's'})`);
    for (const item of result.issues) {
      console.error(`- [${item.code}] ${item.message}`);
    }
    process.exit(1);
  }

  console.log(`env-contract-check: PASS (${requiredKeys.length} required keys present)`);
}

const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  main();
}

export {
  captureRuntimeProbe,
  evaluateEnvContract,
  evaluateRuntimeRealization,
  isAbsolutePath,
  isSemver,
  parseEnvExample,
  parseInteger,
  requiredKeys,
  runtimeContractFields,
  validateRuntimeValues,
  validateSchemaContract,
};
