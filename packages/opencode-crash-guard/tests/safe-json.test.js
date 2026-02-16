import { describe, test, expect } from 'bun:test';
import { SafeJSON } from '../src/safe-json.js';

describe('SafeJSON', () => {
  test('should stringify normal objects', () => {
    const obj = { name: 'test', value: 123 };
    const result = SafeJSON.stringify(obj);
    expect(result).toBe(JSON.stringify(obj));
  });

  test('should handle circular references', () => {
    const obj = { name: 'test' };
    obj.self = obj;
    
    const result = SafeJSON.stringify(obj);
    expect(result).toContain('[Circular]');
    expect(() => JSON.stringify(obj)).toThrow();
  });

  test('should handle deep circular references', () => {
    const obj = { level1: { level2: { level3: {} } } };
    obj.level1.level2.level3.back = obj.level1.level2;
    
    const result = SafeJSON.stringify(obj);
    expect(result).toContain('[Circular]');
  });

  test('should handle arrays with circular refs', () => {
    const arr = [1, 2, 3];
    arr.push(arr);
    
    const result = SafeJSON.stringify(arr);
    expect(result).toContain('[Circular]');
  });

  test('should parse valid JSON', () => {
    const json = '{"name":"test","value":123}';
    const result = SafeJSON.parse(json);
    expect(result).toEqual({ name: 'test', value: 123 });
  });

  test('should return fallback on invalid JSON', () => {
    const json = '{ invalid json }';
    const fallback = { default: true };
    const result = SafeJSON.parse(json, fallback);
    expect(result).toEqual(fallback);
  });

  test('should handle stack overflow prevention', () => {
    // Create deeply nested object
    let obj = {};
    for (let i = 0; i < 100; i++) {
      obj = { nested: obj };
    }
    
    // Should not stack overflow
    const result = SafeJSON.stringify(obj);
    expect(result).toBeDefined();
  });
});
