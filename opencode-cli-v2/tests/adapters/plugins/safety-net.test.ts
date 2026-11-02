import { describe, expect, test } from 'bun:test';

import { PackageAdapter } from '../../../src/adapters/base';
import { SafetyNetPluginAdapter } from '../../../src/adapters/plugins/safety-net';

describe('SafetyNetPluginAdapter', () => {
  test('extends package adapter and supports lifecycle', async () => {
    const adapter = new SafetyNetPluginAdapter();

    expect(adapter).toBeInstanceOf(PackageAdapter);

    await adapter.runLoad();
    await adapter.runInitialize();

    const plugins = await adapter.getPort().listPlugins();
    expect(plugins[0]?.manifest.id).toBe('safety-net');

    const health = await adapter.runHealthCheck();
    expect(health.status).toBe('healthy');

    await adapter.runShutdown();
    expect(adapter.getStatus()).toBe('shutdown');
  });

  test('classifies risk for dangerous and safe commands', async () => {
    const adapter = new SafetyNetPluginAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();

    const [critical] = await port.runHook({
      name: 'safety.check-risk',
      payload: {
        command: 'DROP TABLE users'
      }
    });

    const [safe] = await port.runHook({
      name: 'safety.check-risk',
      payload: {
        command: 'ls -la'
      }
    });

    expect(critical?.handled).toBe(true);
    expect(critical?.output).toMatchObject({ risk: 'critical', matchedBy: 'blocklist' });

    expect(safe?.handled).toBe(true);
    expect(safe?.output).toMatchObject({ risk: 'low' });
  });

  test('blocks critical commands during validation', async () => {
    const adapter = new SafetyNetPluginAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const [result] = await adapter.getPort().runHook({
      name: 'safety.validate-command',
      payload: {
        command: 'rm -rf /'
      }
    });

    expect(result?.handled).toBe(true);
    expect(result?.output).toMatchObject({
      risk: 'critical',
      decision: 'blocked',
      allowed: false,
      blocked: true,
      requiresConfirmation: false
    });
  });

  test('requires confirmation for high-risk commands and allows once confirmed', async () => {
    const adapter = new SafetyNetPluginAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();

    const [firstAttempt] = await port.runHook({
      name: 'safety.validate-command',
      payload: {
        command: 'git push --force origin main'
      }
    });

    expect(firstAttempt?.handled).toBe(true);
    expect(firstAttempt?.output).toMatchObject({
      risk: 'high',
      decision: 'confirmation_required',
      allowed: false,
      requiresConfirmation: true
    });

    const [confirmation] = await port.runHook({
      name: 'safety.confirm',
      payload: {
        command: 'git push --force origin main',
        risk: 'high',
        confirmed: true
      }
    });

    expect(confirmation?.handled).toBe(true);
    expect(confirmation?.output).toMatchObject({
      risk: 'high',
      decision: 'allowed',
      allowed: true,
      blocked: false
    });
  });

  test('supports automation bypass for high-risk commands but not critical commands', async () => {
    const adapter = new SafetyNetPluginAdapter();
    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();

    const [highRiskBypassed] = await port.runHook({
      name: 'safety.validate-command',
      payload: {
        command: 'terraform destroy -auto-approve',
        automation: true
      }
    });

    expect(highRiskBypassed?.handled).toBe(true);
    expect(highRiskBypassed?.output).toMatchObject({
      risk: 'high',
      decision: 'bypassed',
      allowed: true
    });

    const [criticalStillBlocked] = await port.runHook({
      name: 'safety.validate-command',
      payload: {
        command: 'DROP DATABASE prod',
        automation: true
      }
    });

    expect(criticalStillBlocked?.handled).toBe(true);
    expect(criticalStillBlocked?.output).toMatchObject({
      risk: 'critical',
      decision: 'blocked',
      allowed: false
    });
  });

  test('records audit entries for validate and explicit audit hooks', async () => {
    const adapter = new SafetyNetPluginAdapter({ maxAuditEntries: 10 });
    await adapter.runLoad();
    await adapter.runInitialize();

    const port = adapter.getPort();

    const [validated] = await port.runHook({
      name: 'safety.validate-command',
      payload: {
        command: 'ls -la'
      }
    });

    expect(validated?.handled).toBe(true);
    const validateOutput = validated?.output as { audit?: { command?: string; decision?: string } } | undefined;
    expect(validateOutput?.audit?.command).toBe('ls -la');
    expect(validateOutput?.audit?.decision).toBe('allowed');

    const [audited] = await port.runHook({
      name: 'safety.audit',
      payload: {
        command: 'git push --force origin main',
        risk: 'high',
        decision: 'blocked',
        reason: 'manual safety check failed'
      }
    });

    expect(audited?.handled).toBe(true);
    expect(audited?.output).toMatchObject({
      logged: true,
      totalEntries: 2,
      record: {
        command: 'git push --force origin main',
        decision: 'blocked',
        risk: 'high'
      }
    });

    const health = await port.getPluginHealth('safety-net');
    expect(health.details).toContain('auditEntries=2');
  });
});
