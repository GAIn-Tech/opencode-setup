import { describe, it, expect } from 'bun:test';
import { AgentSandbox } from '../src/agent-sandbox.js';

describe('AgentSandbox resilience', () => {
  it('denies and logs when manifest matching throws', () => {
    const sandbox = new AgentSandbox();
    sandbox._matchesManifest = () => {
      throw new Error('manifest matcher exploded');
    };

    const result = sandbox.checkCapability('builder', 'Read', 'agent-b1');

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Error while checking capability');

    const denied = sandbox.getDeniedLog();
    expect(denied).toHaveLength(1);
    expect(denied[0].agentId).toBe('agent-b1');
    expect(denied[0].agentRole).toBe('builder');
    expect(denied[0].toolName).toBe('Read');
    expect(denied[0].reason).toContain('manifest matcher exploded');
  });

  it('denies and logs when RBAC check throws', () => {
    const sandbox = new AgentSandbox({ manifests: { custom: ['Read'] } });
    sandbox.rbac.checkPermission = () => {
      throw new Error('rbac unavailable');
    };

    const result = sandbox.checkCapability('custom', 'Write', 'agent-c1');

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('RBAC failure during capability check');

    const denied = sandbox.getDeniedLog();
    expect(denied).toHaveLength(1);
    expect(denied[0].agentId).toBe('agent-c1');
    expect(denied[0].agentRole).toBe('custom');
    expect(denied[0].toolName).toBe('Write');
    expect(denied[0].reason).toContain('rbac unavailable');
  });

  it('survives invalid custom manifests and records registration error', () => {
    const sandbox = new AgentSandbox({ manifests: { broken: null } });

    const denied = sandbox.getDeniedLog();
    expect(denied).toHaveLength(1);
    expect(denied[0].agentRole).toBe('broken');
    expect(denied[0].toolName).toBe('[manifest-registration]');
    expect(denied[0].reason).toContain('Invalid manifest capabilities');

    const result = sandbox.checkCapability('builder', 'Read', 'agent-b2');
    expect(result.allowed).toBe(true);
  });
});
