import { beforeAll, describe, expect, it } from 'bun:test';

const TOKEN = 'test-write-token';

function createRequest(url: string, options?: RequestInit) {
  return new Request(url, options);
}

beforeAll(() => {
  process.env.OPENCODE_DASHBOARD_WRITE_TOKEN = TOKEN;
});

describe('monitoring route observability integration', () => {
  it('ingests compression events and exposes them via monitoring snapshot', async () => {
    const route = await import('../src/app/api/monitoring/route');

    const postRequest = createRequest('http://localhost:3000/api/monitoring', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-opencode-write-token': TOKEN,
      },
      body: JSON.stringify({
        type: 'compression',
        data: {
          sessionId: 'ses_monitoring_compression',
          tokensBefore: 4000,
          tokensAfter: 1000,
          pipeline: 'compress',
          durationMs: 20,
        },
      }),
    });

    const postResponse = await route.POST(postRequest);
    expect(postResponse.status).toBe(200);

    const getResponse = await route.GET(createRequest('http://localhost:3000/api/monitoring'));
    const payload = await getResponse.json();
    expect(payload.compression.totalEvents).toBeGreaterThan(0);
    expect(payload.compression.totalTokensSaved).toBeGreaterThan(0);
  });

  it('ingests Context7 events and exposes them via monitoring snapshot', async () => {
    const route = await import('../src/app/api/monitoring/route');

    const postRequest = createRequest('http://localhost:3000/api/monitoring', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-opencode-write-token': TOKEN,
      },
      body: JSON.stringify({
        type: 'context7',
        data: {
          libraryName: '/vercel/next.js',
          resolved: true,
          snippetCount: 3,
          durationMs: 12,
        },
      }),
    });

    const postResponse = await route.POST(postRequest);
    expect(postResponse.status).toBe(200);

    const getResponse = await route.GET(createRequest('http://localhost:3000/api/monitoring'));
    const payload = await getResponse.json();
    expect(payload.context7.totalLookups).toBeGreaterThan(0);
    expect(payload.context7.resolved).toBeGreaterThan(0);
  });
});
