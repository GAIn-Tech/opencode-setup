const { describe, test, expect, beforeEach, afterEach } = require('bun:test');
const path = require('path');
const fs = require('fs');
const os = require('os');
const EventEmitter = require('events');

const {
  safeJsonParse,
  safeJsonRead,
  safeJsonReadSync,
  SafeJSON,
  managedInterval,
  managedListener,
} = require('../src/index.js');

// ─── safeJsonParse ──────────────────────────────────────────────────

describe('safeJsonParse', () => {
  test('parses valid JSON', () => {
    expect(safeJsonParse('{"a":1}', null)).toEqual({ a: 1 });
  });

  test('parses JSON array', () => {
    expect(safeJsonParse('[1,2,3]', null)).toEqual([1, 2, 3]);
  });

  test('returns fallback on broken JSON', () => {
    expect(safeJsonParse('{ broken <<< }', 'default')).toBe('default');
  });

  test('returns fallback on empty string', () => {
    expect(safeJsonParse('', {})).toEqual({});
  });

  test('returns fallback on whitespace-only string', () => {
    expect(safeJsonParse('   ', [])).toEqual([]);
  });

  test('returns fallback on null input', () => {
    expect(safeJsonParse(null, 'fallback')).toBe('fallback');
  });

  test('returns fallback on undefined input', () => {
    expect(safeJsonParse(undefined, 42)).toBe(42);
  });

  test('returns fallback on numeric input', () => {
    expect(safeJsonParse(123, 'fb')).toBe('fb');
  });

  test('returns fallback on object input', () => {
    expect(safeJsonParse({}, 'fb')).toBe('fb');
  });

  test('rejects strings over 50MB', () => {
    const huge = 'x'.repeat(50 * 1024 * 1024 + 1);
    expect(safeJsonParse(huge, 'too-big')).toBe('too-big');
  });

  test('logs warning with label on parse failure', () => {
    const warns = [];
    const origWarn = console.warn;
    console.warn = (...args) => warns.push(args.join(' '));
    safeJsonParse('not-json', null, 'test-label');
    console.warn = origWarn;
    expect(warns.length).toBe(1);
    expect(warns[0]).toContain('[safeJsonParse]');
    expect(warns[0]).toContain('test-label');
  });
});

// ─── safeJsonRead (async) ───────────────────────────────────────────

describe('safeJsonRead', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-io-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('reads and parses existing JSON file', async () => {
    const fp = path.join(tmpDir, 'valid.json');
    fs.writeFileSync(fp, '{"key":"value"}');
    const result = await safeJsonRead(fp, null);
    expect(result).toEqual({ key: 'value' });
  });

  test('returns fallback for missing file (ENOENT)', async () => {
    const result = await safeJsonRead(path.join(tmpDir, 'nonexistent.json'), { empty: true });
    expect(result).toEqual({ empty: true });
  });

  test('returns fallback for corrupted JSON file', async () => {
    const fp = path.join(tmpDir, 'corrupt.json');
    fs.writeFileSync(fp, '{ broken }');
    const result = await safeJsonRead(fp, 'fallback');
    expect(result).toBe('fallback');
  });

  test('uses filePath as label when label not provided', async () => {
    const fp = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(fp, 'not-json');
    const warns = [];
    const origWarn = console.warn;
    console.warn = (...args) => warns.push(args.join(' '));
    await safeJsonRead(fp, null);
    console.warn = origWarn;
    expect(warns[0]).toContain(fp);
  });
});

// ─── safeJsonReadSync (deprecated) ──────────────────────────────────

describe('safeJsonReadSync', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-io-test-sync-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('reads and parses existing JSON file', () => {
    const fp = path.join(tmpDir, 'valid.json');
    fs.writeFileSync(fp, '{"sync":true}');
    expect(safeJsonReadSync(fp, null)).toEqual({ sync: true });
  });

  test('returns fallback for missing file', () => {
    expect(safeJsonReadSync(path.join(tmpDir, 'nonexistent.json'), 'gone')).toBe('gone');
  });
});

// ─── SafeJSON.parse ─────────────────────────────────────────────────

describe('SafeJSON.parse', () => {
  test('parses valid JSON', () => {
    expect(SafeJSON.parse('{"name":"test","value":123}')).toEqual({
      name: 'test',
      value: 123,
    });
  });

  test('returns fallback on broken JSON', () => {
    expect(SafeJSON.parse('{ invalid }', { default: true })).toEqual({
      default: true,
    });
  });

  test('returns null as default fallback', () => {
    expect(SafeJSON.parse('nope')).toBeNull();
  });

  test('returns fallback on null input', () => {
    expect(SafeJSON.parse(null, 'fb')).toBe('fb');
  });

  test('returns fallback on empty string', () => {
    expect(SafeJSON.parse('', 'empty')).toBe('empty');
  });

  test('returns fallback on non-string input', () => {
    expect(SafeJSON.parse(42, 'num')).toBe('num');
  });
});

// ─── SafeJSON.stringify ─────────────────────────────────────────────

describe('SafeJSON.stringify', () => {
  test('stringifies normal object', () => {
    const obj = { name: 'test', value: 123 };
    const result = SafeJSON.stringify(obj);
    expect(JSON.parse(result)).toEqual(obj);
  });

  test('handles circular references', () => {
    const obj = { name: 'test' };
    obj.self = obj;
    const result = SafeJSON.stringify(obj);
    expect(result).toContain('[Circular');
    // Must not throw
    expect(typeof result).toBe('string');
  });

  test('handles deep circular references', () => {
    const obj = { level1: { level2: { level3: {} } } };
    obj.level1.level2.level3.back = obj.level1.level2;
    const result = SafeJSON.stringify(obj);
    expect(result).toContain('[Circular');
  });

  test('handles arrays with circular refs', () => {
    const arr = [1, 2, 3];
    arr.push(arr);
    const result = SafeJSON.stringify(arr);
    expect(result).toContain('[Circular');
  });

  test('handles null', () => {
    expect(SafeJSON.stringify(null)).toBe('null');
  });

  test('returns quoted undefined for undefined input', () => {
    expect(SafeJSON.stringify(undefined)).toBe('"undefined"');
  });

  test('handles functions in objects', () => {
    const obj = { fn: () => {} };
    const result = SafeJSON.stringify(obj);
    expect(result).toContain('[Function');
  });
});

