const { describe, it, expect } = require('bun:test');
const { IntegrationLayer } = require('../src/index');

describe('IntegrationLayer crash-guard spawn wiring', () => {
  it('fails closed when crash-guard spawn APIs are unavailable', () => {
    const integration = new IntegrationLayer({});
    integration.crashGuard = null;

    expect(integration.commandExists('git')).toBe(false);
    expect(integration.safeSpawn('git', ['status'])).toBeNull();
  });

  it('delegates command checks and safe spawns to crash-guard', () => {
    const calls = [];
    const integration = new IntegrationLayer({});
    integration.crashGuard = {
      commandExists(cmd) {
        calls.push(['commandExists', cmd]);
        return cmd === 'git';
      },
      safeSpawn(cmd, args, options) {
        calls.push(['safeSpawn', cmd, args, options]);
        return { ok: true, cmd, args, options };
      },
    };

    expect(integration.commandExists('git')).toBe(true);
    expect(integration.commandExists('missing-binary')).toBe(false);

    const spawnResult = integration.safeSpawn('git', ['status'], { timeout: 1000 });
    expect(spawnResult).toEqual({
      ok: true,
      cmd: 'git',
      args: ['status'],
      options: { timeout: 1000 },
    });

    expect(calls).toEqual([
      ['commandExists', 'git'],
      ['commandExists', 'missing-binary'],
      ['safeSpawn', 'git', ['status'], { timeout: 1000 }],
    ]);
  });
});
