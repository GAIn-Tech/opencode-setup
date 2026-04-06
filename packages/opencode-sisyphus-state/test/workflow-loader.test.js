import { describe, test, expect } from 'bun:test';
import { WorkflowLoader } from '../src/workflow-loader.js';
import path from 'path';

describe('Workflow Loader', () => {
  const workflowsDir = path.join(__dirname, '..', 'src', 'workflows');

  describe('load', () => {
    test('loads a valid JSON workflow', () => {
      const loader = new WorkflowLoader();
      const workflow = loader.load(path.join(workflowsDir, 'outer-loop-pr-review.json'));

      expect(workflow.name).toBe('outer-loop-pr-review');
      expect(workflow.version).toBe('1.0.0');
      expect(workflow.steps).toHaveLength(4);
      expect(workflow.pe_roles).toContain('planner');
      expect(workflow.pe_roles).toContain('executor');
      expect(workflow.pe_roles).toContain('verifier');
    });

    test('loads a second valid JSON workflow', () => {
      const loader = new WorkflowLoader();
      const workflow = loader.load(path.join(workflowsDir, 'outer-loop-vuln-fix.json'));

      expect(workflow.name).toBe('outer-loop-vuln-fix');
      expect(workflow.version).toBe('1.0.0');
      expect(workflow.steps).toHaveLength(4);
    });

    test('applies policy defaults to steps', () => {
      const loader = new WorkflowLoader();
      const workflow = loader.load(path.join(workflowsDir, 'outer-loop-pr-review.json'));

      // Policy has max_retries: 2, backoff_ms: 2000
      expect(workflow.steps[0].retries).toBe(2);
      expect(workflow.steps[0].backoff_ms).toBe(2000);
    });

    test('throws for missing file', () => {
      const loader = new WorkflowLoader();
      expect(() => loader.load('/nonexistent/workflow.json')).toThrow('Workflow file not found');
    });

    test('throws for invalid JSON', () => {
      const loader = new WorkflowLoader();
      const tmpPath = path.join(__dirname, 'tmp-invalid.json');
      require('fs').writeFileSync(tmpPath, '{ invalid json }');
      expect(() => loader.load(tmpPath)).toThrow('Invalid JSON');
      require('fs').unlinkSync(tmpPath);
    });
  });

  describe('validate', () => {
    test('validates a correct workflow', () => {
      const loader = new WorkflowLoader();
      const result = loader.validate({
        name: 'test-workflow',
        version: '1.0.0',
        steps: [{ id: 's1', type: 'read' }]
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('rejects workflow without name', () => {
      const loader = new WorkflowLoader();
      const result = loader.validate({
        version: '1.0.0',
        steps: [{ id: 's1', type: 'read' }]
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('name'))).toBe(true);
    });

    test('rejects workflow without version', () => {
      const loader = new WorkflowLoader();
      const result = loader.validate({
        name: 'test',
        steps: [{ id: 's1', type: 'read' }]
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('version'))).toBe(true);
    });

    test('rejects workflow with invalid version format', () => {
      const loader = new WorkflowLoader();
      const result = loader.validate({
        name: 'test',
        version: '1.0',
        steps: [{ id: 's1', type: 'read' }]
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('version'))).toBe(true);
    });

    test('rejects workflow without steps', () => {
      const loader = new WorkflowLoader();
      const result = loader.validate({
        name: 'test',
        version: '1.0.0'
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('steps'))).toBe(true);
    });

    test('rejects step without id', () => {
      const loader = new WorkflowLoader();
      const result = loader.validate({
        name: 'test',
        version: '1.0.0',
        steps: [{ type: 'read' }]
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('id'))).toBe(true);
    });

    test('rejects step without type', () => {
      const loader = new WorkflowLoader();
      const result = loader.validate({
        name: 'test',
        version: '1.0.0',
        steps: [{ id: 's1' }]
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('type'))).toBe(true);
    });

    test('rejects invalid pe_role', () => {
      const loader = new WorkflowLoader();
      const result = loader.validate({
        name: 'test',
        version: '1.0.0',
        steps: [{ id: 's1', type: 'read', pe_role: 'invalid_role' }]
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('pe_role'))).toBe(true);
    });

    test('rejects parallel-for without foreach', () => {
      const loader = new WorkflowLoader();
      const result = loader.validate({
        name: 'test',
        version: '1.0.0',
        steps: [{ id: 's1', type: 'parallel-for' }]
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('foreach'))).toBe(true);
    });

    test('rejects negative retries', () => {
      const loader = new WorkflowLoader();
      const result = loader.validate({
        name: 'test',
        version: '1.0.0',
        steps: [{ id: 's1', type: 'read', retries: -1 }]
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('retries'))).toBe(true);
    });

    test('rejects invalid pe_roles array', () => {
      const loader = new WorkflowLoader();
      const result = loader.validate({
        name: 'test',
        version: '1.0.0',
        pe_roles: ['planner', 'invalid_role'],
        steps: [{ id: 's1', type: 'read' }]
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('pe_role'))).toBe(true);
    });

    test('rejects invalid policy values', () => {
      const loader = new WorkflowLoader();
      const result = loader.validate({
        name: 'test',
        version: '1.0.0',
        policy: { max_retries: -1 },
        steps: [{ id: 's1', type: 'read' }]
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('max_retries'))).toBe(true);
    });
  });

  describe('loadDirectory', () => {
    test('loads all workflows from directory', () => {
      const loader = new WorkflowLoader();
      const workflows = loader.loadDirectory(workflowsDir);

      expect(workflows.size).toBeGreaterThanOrEqual(2);
      expect(workflows.has('outer-loop-pr-review')).toBe(true);
      expect(workflows.has('outer-loop-vuln-fix')).toBe(true);
    });

    test('skips non-workflow files', () => {
      const loader = new WorkflowLoader();
      const workflows = loader.loadDirectory(path.join(__dirname, '..'));

      // Should not crash even if directory has non-workflow files
      expect(workflows).toBeInstanceOf(Map);
    });
  });
});
