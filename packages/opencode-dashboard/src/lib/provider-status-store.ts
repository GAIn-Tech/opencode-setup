import fs from 'fs';
import os from 'os';
import path from 'path';

export type UnifiedStatusLevel = 'healthy' | 'warning' | 'critical' | 'unknown';

export interface UnifiedModelStatus {
  id: string;
  name: string;
  status: UnifiedStatusLevel;
  metrics: {
    request_count: number;
    success_rate: number;
    avg_latency_ms: number;
  };
}

export interface UnifiedRateLimit {
  model_id: string;
  limit_type: string;
  limit: number;
  remaining: number;
  reset_at: string;
}

export interface UnifiedProviderStatus {
  id: string;
  name: string;
  status: UnifiedStatusLevel;
  health_check_url?: string;
  last_check: string;
  metrics: {
    request_count: number;
    success_count: number;
    error_count: number;
    avg_latency_ms: number;
  };
  rate_limits: UnifiedRateLimit[];
  models: UnifiedModelStatus[];
}

export interface UnifiedStatusSnapshot {
  version: string;
  timestamp: string;
  summary: {
    healthy_count: number;
    warning_count: number;
    critical_count: number;
    unknown_count: number;
  };
  providers: UnifiedProviderStatus[];
}

export interface UsageEvent {
  provider_id: string;
  model_id: string;
  request_id: string;
  success: boolean;
  latency_ms: number;
  timestamp: string;
}

