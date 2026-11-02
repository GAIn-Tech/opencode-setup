import { describe, test, expect } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dir, '..', '..');
const EXERCISE_HARNESS_PATH = path.join(ROOT, 'scripts', 'mcp-exercise-harness.mjs');
const SMOKE_HARNESS_PATH = path.join(ROOT, 'scripts', 'mcp-smoke-harness.mjs');

describe('MCP Attestation Contract (P02)', () => {
  test('exercise harness file exists', () => {
    expect(existsSync(EXERCISE_HARNESS_PATH)).toBe(true);
  });

  test('smoke harness file exists', () => {
    expect(existsSync(SMOKE_HARNESS_PATH)).toBe(true);
  });

  test('exercise harness has getRunBinding function', () => {
    const code = readFileSync(EXERCISE_HARNESS_PATH, 'utf8');
    expect(code).toContain('function getRunBinding()');
    expect(code).toContain('runId');
    expect(code).toContain('commitSha');
  });

  test('exercise harness writes runId to exercised entries', () => {
    const code = readFileSync(EXERCISE_HARNESS_PATH, 'utf8');
    expect(code).toMatch(/exercised\.push\(\{[\s\S]*?runId/);
    expect(code).toMatch(/exercised\.push\(\{[\s\S]*?commitSha/);
  });

  test('exercise harness outputs runId in payload', () => {
    const code = readFileSync(EXERCISE_HARNESS_PATH, 'utf8');
    expect(code).toContain('const payload = { generatedAt, exercised, skipped, runId, commitSha }');
  });

  test('smoke harness has sameRun attestation validation', () => {
    const code = readFileSync(SMOKE_HARNESS_PATH, 'utf8');
    expect(code).toContain('sameRunAttested');
    expect(code).toContain("latestExercise.runId");
    expect(code).toContain("latestExercise.commitSha");
  });

  test('smoke harness attestation includes runId and commitSha', () => {
    const code = readFileSync(SMOKE_HARNESS_PATH, 'utf8');
    expect(code).toMatch(/attestation:\s*\{[\s\S]*?runId/);
    expect(code).toMatch(/attestation:\s*\{[\s\S]*?commitSha/);
  });
});
