import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..');
const HASH_FILE = path.join(ROOT, 'opencode-config', '.governance-hashes.json');
const TARGET_FILE = 'opencode-config/learning-update-policy.json';

let originalHashes = null;
let hadHashFile = false;

if (fs.existsSync(HASH_FILE)) {
  hadHashFile = true;
  originalHashes = fs.readFileSync(HASH_FILE, 'utf8');
}

afterEach(() => {
  if (hadHashFile && originalHashes !== null) {
    fs.writeFileSync(HASH_FILE, originalHashes);
    return;
  }

  if (fs.existsSync(HASH_FILE)) {
    fs.unlinkSync(HASH_FILE);
  }
});

function runLearningGate(args) {
  const proc = Bun.spawnSync(['node', 'scripts/learning-gate.mjs', ...args], {
    cwd: ROOT,
    stdout: 'pipe',
    stderr: 'pipe'
  });

  return {
    exitCode: proc.exitCode,
    stdout: new TextDecoder().decode(proc.stdout),
    stderr: new TextDecoder().decode(proc.stderr)
  };
}

describe('learning-gate hash governance', () => {
  test('generates governance hashes with --generate-hashes', () => {
    if (fs.existsSync(HASH_FILE)) {
      fs.unlinkSync(HASH_FILE);
    }

    const result = runLearningGate(['--generate-hashes', '--base', 'HEAD']);

    expect(result.exitCode).toBe(0);
    expect(fs.existsSync(HASH_FILE)).toBe(true);

    const payload = JSON.parse(fs.readFileSync(HASH_FILE, 'utf8'));
    expect(payload.algorithm).toBe('SHA-256');
    expect(typeof payload.files[TARGET_FILE]).toBe('string');
  });

  test('fails when --verify-hashes is used and hash does not match', () => {
    const fake = {
      version: 1,
      algorithm: 'SHA-256',
      generated_at: new Date().toISOString(),
      files: {
        [TARGET_FILE]: '0'.repeat(64)
      }
    };
    fs.writeFileSync(HASH_FILE, JSON.stringify(fake, null, 2));

    const result = runLearningGate(['--verify-hashes', '--base', 'HEAD']);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toLowerCase()).toContain('hash');
    expect(result.stderr.toLowerCase()).toContain('mismatch');
  });
});
