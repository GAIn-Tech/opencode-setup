import { afterEach, describe, expect, test } from 'bun:test';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { POST as postOrchestration } from '../packages/opencode-dashboard/src/app/api/orchestration/route';

const originalRename = fsPromises.rename;
const originalUserProfile = process.env.USERPROFILE;
const originalHome = process.env.HOME;
const WRITE_TOKEN_ENV = 'OPENCODE_DASHBOARD_WRITE_TOKEN';
const ORIGINAL_TOKEN = process.env[WRITE_TOKEN_ENV];
const TEST_TOKEN = 'test-atomic-write-token';

function createTempPaths() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orchestration-atomic-write-'));
  const opencodeDir = path.join(dir, '.opencode');
  return {
    dir,
    opencodeDir,
    filePath: path.join(opencodeDir, 'orchestration-events.json')
  };
}

function listTmpFiles(dir) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs.readdirSync(dir).filter((entry) => entry.includes('.tmp.'));
}

afterEach(() => {
  fsPromises.rename = originalRename;
  if (originalUserProfile === undefined) {
    delete process.env.USERPROFILE;
  } else {
    process.env.USERPROFILE = originalUserProfile;
  }

  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }

  if (ORIGINAL_TOKEN === undefined) {
    delete process.env[WRITE_TOKEN_ENV];
  } else {
    process.env[WRITE_TOKEN_ENV] = ORIGINAL_TOKEN;
  }
});

describe('orchestration atomic write', () => {
  test('writes complete event store atomically', async () => {
    const { dir, opencodeDir, filePath } = createTempPaths();
    process.env.USERPROFILE = dir;
    process.env.HOME = dir;
    process.env[WRITE_TOKEN_ENV] = TEST_TOKEN;

    const request = new Request('http://localhost/api/orchestration', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-opencode-write-token': TEST_TOKEN },
      body: JSON.stringify({ events: [{ model: 'test-model', total_tokens: 5 }] })
    });

    const response = await postOrchestration(request);
    expect(response.status).toBe(200);

    const stored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(Array.isArray(stored.events)).toBe(true);
    expect(stored.events).toHaveLength(1);
    expect(listTmpFiles(opencodeDir)).toHaveLength(0);
  });

  test('cleans tmp file when interrupted before rename', async () => {
    const { dir, opencodeDir, filePath } = createTempPaths();
    process.env.USERPROFILE = dir;
    process.env.HOME = dir;
    process.env[WRITE_TOKEN_ENV] = TEST_TOKEN;

    fsPromises.rename = () => {
      return Promise.reject(new Error('simulated rename interruption'));
    };

    const request = new Request('http://localhost/api/orchestration', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-opencode-write-token': TEST_TOKEN },
      body: JSON.stringify({ events: [{ model: 'test-model', total_tokens: 9 }] })
    });

    const response = await postOrchestration(request);
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toContain('simulated rename interruption');

    expect(fs.existsSync(filePath)).toBe(false);
    expect(listTmpFiles(opencodeDir)).toHaveLength(0);
  });
});
