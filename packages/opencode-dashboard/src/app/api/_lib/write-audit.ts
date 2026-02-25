import fs from 'fs/promises';
import fsSync from 'fs';
import { createHash } from 'node:crypto';
import os from 'os';
import path from 'path';

const AUDIT_DIR = path.join(os.homedir(), '.opencode', 'audit');
const AUDIT_LOG_PATH = path.join(AUDIT_DIR, 'dashboard-write-audit.ndjson');
const GENESIS_PREVIOUS_HASH = '0';

let chainInitialized = false;
let lastHash = GENESIS_PREVIOUS_HASH;

type WriteAuditEntry = {
  route: string;
  actor: string;
  action: string;
  metadata?: Record<string, unknown>;
};

type StoredWriteAuditEntry = {
  timestamp: string;
  route: string;
  actor: string;
  action: string;
  metadata: Record<string, unknown>;
  prevHash: string;
  hash: string;
};

type AppendWriteAuditOptions = {
  auditPath?: string;
};

export async function appendWriteAuditEntry(entry: WriteAuditEntry, options?: AppendWriteAuditOptions): Promise<void> {
  const auditPath = options?.auditPath || AUDIT_LOG_PATH;
  await fs.mkdir(path.dirname(auditPath), { recursive: true });

  const usingDefaultAuditPath = auditPath === AUDIT_LOG_PATH;
  if (usingDefaultAuditPath) {
    await initializeChainState(auditPath);
  }

  const previousHash = usingDefaultAuditPath ? lastHash : await getLastStoredHash(auditPath);
  const timestamp = new Date().toISOString();
  const metadata = entry.metadata || {};
  const hash = computeEntryHash({
    prevHash: previousHash,
    timestamp,
    action: entry.action,
    actor: entry.actor,
    payload: { route: entry.route, metadata }
  });

  const payload: StoredWriteAuditEntry = {
    timestamp,
    route: entry.route,
    actor: entry.actor,
    action: entry.action,
    metadata,
    prevHash: previousHash,
    hash
  };

  await fs.appendFile(auditPath, `${JSON.stringify(payload)}\n`, 'utf-8');

  if (usingDefaultAuditPath) {
    lastHash = hash;
  }
}

export async function verifyWriteAuditChain(auditPath: string): Promise<{ valid: boolean; brokenAt: number | null }> {
  try {
    await fs.access(auditPath);
  } catch {
    return { valid: true, brokenAt: null };
  }

  const raw = (await fs.readFile(auditPath, 'utf-8')).trim();
  if (!raw) {
    return { valid: true, brokenAt: null };
  }

  const lines = raw.split('\n').filter((line: string) => line.trim().length > 0);
  let expectedPreviousHash = GENESIS_PREVIOUS_HASH;

  for (let index = 0; index < lines.length; index += 1) {
    let parsedEntry: Record<string, unknown>;
    try {
      parsedEntry = JSON.parse(lines[index]);
    } catch (_error) {
      return { valid: false, brokenAt: index };
    }

    const previousHash = readStringField(parsedEntry.prevHash);
    if (previousHash !== expectedPreviousHash) {
      return { valid: false, brokenAt: index };
    }

    const timestamp = readStringField(parsedEntry.timestamp);
    const action = readStringField(parsedEntry.action);
    const actor = readStringField(parsedEntry.actor);
    const route = readStringField(parsedEntry.route);
    const metadata = isRecord(parsedEntry.metadata) ? parsedEntry.metadata : {};
    const storedHash = readStringField(parsedEntry.hash);
    const computedHash = computeEntryHash({
      prevHash: previousHash,
      timestamp,
      action,
      actor,
      payload: { route, metadata }
    });

    if (storedHash !== computedHash) {
      return { valid: false, brokenAt: index };
    }

    expectedPreviousHash = storedHash;
  }

  return { valid: true, brokenAt: null };
}

async function initializeChainState(auditPath: string): Promise<void> {
  if (chainInitialized) {
    return;
  }

  chainInitialized = true;
  const verification = await verifyWriteAuditChain(auditPath);
  if (!verification.valid) {
    console.error(
      `[write-audit] CRITICAL: audit hash chain verification failed at index ${verification.brokenAt}`
    );
  }

  lastHash = await getLastStoredHash(auditPath);
}

async function getLastStoredHash(auditPath: string): Promise<string> {
  try {
    await fs.access(auditPath);
  } catch {
    return GENESIS_PREVIOUS_HASH;
  }

  const raw = (await fs.readFile(auditPath, 'utf-8')).trim();
  if (!raw) {
    return GENESIS_PREVIOUS_HASH;
  }

  const lines = raw.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();
    if (!line) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      const hash = readStringField(parsed.hash);
      if (hash) {
        return hash;
      }
    } catch (_error) {
      return GENESIS_PREVIOUS_HASH;
    }
  }

  return GENESIS_PREVIOUS_HASH;
}

function computeEntryHash(input: {
  prevHash: string;
  timestamp: string;
  action: string;
  actor: string;
  payload: Record<string, unknown>;
}): string {
  const serializedPayload = stableStringify(input.payload);
  const hashInput = `${input.prevHash}${input.timestamp}${input.action}${input.actor}${serializedPayload}`;

  const bunGlobal = globalThis as {
    Bun?: {
      CryptoHasher?: new (algorithm: string) => {
        update: (value: string) => void;
        digest: (encoding: 'hex') => string;
      };
    };
  };
  if (bunGlobal.Bun && typeof bunGlobal.Bun.CryptoHasher === 'function') {
    const hasher = new bunGlobal.Bun.CryptoHasher('sha256');
    hasher.update(hashInput);
    return hasher.digest('hex');
  }

  return createHash('sha256').update(hashInput).digest('hex');
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForHash(value));
}

function normalizeForHash(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForHash(entry));
  }

  if (isRecord(value)) {
    const normalized: Record<string, unknown> = {};
    const keys = Object.keys(value).sort();
    for (const key of keys) {
      normalized[key] = normalizeForHash(value[key]);
    }
    return normalized;
  }

  if (value === undefined) {
    return '__undefined__';
  }

  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readStringField(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
