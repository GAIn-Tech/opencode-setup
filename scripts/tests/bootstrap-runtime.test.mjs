import { describe, it, expect } from 'bun:test';
import { resolve } from 'path';
import { existsSync } from 'fs';

describe('bootstrap-runtime script', () => {
  it('script file exists', () => {
    const scriptPath = resolve(import.meta.dir, '..', 'bootstrap-runtime.mjs');
    expect(existsSync(scriptPath)).toBe(true);
  });

  it('exports getRuntime function', async () => {
    const mod = await import('../bootstrap-runtime.mjs');
    expect(typeof mod.getRuntime).toBe('function');
  });

  it('getRuntime returns an IntegrationLayer instance', async () => {
    const { getRuntime } = await import('../bootstrap-runtime.mjs');
    const runtime = getRuntime();
    expect(runtime).toBeDefined();
    expect(typeof runtime.resolveRuntimeContext).toBe('function');
  });
});
