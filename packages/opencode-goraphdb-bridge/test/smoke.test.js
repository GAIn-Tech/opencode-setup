import { test, expect } from 'bun:test';
import * as mod from '../src/index.js';

test('module can be imported', () => {
  expect(mod).toBeDefined();
});

test('main export is defined', () => {
  expect(mod.default || mod.GraphDBBridge).toBeDefined();
});
