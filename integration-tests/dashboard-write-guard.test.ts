import { afterEach, describe, expect, test } from 'bun:test';

import { POST as postConfig } from '../packages/opencode-dashboard/src/app/api/config/route';
import { POST as postModels } from '../packages/opencode-dashboard/src/app/api/models/route';
import { POST as postTransition } from '../packages/opencode-dashboard/src/app/api/models/transition/route';

const WRITE_TOKEN_ENV = 'OPENCODE_DASHBOARD_WRITE_TOKEN';
const ORIGINAL_TOKEN = process.env[WRITE_TOKEN_ENV];

function resetToken() {
  if (ORIGINAL_TOKEN === undefined) {
    delete process.env[WRITE_TOKEN_ENV];
    return;
  }
  process.env[WRITE_TOKEN_ENV] = ORIGINAL_TOKEN;
}

afterEach(() => {
  resetToken();
});

describe('Dashboard mutable API write guard', () => {
  test('POST /api/models is disabled when write token env var is missing', async () => {
    delete process.env[WRITE_TOKEN_ENV];

    const request = new Request('http://localhost/api/models', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ policies: {} })
    });

    const response = await postModels(request);
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error).toBe('Write routes are disabled');
  });

  test('POST /api/models rejects invalid token', async () => {
    process.env[WRITE_TOKEN_ENV] = 'expected-token';

    const request = new Request('http://localhost/api/models', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-opencode-write-token': 'wrong-token'
      },
      body: JSON.stringify({ policies: {} })
    });

    const response = await postModels(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe('Unauthorized');
  });

  test('POST /api/config rejects missing token when writes enabled', async () => {
    process.env[WRITE_TOKEN_ENV] = 'expected-token';

    const request = new Request('http://localhost/api/config', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ configKey: 'centralConfig', data: {} })
    });

    const response = await postConfig(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe('Unauthorized');
  });

  test('POST /api/config proceeds past auth with valid token', async () => {
    process.env[WRITE_TOKEN_ENV] = 'expected-token';

    const request = new Request('http://localhost/api/config', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-opencode-write-token': 'expected-token'
      },
      body: JSON.stringify({ configKey: null, data: null })
    });

    const response = await postConfig(request);
    expect(response.status).toBe(400);
  });

  test('POST /api/models/transition rejects invalid token', async () => {
    process.env[WRITE_TOKEN_ENV] = 'expected-token';

    const request = new Request('http://localhost/api/models/transition', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-opencode-write-token': 'wrong-token'
      },
      body: JSON.stringify({
        modelId: 'test-model',
        toState: 'approved'
      })
    });

    const response = await postTransition(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe('Unauthorized');
  });
});
