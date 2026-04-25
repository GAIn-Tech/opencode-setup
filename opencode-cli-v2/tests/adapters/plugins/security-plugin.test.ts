import { describe, expect, test } from 'bun:test';

import { PackageAdapter } from '../../../src/adapters/base';
import { SecurityPluginAdapter } from '../../../src/adapters/plugins/security-plugin';

const VALIDATE_INPUT_HOOK = 'security.validate-input';
const CHECK_POLICY_HOOK = 'security.check-policy';
const SANITIZE_HOOK = 'security.sanitize';
const AUDIT_HOOK = 'security.audit';

describe('SecurityPluginAdapter', () => {
  test('extends package adapter and supports lifecycle', async () => {
    const adapter = createAdapter();

    expect(adapter).toBeInstanceOf(PackageAdapter);

    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();
    const plugins = await port.listPlugins();

    expect(plugins[0]?.manifest.id).toBe('security-plugin');
    expect(plugins[0]?.manifest.hooks).toEqual([
      VALIDATE_INPUT_HOOK,
      CHECK_POLICY_HOOK,
      SANITIZE_HOOK,
      AUDIT_HOOK
    ]);

    const health = await adapter.runHealthCheck();
    expect(health.status).toBe('healthy');

    await adapter.runShutdown();
    expect(adapter.getStatus()).toBe('shutdown');
  });

  test('blocks dangerous SQL-injection input through validate hook', async () => {
    const adapter = createAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const [result] = await adapter.getPort().runHook({
      name: VALIDATE_INPUT_HOOK,
      payload: {
        input: "' OR 1=1; DROP TABLE users; --"
      }
    });

    expect(result?.handled).toBe(true);
    const output = result?.output as
      | {
          decision?: string;
          safe?: boolean;
          violations?: { category?: string }[];
        }
      | undefined;

    expect(output?.decision).toBe('block');
    expect(output?.safe).toBe(false);
    expect(output?.violations?.some((violation) => violation.category === 'sql_injection')).toBe(true);
  });

  test('applies policy overrides in check-policy hook', async () => {
    const adapter = createAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const [result] = await adapter.getPort().runHook({
      name: CHECK_POLICY_HOOK,
      payload: {
        content: 'user email is alice@example.com',
        policyOverrides: {
          strictMode: false
        }
      }
    });

    expect(result?.handled).toBe(true);
    const output = result?.output as
      | {
          decision?: string;
          safe?: boolean;
          violations?: { category?: string }[];
        }
      | undefined;

    expect(output?.decision).toBe('sanitize');
    expect(output?.safe).toBe(true);
    expect(output?.violations?.some((violation) => violation.category === 'pii')).toBe(true);
  });

  test('sanitizes XSS content and reports applied rules', async () => {
    const adapter = createAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const [result] = await adapter.getPort().runHook({
      name: SANITIZE_HOOK,
      payload: {
        content: '<script>alert(1)</script><a onclick="evil()" href="javascript:alert(1)">x</a>'
      }
    });

    expect(result?.handled).toBe(true);
    const output = result?.output as
      | {
          changed?: boolean;
          sanitizedContent?: string;
          appliedRules?: string[];
        }
      | undefined;

    expect(output?.changed).toBe(true);
    expect(output?.sanitizedContent).not.toContain('<script>');
    expect(output?.sanitizedContent).not.toContain('javascript:');
    expect(output?.appliedRules).toContain('strip-script-tags');
  });

  test('records audit events through audit hook', async () => {
    const adapter = createAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();
    const [first] = await port.runHook({
      name: AUDIT_HOOK,
      payload: {
        eventType: 'manual-check',
        decision: 'allow',
        details: { source: 'test' }
      }
    });
    const [second] = await port.runHook({
      name: AUDIT_HOOK,
      payload: {
        eventType: 'manual-check',
        decision: 'block',
        reason: 'detected payload'
      }
    });

    expect(first?.handled).toBe(true);
    expect(second?.handled).toBe(true);

    const firstOutput = first?.output as { totalEvents?: number } | undefined;
    const secondOutput = second?.output as { totalEvents?: number; entry?: { decision?: string } } | undefined;

    expect(firstOutput?.totalEvents).toBe(1);
    expect(secondOutput?.totalEvents).toBe(2);
    expect(secondOutput?.entry?.decision).toBe('block');
  });
});

function createAdapter() {
  return new SecurityPluginAdapter({
    loadConfig: async () => ({
      security: {
        maxInputLength: 10_000,
        blockSqlInjection: true,
        blockXss: true,
        blockCommandInjection: true,
        blockSecrets: true,
        blockPii: true,
        sanitizeHtml: true,
        strictMode: true,
        auditEnabled: true,
        customPatterns: []
      }
    })
  });
}
