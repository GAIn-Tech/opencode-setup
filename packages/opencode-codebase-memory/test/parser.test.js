import { test, expect, describe } from 'bun:test';
import { parseFile } from '../src/parser.js';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const TMP = join(tmpdir(), 'test-parse.ts');

describe('parseFile', () => {
  test('extracts function declarations', () => {
    writeFileSync(TMP, `
      export function validateToken(token: string): boolean {
        return token.length > 0;
      }
    `);
    const { nodes } = parseFile(TMP);
    const fn = nodes.find(n => n.name === 'validateToken');
    expect(fn).toBeDefined();
    expect(fn.kind).toBe('function');
    expect(fn.signature).toContain('validateToken');
    unlinkSync(TMP);
  });

  test('extracts class and method declarations', () => {
    writeFileSync(TMP, `
      class AuthService {
        login(user: string) { return true; }
      }
    `);
    const { nodes } = parseFile(TMP);
    const cls = nodes.find(n => n.kind === 'class');
    const method = nodes.find(n => n.name === 'login');
    expect(cls).toBeDefined();
    expect(cls.name).toBe('AuthService');
    expect(method).toBeDefined();
    expect(method.kind).toBe('method');
    unlinkSync(TMP);
  });

  test('extracts call expressions as edges', () => {
    writeFileSync(TMP, `
      function foo() { bar(); baz(); }
      function bar() {}
      function baz() {}
    `);
    const { edges } = parseFile(TMP);
    const kinds = edges.map(e => e.kind);
    expect(kinds).toContain('calls');
    const targets = edges.map(e => e.to_name);
    expect(targets).toContain('bar');
    expect(targets).toContain('baz');
    unlinkSync(TMP);
  });

  test('extracts import edges', () => {
    writeFileSync(TMP, `import { foo } from './foo.js';`);
    const { edges } = parseFile(TMP);
    const imp = edges.find(e => e.kind === 'imports');
    expect(imp).toBeDefined();
    unlinkSync(TMP);
  });

  test('returns empty for unparseable file gracefully', () => {
    writeFileSync(TMP, '<<< NOT VALID >>>');
    const result = parseFile(TMP);
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    unlinkSync(TMP);
  });
});
