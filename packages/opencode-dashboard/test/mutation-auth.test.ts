import { test, expect, describe } from 'bun:test';
import { ROLE_MATRIX, requireWriteAccess } from '../src/app/api/_lib/write-access';

// --- ROLE_MATRIX permission tests ---

describe('ROLE_MATRIX includes mutation permissions', () => {
  test('admin has metrics:ingest permission', () => {
    expect(ROLE_MATRIX.admin).toContain('metrics:ingest');
  });

  test('admin has policy:simulate permission', () => {
    expect(ROLE_MATRIX.admin).toContain('policy:simulate');
  });

  test('operator has metrics:ingest permission', () => {
    expect(ROLE_MATRIX.operator).toContain('metrics:ingest');
  });

  test('operator has policy:simulate permission', () => {
    expect(ROLE_MATRIX.operator).toContain('policy:simulate');
  });

  test('viewer does NOT have metrics:ingest permission', () => {
    expect(ROLE_MATRIX.viewer).not.toContain('metrics:ingest');
  });

  test('viewer does NOT have policy:simulate permission', () => {
    expect(ROLE_MATRIX.viewer).not.toContain('policy:simulate');
  });

  test('admin has audit:read permission', () => {
    expect(ROLE_MATRIX.admin).toContain('audit:read');
  });

  test('viewer has audit:read permission', () => {
    expect(ROLE_MATRIX.viewer).toContain('audit:read');
  });
});

// --- Auth gate tests for mutation endpoints ---

describe('requireWriteAccess rejects unauthenticated requests for new permissions', () => {
  // When OPENCODE_DASHBOARD_WRITE_TOKEN is set but no token presented, should be 401
  const originalEnv = process.env.OPENCODE_DASHBOARD_WRITE_TOKEN;

  test('rejects unauthenticated metrics:ingest request', () => {
    process.env.OPENCODE_DASHBOARD_WRITE_TOKEN = 'test-secret-token';
    try {
      const request = new Request('http://localhost:3000/api/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = requireWriteAccess(request, 'metrics:ingest');
      expect(result).not.toBeNull();
      expect(result!.status).toBe(401);
    } finally {
      if (originalEnv !== undefined) {
        process.env.OPENCODE_DASHBOARD_WRITE_TOKEN = originalEnv;
      } else {
        delete process.env.OPENCODE_DASHBOARD_WRITE_TOKEN;
      }
    }
  });

  test('rejects unauthenticated policy:simulate request', () => {
    process.env.OPENCODE_DASHBOARD_WRITE_TOKEN = 'test-secret-token';
    try {
      const request = new Request('http://localhost:3000/api/orchestration/policy-sim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = requireWriteAccess(request, 'policy:simulate');
      expect(result).not.toBeNull();
      expect(result!.status).toBe(401);
    } finally {
      if (originalEnv !== undefined) {
        process.env.OPENCODE_DASHBOARD_WRITE_TOKEN = originalEnv;
      } else {
        delete process.env.OPENCODE_DASHBOARD_WRITE_TOKEN;
      }
    }
  });
});

// --- Route handler auth gate integration ---

describe('POST /api/monitoring requires write auth', () => {
  test('monitoring route exports POST function', async () => {
    const routeModule = await import('../src/app/api/monitoring/route');
    expect(typeof routeModule.POST).toBe('function');
  });
});

describe('POST /api/orchestration/policy-sim requires write auth', () => {
  test('policy-sim route exports POST function', async () => {
    const routeModule = await import('../src/app/api/orchestration/policy-sim/route');
    expect(typeof routeModule.POST).toBe('function');
  });
});
