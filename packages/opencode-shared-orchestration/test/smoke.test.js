import { test, expect } from 'bun:test';
import * as mod from '../src/context-utils.js';

test('module can be imported', () => {
  expect(mod).toBeDefined();
});

test('main export is defined', () => {
  expect(mod.default || mod.createOrchestrationId).toBeDefined();
});
