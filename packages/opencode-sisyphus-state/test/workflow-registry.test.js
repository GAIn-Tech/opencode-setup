import { describe, test, expect, beforeEach } from 'bun:test';
import { WorkflowRegistry } from '../src/workflow-registry.js';
import path from 'path';

describe('Workflow Registry', () => {
  let registry;

  beforeEach(() => {
    registry = new WorkflowRegistry();
  });

  describe('register', () => {
    test('registers a workflow', () => {
      registry.register({ name: 'test', version: '1.0.0', steps: [{ id: 's1', type: 'read' }] });
      expect(registry.has('test')).toBe(true);
    });

    test('rejects workflow without name', () => {
      expect(() => registry.register({ version: '1.0.0', steps: [] })).toThrow('name and version');
    });

    test('registers multiple versions of same workflow', () => {
      registry.register({ name: 'test', version: '1.0.0', steps: [{ id: 's1', type: 'read' }] });
      registry.register({ name: 'test', version: '2.0.0', steps: [{ id: 's1', type: 'read' }] });
      expect(registry.getVersions('test')).toEqual(['1.0.0', '2.0.0']);
    });
  });

  describe('get', () => {
    test('returns latest version when no version specified', () => {
      registry.register({ name: 'test', version: '1.0.0', steps: [{ id: 's1', type: 'read' }] });
      registry.register({ name: 'test', version: '2.0.0', steps: [{ id: 's1', type: 'read' }] });

      const workflow = registry.get('test');
      expect(workflow.version).toBe('2.0.0');
    });

    test('returns specific version when specified', () => {
      registry.register({ name: 'test', version: '1.0.0', steps: [{ id: 's1', type: 'read' }] });
      registry.register({ name: 'test', version: '2.0.0', steps: [{ id: 's1', type: 'read' }] });

      const workflow = registry.get('test', '1.0.0');
      expect(workflow.version).toBe('1.0.0');
    });

    test('returns null for non-existent workflow', () => {
      expect(registry.get('nonexistent')).toBeNull();
    });

    test('returns null for non-existent version', () => {
      registry.register({ name: 'test', version: '1.0.0', steps: [{ id: 's1', type: 'read' }] });
      expect(registry.get('test', '9.9.9')).toBeNull();
    });
  });

  describe('list', () => {
    test('lists all registered workflows', () => {
      registry.register({ name: 'workflow-a', version: '1.0.0', steps: [{ id: 's1', type: 'read' }] });
      registry.register({ name: 'workflow-b', version: '1.0.0', steps: [{ id: 's1', type: 'read' }] });

      const list = registry.list();
      expect(list).toHaveLength(2);
      expect(list.map(w => w.name)).toContain('workflow-a');
      expect(list.map(w => w.name)).toContain('workflow-b');
    });
  });

  describe('loadDirectory', () => {
    test('loads workflows from directory', () => {
      const workflowsDir = path.join(__dirname, '..', 'src', 'workflows');
      const count = registry.loadDirectory(workflowsDir);

      expect(count).toBeGreaterThanOrEqual(2);
      expect(registry.has('outer-loop-pr-review')).toBe(true);
      expect(registry.has('outer-loop-vuln-fix')).toBe(true);
    });
  });

  describe('remove', () => {
    test('removes specific version', () => {
      registry.register({ name: 'test', version: '1.0.0', steps: [{ id: 's1', type: 'read' }] });
      registry.register({ name: 'test', version: '2.0.0', steps: [{ id: 's1', type: 'read' }] });

      expect(registry.remove('test', '1.0.0')).toBe(true);
      expect(registry.get('test', '1.0.0')).toBeNull();
      expect(registry.get('test', '2.0.0')).not.toBeNull();
    });

    test('removes all versions when no version specified', () => {
      registry.register({ name: 'test', version: '1.0.0', steps: [{ id: 's1', type: 'read' }] });
      registry.register({ name: 'test', version: '2.0.0', steps: [{ id: 's1', type: 'read' }] });

      expect(registry.remove('test')).toBe(true);
      expect(registry.has('test')).toBe(false);
    });

    test('returns false for non-existent workflow', () => {
      expect(registry.remove('nonexistent')).toBe(false);
    });
  });
});