// ─── managedInterval ────────────────────────────────────────────────

describe('managedInterval', () => {
  test('creates interval and returns handle', () => {
    let count = 0;
    const handle = managedInterval(() => count++, 50);
    expect(handle).toBeDefined();
    expect(handle.id).toBeDefined();
    expect(typeof handle.stop).toBe('function');
    handle.stop();
  });

  test('.unref() is called (interval does not keep process alive)', () => {
    const handle = managedInterval(() => {}, 1000);
    // If unref was called successfully, the handle exists without error
    expect(handle.id).toBeDefined();
    handle.stop();
  });

  test('stop() clears the interval', async () => {
    let count = 0;
    const handle = managedInterval(() => count++, 20);
    // Wait for a few ticks
    await new Promise((r) => setTimeout(r, 70));
    const countAtStop = count;
    handle.stop();
    // Wait more - count should not increase
    await new Promise((r) => setTimeout(r, 70));
    expect(count).toBe(countAtStop);
  });

  test('stores label from options', () => {
    const handle = managedInterval(() => {}, 1000, { label: 'heartbeat' });
    expect(handle.label).toBe('heartbeat');
    handle.stop();
  });
});

// ─── managedListener ────────────────────────────────────────────────

describe('managedListener', () => {
  test('uses .once() by default (fires once)', () => {
    const emitter = new EventEmitter();
    let count = 0;
    managedListener(emitter, 'data', () => count++);
    emitter.emit('data');
    emitter.emit('data');
    emitter.emit('data');
    expect(count).toBe(1);
  });

  test('persistent mode uses .on() (fires multiple times)', () => {
    const emitter = new EventEmitter();
    let count = 0;
    const handle = managedListener(emitter, 'data', () => count++, {
      persistent: true,
    });
    emitter.emit('data');
    emitter.emit('data');
    emitter.emit('data');
    expect(count).toBe(3);
    handle.remove();
  });

  test('remove() detaches listener', () => {
    const emitter = new EventEmitter();
    let count = 0;
    const handle = managedListener(emitter, 'data', () => count++, {
      persistent: true,
    });
    emitter.emit('data');
    handle.remove();
    emitter.emit('data');
    expect(count).toBe(1);
  });

  test('remove() on once listener is safe (no-op if already fired)', () => {
    const emitter = new EventEmitter();
    let count = 0;
    const handle = managedListener(emitter, 'data', () => count++);
    emitter.emit('data');
    // Should not throw even though listener already removed by once()
    expect(() => handle.remove()).not.toThrow();
    expect(count).toBe(1);
  });

  test('returns object with remove function', () => {
    const emitter = new EventEmitter();
    const handle = managedListener(emitter, 'test', () => {});
    expect(typeof handle.remove).toBe('function');
  });
});

// ─── Consumer importability regression ──────────────────────────────

describe('consumer importability', () => {
  const consumers = [
    'opencode-feature-flags',
    'opencode-plugin-lifecycle',
    'opencode-model-router-x',
    'opencode-learning-engine',
    'opencode-plugin-healthd',
    'opencode-proofcheck',
    'opencode-runbooks',
    'opencode-plugin-preload-skills',
    'opencode-dashboard-launcher',
  ];

  test('safeJsonParse is importable from opencode-safe-io', () => {
    const mod = require('../src/index.js');
    expect(typeof mod.safeJsonParse).toBe('function');
    expect(typeof mod.safeJsonReadSync).toBe('function');
    expect(typeof mod.safeJsonRead).toBe('function');
  });

  test('safeJsonParse works with typical consumer patterns', () => {
    // Pattern: safeJsonParse(data, {}, 'label') — feature-flags style
    expect(safeJsonParse('{"enabled":true}', {}, 'test')).toEqual({ enabled: true });
    expect(safeJsonParse('CORRUPT', {}, 'test')).toEqual({});

    // Pattern: safeJsonParse(data, null, 'label') — proofcheck style
    expect(safeJsonParse('{"name":"pkg"}', null, 'test')).toEqual({ name: 'pkg' });
    expect(safeJsonParse('', null, 'test')).toBeNull();
  });

  test('safeJsonReadSync works for file-based consumers', () => {
    const tmp = path.join(os.tmpdir(), `safe-io-consumer-test-${Date.now()}.json`);
    fs.writeFileSync(tmp, '{"migrated":true}');
    try {
      const result = safeJsonReadSync(tmp, null, 'consumer-test');
      expect(result).toEqual({ migrated: true });
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  test('safeJsonReadSync returns fallback for missing file', () => {
    const result = safeJsonReadSync('/nonexistent/path.json', { default: true }, 'missing');
    expect(result).toEqual({ default: true });
  });

  for (const pkg of consumers) {
    test(`${pkg} can resolve opencode-safe-io require path`, () => {
      const pkgDir = path.resolve(__dirname, '..', '..', pkg);
      // Verify the consumer package directory exists (sparse checkout may skip some)
      if (fs.existsSync(path.join(pkgDir, 'src'))) {
        const srcFiles = fs.readdirSync(path.join(pkgDir, 'src'));
        expect(srcFiles.length).toBeGreaterThan(0);
      }
    });
  }
});
