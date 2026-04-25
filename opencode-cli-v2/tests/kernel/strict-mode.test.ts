import { describe, expect, test } from 'bun:test';

import { MissingRequiredCapabilitiesError } from '../../src/kernel/errors';
import { CapabilityRegistry } from '../../src/kernel/registry';
import {
  enforceStrictMode,
  findMissingRequiredCapabilities,
  normalizeBootstrapOptions
} from '../../src/kernel/strict-mode';

describe('strict-mode helpers', () => {
  test('normalizes bootstrap options with strict mode default', () => {
    expect(normalizeBootstrapOptions()).toEqual({
      degradedMode: false,
      mode: 'strict'
    });
  });

  test('normalizes bootstrap options with degraded mode enabled', () => {
    expect(normalizeBootstrapOptions({ degradedMode: true })).toEqual({
      degradedMode: true,
      mode: 'degraded'
    });
  });

  test('rejects unknown bootstrap options', () => {
    expect(() =>
      normalizeBootstrapOptions({
        degradedMode: false,
        // @ts-expect-error runtime validation check
        unknown: true
      })
    ).toThrow();
  });

  test('finds missing required capabilities', () => {
    const registry = new CapabilityRegistry();

    const missing = findMissingRequiredCapabilities(registry, ['orchestration', 'routing']);

    expect(missing).toEqual(['budget', 'skills']);
  });

  test('enforces strict mode and throws when required capabilities are missing', () => {
    expect(() =>
      enforceStrictMode(['skills'], {
        degradedMode: false,
        mode: 'strict'
      })
    ).toThrow(MissingRequiredCapabilitiesError);
  });

  test('allows missing required capabilities in degraded mode', () => {
    expect(() =>
      enforceStrictMode(['skills'], {
        degradedMode: true,
        mode: 'degraded'
      })
    ).not.toThrow();
  });
});
