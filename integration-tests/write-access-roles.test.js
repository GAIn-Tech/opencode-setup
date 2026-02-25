import { afterEach, describe, expect, test } from 'bun:test';

import { POST as postConfig } from '../packages/opencode-dashboard/src/app/api/config/route';
import { POST as postModels } from '../packages/opencode-dashboard/src/app/api/models/route';
import { POST as postTransition } from '../packages/opencode-dashboard/src/app/api/models/transition/route';
import { ROLE_MATRIX, verifyRole } from '../packages/opencode-dashboard/src/app/api/_lib/write-access';

const WRITE_TOKEN_ENV = 'OPENCODE_DASHBOARD_WRITE_TOKEN';
const ORIGINAL_TOKEN = process.env[WRITE_TOKEN_ENV];

function resetToken() {
  if (ORIGINAL_TOKEN === undefined) {
    delete process.env[WRITE_TOKEN_ENV];
    return;
  }
  process.env[WRITE_TOKEN_ENV] = ORIGINAL_TOKEN;
}

function createRoleToken(secret, payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${secret}`;
}

afterEach(() => {
  resetToken();
});

describe('dashboard write access RBAC', () => {
  test('admin can perform all configured operations', () => {
    process.env[WRITE_TOKEN_ENV] = 'shared-secret';
    const adminToken = createRoleToken(process.env[WRITE_TOKEN_ENV], {
      sub: 'admin-user',
      role: 'admin',
      exp: Math.floor(Date.now() / 1000) + 3600
    });

    for (const permission of ROLE_MATRIX.admin) {
      expect(verifyRole(adminToken, permission)).toBe(true);
    }
  });

  test('operator cannot perform rollback operations', () => {
    process.env[WRITE_TOKEN_ENV] = 'shared-secret';
    const operatorToken = createRoleToken(process.env[WRITE_TOKEN_ENV], {
      sub: 'operator-user',
      role: 'operator',
      exp: Math.floor(Date.now() / 1000) + 3600
    });

    expect(verifyRole(operatorToken, 'models:rollback')).toBe(false);
  });

  test('viewer cannot call write routes', async () => {
    process.env[WRITE_TOKEN_ENV] = 'shared-secret';
    const viewerToken = createRoleToken(process.env[WRITE_TOKEN_ENV], {
      sub: 'viewer-user',
      role: 'viewer',
      exp: Math.floor(Date.now() / 1000) + 3600
    });

    const configRequest = new Request('http://localhost/api/config', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-opencode-write-token': viewerToken
      },
      body: JSON.stringify({ configKey: 'centralConfig', data: {} })
    });

    const modelsRequest = new Request('http://localhost/api/models', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-opencode-write-token': viewerToken
      },
      body: JSON.stringify({ policies: {} })
    });

    const transitionRequest = new Request('http://localhost/api/models/transition', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-opencode-write-token': viewerToken
      },
      body: JSON.stringify({ modelId: 'test-model', toState: 'approved' })
    });

    const configResponse = await postConfig(configRequest);
    const modelsResponse = await postModels(modelsRequest);
    const transitionResponse = await postTransition(transitionRequest);

    expect(configResponse.status).toBe(403);
    expect(modelsResponse.status).toBe(403);
    expect(transitionResponse.status).toBe(403);

    const configPayload = await configResponse.json();
    expect(configPayload.error).toBe('Forbidden');
  });

  test('legacy tokens without role are backward compatible as operator', async () => {
    process.env[WRITE_TOKEN_ENV] = 'legacy-token';

    expect(verifyRole('legacy-token', 'models:transition')).toBe(true);
    expect(verifyRole('legacy-token', 'models:rollback')).toBe(false);

    const request = new Request('http://localhost/api/config', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-opencode-write-token': 'legacy-token'
      },
      body: JSON.stringify({ configKey: null, data: null })
    });

    const response = await postConfig(request);
    expect(response.status).toBe(400);
  });
});
