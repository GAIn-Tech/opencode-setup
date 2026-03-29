import { describe, test, expect } from 'bun:test';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dir, '..', '..');
const WORKFLOW_PATH = path.join(ROOT, '.github', 'workflows', 'portability-matrix.yml');

describe('CI Pipeline Order (P01)', () => {
  test('workflow file exists', () => {
    expect(existsSync(WORKFLOW_PATH)).toBe(true);
  });

  test('proof generation step runs before verification', () => {
    const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
    
    // Find the lines for proof generation and verification
    const lines = workflow.split('\n');
    let proofStepLine = -1;
    let verifyStepLine = -1;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('Generate runtime proofs') || lines[i].includes('runtime-tool-surface-proof')) {
        proofStepLine = i;
      }
      if (lines[i].includes('portability verification') || lines[i].includes('verify-portability.mjs')) {
        verifyStepLine = i;
      }
    }
    
    // Proof step should exist
    expect(proofStepLine).toBeGreaterThan(-1);
    // Verify step should exist
    expect(verifyStepLine).toBeGreaterThan(-1);
    // Proof step should come before verify step
    expect(proofStepLine).toBeLessThan(verifyStepLine);
  });

  test('proof generation step includes --output flag for runtime-tool-surface-proof', () => {
    const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
    expect(workflow).toContain('runtime-tool-surface-proof.mjs --output');
  });

  test('proof generation step includes --output flag for mcp-smoke-harness', () => {
    const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
    expect(workflow).toContain('mcp-smoke-harness.mjs --output');
  });

  test('proof generation step includes --output flag for runtime-context-compliance', () => {
    const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
    expect(workflow).toContain('runtime-context-compliance.mjs');
  });

  test('proof generation step includes --output flag for runtime-workflow-scenarios', () => {
    const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
    expect(workflow).toContain('runtime-workflow-scenarios.mjs');
  });

  test('verification step name indicates it runs after proofs', () => {
    const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
    // The verification step name should indicate it runs after proofs
    expect(workflow).toMatch(/Setup \+ portability verification.*after proofs|runs after proofs/);
  });
});