interface HealthCheckRecord {
  provider_id: string;
  status: UnifiedStatusLevel;
  checked_at: string;
  latency_ms?: number;
  error?: string;
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

interface ProviderHealthResponse {
  provider: string;
  status: 'healthy' | 'rate_limited' | 'auth_error' | 'network_error' | 'unknown';
  latency?: number;
  error?: string;
  lastChecked: string;
}

interface ProvidersApiResponse {
  providers: Array<ProviderHealthResponse & { rateLimit?: RateLimitEntry | null }>;
  rateLimits?: RateLimitsState;
  timestamp?: string;
}

interface UnifiedStatusStoreFile {
  version: string;
  last_updated: string;
  snapshot: UnifiedStatusSnapshot;
  usage_events: UsageEvent[];
  health_checks: HealthCheckRecord[];
}

const STORE_VERSION = '1.0.0';
const STATUS_STALE_MS = 60_000;
const CACHE_TTL_MS_BASE = 45_000; // Base TTL when stable
const CACHE_TTL_MS_ERROR = 5_000;  // Short TTL when errors detected
const MAX_USAGE_EVENTS = 5_000;
const MAX_HEALTH_CHECKS = 5_000;
const RATE_LIMIT_FILE = path.join(process.cwd(), '.opencode', 'rate-limits.json');

// Adaptive cache TTL based on recent errors in store
function getAdaptiveCacheTTL(store: UnifiedStatusStoreFile): number {
  const recentErrors = store.health_checks?.filter(hc => 
    hc.status === 'critical' || hc.status === 'unknown'
  ).length || 0;
  
  if (recentErrors > 3) return CACHE_TTL_MS_ERROR;
  if (recentErrors > 0) return Math.max(CACHE_TTL_MS_ERROR, CACHE_TTL_MS_BASE - (recentErrors * 10000));
  return CACHE_TTL_MS_BASE;
}

let inMemoryCache: { expiresAt: number; value: UnifiedStatusSnapshot } | null = null;

function storeFilePath(): string {
  return path.join(os.homedir(), '.opencode', 'provider-status.json');
}

function providerName(id: string): string {
  if (!id) return 'Unknown';
  return id
    .split(/[-_\s]/g)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(' ');
}

function mapProviderStatus(status: ProviderHealthResponse['status']): UnifiedStatusLevel {
  if (status === 'healthy') return 'healthy';
  if (status === 'rate_limited') return 'warning';
  if (status === 'auth_error' || status === 'network_error') return 'critical';
  return 'unknown';
}

function safeNumber(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return value;
}

function average(previousAverage: number, previousCount: number, nextValue: number): number {
  const total = previousAverage * previousCount + nextValue;
  return Number((total / (previousCount + 1)).toFixed(2));
}

function modelStatusFromMetrics(requestCount: number, successCount: number): UnifiedStatusLevel {
  if (requestCount === 0) return 'unknown';
  const successRate = successCount / requestCount;
  if (successRate >= 0.95) return 'healthy';
  if (successRate >= 0.8) return 'warning';
  return 'critical';
}

function buildSummary(providers: UnifiedProviderStatus[]): UnifiedStatusSnapshot['summary'] {
  return providers.reduce(
    (acc, provider) => {
      if (provider.status === 'healthy') acc.healthy_count += 1;
      else if (provider.status === 'warning') acc.warning_count += 1;
      else if (provider.status === 'critical') acc.critical_count += 1;
      else acc.unknown_count += 1;
      return acc;
    },
    {
      healthy_count: 0,
      warning_count: 0,
      critical_count: 0,
      unknown_count: 0
    }
  );
}

function emptySnapshot(timestamp = new Date().toISOString()): UnifiedStatusSnapshot {
  return {
    version: STORE_VERSION,
    timestamp,
    summary: {
      healthy_count: 0,
      warning_count: 0,
      critical_count: 0,
      unknown_count: 0
    },
    providers: []
  };
}

function emptyStore(): UnifiedStatusStoreFile {
  const timestamp = new Date().toISOString();
  return {
    version: STORE_VERSION,
    last_updated: timestamp,
    snapshot: emptySnapshot(timestamp),
    usage_events: [],
    health_checks: []
  };
}

function readRateLimitsFile(): RateLimitsState {
  try {
    if (!fs.existsSync(RATE_LIMIT_FILE)) {
      return { providers: {}, models: {} };
    }
    const raw = fs.readFileSync(RATE_LIMIT_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      providers: parsed.providers ?? {},
      models: parsed.models ?? {}
    };
  } catch {
    return { providers: {}, models: {} };
  }
}

function readStore(): UnifiedStatusStoreFile {
  const filePath = storeFilePath();
  try {
    if (!fs.existsSync(filePath)) {
      return emptyStore();
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Partial<UnifiedStatusStoreFile>;
    const store = emptyStore();
    return {
      ...store,
      ...parsed,
      snapshot: {
        ...store.snapshot,
        ...(parsed.snapshot ?? {})
      },
      usage_events: Array.isArray(parsed.usage_events) ? parsed.usage_events : [],
      health_checks: Array.isArray(parsed.health_checks) ? parsed.health_checks : []
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(store: UnifiedStatusStoreFile): void {
  const filePath = storeFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // Robust atomic write pattern: write to temp file with unique name, validate, then rename
  // Uses temp file with timestamp+random to avoid collisions under concurrent writes
  const tmpPath = `${filePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  
  // Write to temp file first
  const jsonContent = JSON.stringify(store, null, 2);
  fs.writeFileSync(tmpPath, jsonContent, 'utf-8');
  
  // Validate the written content before rename
  let validatedContent: any;
  try {
    validatedContent = JSON.parse(fs.readFileSync(tmpPath, 'utf-8'));
  } catch (readErr) {
    // Temp file is corrupted, remove it and throw
    fs.unlinkSync(tmpPath);
    throw new Error(`Atomic write validation failed: ${readErr}`);
  }
  
  // Verify we can serialize the validated content (ensures it's valid JSON)
  if (JSON.stringify(validatedContent) !== jsonContent) {
    fs.unlinkSync(tmpPath);
    throw new Error('Atomic write validation failed: content mismatch');
  }
  
  // Now rename to target - this is the atomic operation
  fs.renameSync(tmpPath, filePath);
  
  // Verify the final file is valid (last line of defense)
  try {
    JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (verifyErr) {
    // This is a critical failure - the atomic write produced invalid output
    throw new Error(`CRITICAL: Atomic write produced corrupted file: ${verifyErr}`);
  }
}

function rateLimitsForProvider(providerId: string, rateLimits: RateLimitsState): UnifiedRateLimit[] {
  const output: UnifiedRateLimit[] = [];
  const providerLimit = rateLimits.providers[providerId];
  const nowIso = new Date().toISOString();

  if (providerLimit) {
    output.push({
      model_id: '*',
      limit_type: 'requests',
      limit: safeNumber(providerLimit.requests),
      remaining: 0,
      reset_at: providerLimit.lastReset || nowIso
    });
    output.push({
      model_id: '*',
      limit_type: 'tokens',
      limit: safeNumber(providerLimit.tokensUsed),
      remaining: 0,
      reset_at: providerLimit.lastReset || nowIso
    });
  }

  for (const [key, modelLimit] of Object.entries(rateLimits.models)) {
    if (!key.startsWith(`${providerId}/`)) continue;
    const modelId = key.slice(providerId.length + 1);
    output.push({
      model_id: modelId,
      limit_type: 'requests',
      limit: safeNumber(modelLimit.requests),
      remaining: 0,
      reset_at: modelLimit.lastReset || nowIso
    });
    output.push({
      model_id: modelId,
      limit_type: 'tokens',
      limit: safeNumber(modelLimit.tokensUsed),
      remaining: 0,
      reset_at: modelLimit.lastReset || nowIso
    });
  }

  return output;
}

function buildModels(
  providerId: string,
  previousModels: UnifiedModelStatus[],
  usageEvents: UsageEvent[],
  rateLimits: RateLimitsState
): UnifiedModelStatus[] {
  const modelMap = new Map<string, UnifiedModelStatus>();

  const providerUsageEvents = usageEvents.filter((usageEvent) => usageEvent.provider_id === providerId);
  if (providerUsageEvents.length === 0) {
    for (const model of previousModels) {
      modelMap.set(model.id, { ...model, metrics: { ...model.metrics } });
    }
  }

  for (const usageEvent of providerUsageEvents) {
    const current = modelMap.get(usageEvent.model_id) ?? {
      id: usageEvent.model_id,
      name: providerName(usageEvent.model_id),
      status: 'unknown' as UnifiedStatusLevel,
      metrics: {
        request_count: 0,
        success_rate: 0,
        avg_latency_ms: 0
      }
    };

    const previousCount = current.metrics.request_count;
    const previousSuccesses = Math.round((current.metrics.success_rate / 100) * previousCount);
    const nextCount = previousCount + 1;
    const nextSuccesses = previousSuccesses + (usageEvent.success ? 1 : 0);

    current.metrics.request_count = nextCount;
    current.metrics.success_rate = Number(((nextSuccesses / nextCount) * 100).toFixed(2));
    current.metrics.avg_latency_ms = average(
      current.metrics.avg_latency_ms,
      previousCount,
      safeNumber(usageEvent.latency_ms)
    );
    current.status = modelStatusFromMetrics(nextCount, nextSuccesses);
    modelMap.set(usageEvent.model_id, current);
  }

  for (const modelKey of Object.keys(rateLimits.models)) {
    if (!modelKey.startsWith(`${providerId}/`)) continue;
    const modelId = modelKey.slice(providerId.length + 1);
    if (!modelMap.has(modelId)) {
      modelMap.set(modelId, {
        id: modelId,
        name: providerName(modelId),
        status: 'unknown',
        metrics: {
          request_count: 0,
          success_rate: 0,
          avg_latency_ms: 0
        }
      });
    }
  }

  return Array.from(modelMap.values()).sort((a, b) => a.id.localeCompare(b.id));
}

function mergeSnapshot(
  previousSnapshot: UnifiedStatusSnapshot,
  providersApi: ProvidersApiResponse,
  usageEvents: UsageEvent[]
): { snapshot: UnifiedStatusSnapshot; healthChecks: HealthCheckRecord[] } {
  const timestamp = new Date().toISOString();
  const previousMap = new Map(previousSnapshot.providers.map((provider) => [provider.id, provider]));
  const rateLimits = providersApi.rateLimits ?? readRateLimitsFile();
  const mergedProviders = new Map<string, UnifiedProviderStatus>();
  const healthChecks: HealthCheckRecord[] = [];

  for (const providerHealth of providersApi.providers ?? []) {
    const providerId = providerHealth.provider;
    const previous = previousMap.get(providerId);
    const status = mapProviderStatus(providerHealth.status);
    const models = buildModels(providerId, previous?.models ?? [], usageEvents, rateLimits);
    const requestCount = models.reduce((acc, model) => acc + model.metrics.request_count, 0);
    const successCount = models.reduce(
      (acc, model) => acc + Math.round((model.metrics.success_rate / 100) * model.metrics.request_count),
      0
    );
    const errorCount = Math.max(0, requestCount - successCount);
    const avgLatency = models.length
      ? Number((models.reduce((acc, model) => acc + model.metrics.avg_latency_ms, 0) / models.length).toFixed(2))
      : safeNumber(providerHealth.latency);

    const mergedProvider: UnifiedProviderStatus = {
      id: providerId,
      name: providerName(providerId),
      status,
      health_check_url: undefined,
      last_check: providerHealth.lastChecked || timestamp,
      metrics: {
        request_count: requestCount,
        success_count: successCount,
        error_count: errorCount,
        avg_latency_ms: avgLatency
      },
      rate_limits: rateLimitsForProvider(providerId, rateLimits),
      models
    };

    mergedProviders.set(providerId, mergedProvider);
    healthChecks.push({
      provider_id: providerId,
      status,
      checked_at: mergedProvider.last_check,
      latency_ms: safeNumber(providerHealth.latency),
      error: providerHealth.error
    });
  }

  for (const provider of previousSnapshot.providers) {
    if (!mergedProviders.has(provider.id)) {
      mergedProviders.set(provider.id, provider);
    }
  }

  for (const providerId of Object.keys(rateLimits.providers)) {
    if (!mergedProviders.has(providerId)) {
      mergedProviders.set(providerId, {
        id: providerId,
        name: providerName(providerId),
        status: 'unknown',
        last_check: timestamp,
        metrics: {
          request_count: 0,
          success_count: 0,
          error_count: 0,
          avg_latency_ms: 0
        },
        rate_limits: rateLimitsForProvider(providerId, rateLimits),
        models: buildModels(providerId, [], usageEvents, rateLimits)
      });
    }
  }

  const providers = Array.from(mergedProviders.values()).sort((a, b) => a.id.localeCompare(b.id));
  const snapshot: UnifiedStatusSnapshot = {
    version: STORE_VERSION,
    timestamp,
    summary: buildSummary(providers),
    providers
  };

  return { snapshot, healthChecks };
}

function isSnapshotStale(snapshot: UnifiedStatusSnapshot): boolean {
  const at = Date.parse(snapshot.timestamp);
  if (Number.isNaN(at)) return true;
  return Date.now() - at > STATUS_STALE_MS;
}

async function fetchProvidersFromApi(origin?: string): Promise<ProvidersApiResponse> {
  const baseOrigin = origin ?? process.env.NEXT_PUBLIC_DASHBOARD_URL ?? 'http://localhost:3000';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);
  
  try {
    const response = await fetch(`${baseOrigin}/api/providers`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal as any
    });

    if (!response.ok) {
      throw new Error(`Provider health fetch failed with status ${response.status}`);
    }

    const payload = (await response.json()) as ProvidersApiResponse;
    if (!Array.isArray(payload.providers)) {
      throw new Error('Provider health response missing providers array');
    }
    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function getUnifiedStatus(options?: {
  forceRefresh?: boolean;
  origin?: string;
}): Promise<UnifiedStatusSnapshot> {
  const forceRefresh = options?.forceRefresh === true;

  if (!forceRefresh && inMemoryCache && Date.now() < inMemoryCache.expiresAt) {
    return inMemoryCache.value;
  }

  const store = readStore();
  const shouldRefresh =
    forceRefresh ||
    store.snapshot.providers.length === 0 ||
    isSnapshotStale(store.snapshot);

  if (!shouldRefresh) {
    inMemoryCache = {
      value: store.snapshot,
      expiresAt: Date.now() + getAdaptiveCacheTTL(store)
    };
    return store.snapshot;
  }

  try {
    const providersApi = await fetchProvidersFromApi(options?.origin);
    const { snapshot, healthChecks } = mergeSnapshot(store.snapshot, providersApi, store.usage_events);
    const nextStore: UnifiedStatusStoreFile = {
      ...store,
      version: STORE_VERSION,
      last_updated: snapshot.timestamp,
      snapshot,
      health_checks: [...store.health_checks, ...healthChecks].slice(-MAX_HEALTH_CHECKS)
    };

    writeStore(nextStore);
    inMemoryCache = {
      value: snapshot,
      expiresAt: Date.now() + getAdaptiveCacheTTL(store)
    };
    return snapshot;
  } catch {
    const fallbackSnapshot = store.snapshot.providers.length > 0 ? store.snapshot : emptySnapshot();
    inMemoryCache = {
      value: fallbackSnapshot,
      expiresAt: Date.now() + getAdaptiveCacheTTL(store)
    };
    return fallbackSnapshot;
  }
}

export function getProviderHistory(providerId: string): {
  usage_events: UsageEvent[];
  health_checks: HealthCheckRecord[];
} {
  const store = readStore();
  return {
    usage_events: store.usage_events.filter((event) => event.provider_id === providerId).slice(-200),
    health_checks: store.health_checks.filter((check) => check.provider_id === providerId).slice(-200)
  };
}

export async function getProviderDetails(
  providerId: string,
  options?: { forceRefresh?: boolean; origin?: string }
): Promise<UnifiedProviderStatus | null> {
  const snapshot = await getUnifiedStatus(options);
  return snapshot.providers.find((provider) => provider.id === providerId) ?? null;
}

export function ingestUsageEvent(event: UsageEvent): { snapshot: UnifiedStatusSnapshot; storedEvent: UsageEvent } {
  const store = readStore();
  const normalizedEvent: UsageEvent = {
    provider_id: event.provider_id,
    model_id: event.model_id,
    request_id: event.request_id,
    success: Boolean(event.success),
    latency_ms: safeNumber(event.latency_ms),
    timestamp: event.timestamp || new Date().toISOString()
  };

  const providers = [...store.snapshot.providers];
  const providerIndex = providers.findIndex((provider) => provider.id === normalizedEvent.provider_id);
  const provider: UnifiedProviderStatus =
    providerIndex >= 0
      ? {
          ...providers[providerIndex],
          metrics: { ...providers[providerIndex].metrics },
          models: providers[providerIndex].models.map((model) => ({ ...model, metrics: { ...model.metrics } }))
        }
      : {
          id: normalizedEvent.provider_id,
          name: providerName(normalizedEvent.provider_id),
          status: 'unknown',
          last_check: normalizedEvent.timestamp,
          metrics: {
            request_count: 0,
            success_count: 0,
            error_count: 0,
            avg_latency_ms: 0
          },
          rate_limits: [],
          models: []
        };

  provider.metrics.avg_latency_ms = average(
    provider.metrics.avg_latency_ms,
    provider.metrics.request_count,
    normalizedEvent.latency_ms
  );
  provider.metrics.request_count += 1;
  if (normalizedEvent.success) provider.metrics.success_count += 1;
  else provider.metrics.error_count += 1;

  const modelIndex = provider.models.findIndex((model) => model.id === normalizedEvent.model_id);
  const model =
    modelIndex >= 0
      ? { ...provider.models[modelIndex], metrics: { ...provider.models[modelIndex].metrics } }
      : {
          id: normalizedEvent.model_id,
          name: providerName(normalizedEvent.model_id),
          status: 'unknown' as UnifiedStatusLevel,
          metrics: {
            request_count: 0,
            success_rate: 0,
            avg_latency_ms: 0
          }
        };

  const priorModelRequests = model.metrics.request_count;
  const priorModelSuccesses = Math.round((model.metrics.success_rate / 100) * priorModelRequests);
  const nextModelRequests = priorModelRequests + 1;
  const nextModelSuccesses = priorModelSuccesses + (normalizedEvent.success ? 1 : 0);

  model.metrics.request_count = nextModelRequests;
  model.metrics.success_rate = Number(((nextModelSuccesses / nextModelRequests) * 100).toFixed(2));
  model.metrics.avg_latency_ms = average(model.metrics.avg_latency_ms, priorModelRequests, normalizedEvent.latency_ms);
  model.status = modelStatusFromMetrics(nextModelRequests, nextModelSuccesses);

  if (modelIndex >= 0) provider.models[modelIndex] = model;
  else provider.models.push(model);

  provider.models = provider.models.sort((a, b) => a.id.localeCompare(b.id));

  if (providerIndex >= 0) providers[providerIndex] = provider;
  else providers.push(provider);

  const timestamp = new Date().toISOString();
  const snapshot: UnifiedStatusSnapshot = {
    version: STORE_VERSION,
    timestamp,
    summary: buildSummary(providers),
    providers: providers.sort((a, b) => a.id.localeCompare(b.id))
  };

  const nextStore: UnifiedStatusStoreFile = {
    ...store,
    version: STORE_VERSION,
    last_updated: timestamp,
    snapshot,
    usage_events: [...store.usage_events, normalizedEvent].slice(-MAX_USAGE_EVENTS)
  };

  writeStore(nextStore);
  inMemoryCache = {
    value: snapshot,
    expiresAt: Date.now() + getAdaptiveCacheTTL(store)
  };

  return { snapshot, storedEvent: normalizedEvent };
}
