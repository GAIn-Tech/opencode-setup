import { describe, expect, test } from 'bun:test';

import {
  evaluateEnvContract,
  evaluateRuntimeRealization,
  runtimeContractFields,
} from '../env-contract-check.mjs';

const validEnvExample = `
ANTHROPIC_API_KEYS=
GOOGLE_API_KEYS=
OPENAI_API_KEYS=
GITHUB_TOKEN=
TAVILY_API_KEY=
SUPERMEMORY_API_KEY=
OPENCODE_BUN_PATH=
OPENCODE_REQUIRED_BUN_VERSION=1.3.10
OPENCODE_ROOT=
OPENCODE_CONFIG_HOME=
OPENCODE_DATA_HOME=
PLUGIN_SCOPE=
BUN_INSTALL=
RATE_LIMIT_COOLDOWN_MS=60000
RATE_LIMIT_MAX_FAILURES=3
QUOTA_WARNING_THRESHOLD=80
QUOTA_CRITICAL_THRESHOLD=95
`;

function makeProbePayload(overrides = {}) {
  const values = Object.fromEntries(runtimeContractFields.map((field) => [field, null]));
  return {
    platform: 'linux',
    nodeVersion: 'v20.0.0',
    cwd: '/workspace/opencode-setup',
    values: {
      ...values,
      ...overrides,
    },
  };
}

describe('env-contract-check runtime realization', () => {
  test('passes when schema is valid and runtime probe values satisfy contract', () => {
    const result = evaluateEnvContract({
      envExampleContent: validEnvExample,
      runtimeProbeResult: {
        ok: true,
        payload: makeProbePayload({
          OPENCODE_CONFIG_HOME: '/tmp/opencode-config',
          OPENCODE_DATA_HOME: '/tmp/opencode-data',
          TMPDIR: '/tmp/opencode-tmp',
          RATE_LIMIT_COOLDOWN_MS: '60000',
          RATE_LIMIT_MAX_FAILURES: '3',
          QUOTA_WARNING_THRESHOLD: '80',
          QUOTA_CRITICAL_THRESHOLD: '95',
          OPENCODE_REQUIRED_BUN_VERSION: '1.3.10',
        }),
      },
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  test('fails with ENV_SCHEMA_VALID_RUNTIME_INVALID on runtime realization mismatch', () => {
    const result = evaluateEnvContract({
      envExampleContent: validEnvExample,
      runtimeProbeResult: {
        ok: true,
        payload: makeProbePayload({
          OPENCODE_CONFIG_HOME: 'relative/path',
        }),
      },
    });

    expect(result.ok).toBe(false);
    expect(result.phase).toBe('runtime');
    expect(result.issues[0].code).toBe('ENV_SCHEMA_VALID_RUNTIME_INVALID');
    expect(result.issues.some((entry) => entry.code === 'ENV_REALIZATION_MISMATCH')).toBe(true);
  });

  test('fails with ENV_PROBE_FAILED when runtime probe invocation fails', () => {
    const result = evaluateEnvContract({
      envExampleContent: validEnvExample,
      runtimeProbeResult: {
        ok: false,
        issues: [{ code: 'ENV_PROBE_FAILED', message: 'probe exploded' }],
      },
    });

    expect(result.ok).toBe(false);
    expect(result.phase).toBe('runtime');
    expect(result.issues).toEqual([{ code: 'ENV_PROBE_FAILED', message: 'probe exploded' }]);
  });

  test('flags missing probe fields as ENV_REALIZATION_MISMATCH', () => {
    const payload = makeProbePayload();
    delete payload.values.OPENCODE_CONFIG_HOME;

    const issues = evaluateRuntimeRealization(payload);
    expect(issues.some((entry) => entry.code === 'ENV_REALIZATION_MISMATCH')).toBe(true);
    expect(issues.some((entry) => entry.message.includes('OPENCODE_CONFIG_HOME'))).toBe(true);
  });
});
