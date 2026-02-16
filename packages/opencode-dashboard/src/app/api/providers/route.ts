// Provider health check API

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const RATE_LIMIT_FILE = path.join(process.cwd(), '.opencode', 'rate-limits.json');

interface ProviderHealth {
  provider: string;
  status: 'healthy' | 'rate_limited' | 'auth_error' | 'network_error' | 'unknown';
  latency?: number;
  error?: string;
  lastChecked: string;
}

interface RateLimitEntry {
  provider: string;
  model?: string;
  requests: number;
  tokensUsed: number;
  lastReset: string;
}

interface RateLimitsState {
  providers: Record<string, RateLimitEntry>;
  models: Record<string, RateLimitEntry>;
}

// Read rate limits from file
function readRateLimits(): RateLimitsState {
  try {
    if (fs.existsSync(RATE_LIMIT_FILE)) {
      return JSON.parse(fs.readFileSync(RATE_LIMIT_FILE, 'utf-8'));
    }
  } catch (e) {
    // Ignore errors, return default
  }
  return { providers: {}, models: {} };
}

// Save rate limits to file
function saveRateLimits(state: RateLimitsState): void {
  const dir = path.dirname(RATE_LIMIT_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = RATE_LIMIT_FILE + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2));
  fs.renameSync(tmpPath, RATE_LIMIT_FILE);
}

// Provider API endpoints for health checking
const PROVIDER_ENDPOINTS: Record<string, { 
  url: string; 
  auth: string; 
  authPrefix: string;
  model: string;
  body?: object;
  headers?: Record<string, string>;
}> = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    auth: 'x-api-key',
    authPrefix: 'Bearer ',
    model: 'claude-haiku-4-5',
    body: { model: 'claude-haiku-4-5', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] },
    headers: { 'anthropic-version': '2023-06-01' }
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    auth: 'authorization',
    authPrefix: 'Bearer ',
    model: 'gpt-4o-mini',
    body: { model: 'gpt-4o-mini', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }
  },
  google: {
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    auth: 'authorization',
    authPrefix: 'Bearer ',
    model: "gemini-2.0-flash",
    body: { contents: [{ parts: [{ text: 'hi' }] }] }
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    auth: 'authorization',
    authPrefix: 'Bearer ',
    model: 'llama-3.3-70b-versatile-versatile',
    body: { model: 'llama-3.3-70b-versatile-versatile', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }
  },
  cerebras: {
    url: 'https://api.cerebras.ai/v1/chat/completions',
    auth: 'authorization',
    authPrefix: 'Bearer ',
    model: 'llama-3.3-70b',
    body: { model: 'llama-3.3-70b', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }
  },
  nvidia: {
    url: 'https://integrate.api.nvidia.com/v1/chat/completions',
    auth: 'authorization',
    authPrefix: 'Bearer ',
    model: 'meta/llama-3.1-405b-instruct',
    body: { model: 'meta/llama-3.1-405b-instruct', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] }
  },
  antigravity: {
    url: 'https://api.anthropic.com/v1/messages',
    auth: 'x-api-key',
    authPrefix: 'Bearer ',
    model: 'claude-3-haiku-20240307',
    body: { model: 'claude-3-haiku-20240307', max_tokens: 1, messages: [{ role: 'user', content: 'hi' }] },
    headers: { 'anthropic-version': '2023-06-01' }
  }
};

// Get API key from environment
function getApiKey(provider: string): string | null {
  const envKey = `${provider.toUpperCase()}_API_KEY`;
  return process.env[envKey] || null;
}

// Test provider health by making a minimal API call
async function testProviderHealth(provider: string): Promise<ProviderHealth> {
  const config = PROVIDER_ENDPOINTS[provider];
  if (!config) {
    return {
      provider,
      status: 'unknown',
      error: 'Provider not configured',
      lastChecked: new Date().toISOString()
    };
  }

  const apiKey = getApiKey(provider);
  if (!apiKey) {
    return {
      provider,
      status: 'auth_error',
      error: `No API key found (expected ${provider.toUpperCase()}_API_KEY)`,
      lastChecked: new Date().toISOString()
    };
  }

  const startTime = Date.now();

  try {
    // Make actual API call to test provider connectivity
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    // Set auth header based on provider type
    if (config.auth === 'x-api-key') {
      headers['x-api-key'] = apiKey;
    } else {
      headers['Authorization'] = config.authPrefix + apiKey;
    }
    
    // Add provider-specific headers
    if (config.headers) {
      Object.assign(headers, config.headers);
    }

    const signal = typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(5000)
      : undefined;

    const response = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(config.body),
      signal
    });

    const latency = Date.now() - startTime;

    if (response.ok) {
      return {
        provider,
        status: 'healthy',
        latency,
        lastChecked: new Date().toISOString()
      };
    } else if (response.status === 429) {
      return {
        provider,
        status: 'rate_limited',
        latency,
        error: `Rate limited (${response.status})`,
        lastChecked: new Date().toISOString()
      };
    } else if (response.status === 401 || response.status === 403) {
      return {
        provider,
        status: 'auth_error',
        latency,
        error: `Authentication failed (${response.status})`,
        lastChecked: new Date().toISOString()
      };
    } else {
      const errorText = await response.text().catch(() => 'Unknown error');
      return {
        provider,
        status: 'network_error',
        latency,
        error: `HTTP ${response.status}: ${errorText.substring(0, 100)}`,
        lastChecked: new Date().toISOString()
      };
    }
  } catch (error) {
    return {
      provider,
      status: 'network_error',
      error: error instanceof Error ? error.message : 'Unknown error',
      latency: Date.now() - startTime,
      lastChecked: new Date().toISOString()
    };
  }
}

// GET: Return health status of all providers
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const provider = searchParams.get('provider');
  
  // Get rate limits
  const rateLimits = readRateLimits();

  if (provider) {
    // Return specific provider status
    const health = await testProviderHealth(provider);
    const providerRate = rateLimits.providers[provider];
    const modelRates = Object.entries(rateLimits.models)
      .filter(([key]) => key.startsWith(provider + '/'))
      .reduce((acc, [key, value]) => {
        acc[key.replace(provider + '/', '')] = value;
        return acc;
      }, {} as Record<string, RateLimitEntry>);

    return NextResponse.json({
      health,
      rateLimits: {
        provider: providerRate || null,
        models: modelRates
      }
    });
  }

  // Return all providers
  const providers = Object.keys(PROVIDER_ENDPOINTS);
  const results = await Promise.all(
    providers.map(async (p) => {
      const health = await testProviderHealth(p);
      const rate = rateLimits.providers[p];
      return { ...health, rateLimit: rate || null };
    })
  );

  return NextResponse.json({
    providers: results,
    rateLimits,
    timestamp: new Date().toISOString()
  });
}

// POST: Run health test for a specific provider
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, provider, data } = body;

    if (action === 'test') {
      // Run health test
      const health = await testProviderHealth(provider);
      return NextResponse.json(health);
    }

    if (action === 'recordUsage') {
      // Record usage for rate limiting
      const { provider: prov, model, requests = 1, tokens = 0 } = data;
      const rateLimits = readRateLimits();
      
      // Update provider-level
      if (!rateLimits.providers[prov]) {
        rateLimits.providers[prov] = {
          provider: prov,
          requests: 0,
          tokensUsed: 0,
          lastReset: new Date().toISOString()
        };
      }
      rateLimits.providers[prov].requests += requests;
      rateLimits.providers[prov].tokensUsed += tokens;

      // Update model-level if provided
      if (model) {
        const modelKey = `${prov}/${model}`;
        if (!rateLimits.models[modelKey]) {
          rateLimits.models[modelKey] = {
            provider: prov,
            model,
            requests: 0,
            tokensUsed: 0,
            lastReset: new Date().toISOString()
          };
        }
        rateLimits.models[modelKey].requests += requests;
        rateLimits.models[modelKey].tokensUsed += tokens;
      }

      saveRateLimits(rateLimits);
      return NextResponse.json({ success: true, rateLimits: rateLimits.providers[prov] });
    }

    if (action === 'resetUsage') {
      // Reset usage counters
      const { provider: prov, model } = data;
      const rateLimits = readRateLimits();

      if (model) {
        const modelKey = `${prov}/${model}`;
        delete rateLimits.models[modelKey];
      } else if (prov) {
        delete rateLimits.providers[prov];
      } else {
        // Reset all
        rateLimits.providers = {};
        rateLimits.models = {};
      }

      saveRateLimits(rateLimits);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
