import crypto from 'crypto';
import fsPromises from 'fs/promises';

/** Serialized write queue to prevent concurrent write corruption */
let _writePromise = Promise.resolve();

function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalStringify(item)).join(',')}]`;
  }
  const obj = value;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(obj[key])}`);
  return `{${parts.join(',')}}`;
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function hmacSha256(input, key) {
  return crypto.createHmac('sha256', key).update(input).digest('hex');
}

function n(v, fallback = 0) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const parsed = Number(v);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

/**
 * Write JSON atomically (async) with serialized write queue.
 * Uses tmp+rename for atomic swap, chained via _writePromise to prevent
 * concurrent write corruption. Falls back to direct write on Windows EPERM.
 */
async function atomicWrite(filePath, data) {
  const doWrite = async () => {
    const tmp = `${filePath}.tmp.${Date.now()}.${process.pid}`;
    const json = JSON.stringify(data);
    try {
      await fsPromises.writeFile(tmp, json, 'utf8');
      await fsPromises.rename(tmp, filePath);
    } catch (err) {
      // Windows: rename over existing file can EPERM; fall back to direct write
      if (err.code === 'EPERM' || err.code === 'EACCES') {
        await fsPromises.writeFile(filePath, json, 'utf8');
        try { await fsPromises.unlink(tmp); } catch (cleanupErr) { console.warn('[event-store] cleanup failed:', cleanupErr.message); }
      } else {
        // Clean up tmp on failure
        try { await fsPromises.unlink(tmp); } catch (cleanupErr) { console.warn('[event-store] cleanup failed:', cleanupErr.message); }
        throw err;
      }
    }
  };
  _writePromise = _writePromise.catch(() => {}).then(doWrite);
  return _writePromise;
}

export function normalizeEvents({ incoming, signingKey, signingMode, defaultSource }) {
  const normalizationDiagnostics = {
    unsigned: 0,
    invalid_signature: 0,
    accepted_signed: 0,
    accepted_unsigned: 0,
  };

  const normalized = incoming
    .map((event) => ({
      ...event,
      timestamp: event.timestamp || new Date().toISOString(),
      input_tokens: n(event.input_tokens, 0),
      output_tokens: n(event.output_tokens, 0),
      total_tokens: n(event.total_tokens, n(event.input_tokens, 0) + n(event.output_tokens, 0)),
      iteration_index: n(event.iteration_index, 0),
    }))
    .map((event) => {
      const envelope = {
        timestamp: event.timestamp,
        trace_id: event.trace_id,
        span_id: event.span_id,
        parent_span_id: event.parent_span_id,
        model: event.model,
        skill: event.skill,
        tool: event.tool,
        input_tokens: event.input_tokens,
        output_tokens: event.output_tokens,
        total_tokens: event.total_tokens,
        iteration_index: event.iteration_index,
        termination_reason: event.termination_reason,
      };

      const eventHash = sha256(canonicalStringify(envelope));
      const incomingSignature = String(event?.provenance?.signature || '').trim();
      const computedSignature = signingKey ? hmacSha256(eventHash, signingKey) : '';
      const signatureToStore = incomingSignature || computedSignature;
      const signatureValid = signingKey
        ? Boolean(signatureToStore) && signatureToStore === computedSignature
        : Boolean(signatureToStore);

      if (!signatureToStore) {
        normalizationDiagnostics.unsigned += 1;
      } else if (!signatureValid) {
        normalizationDiagnostics.invalid_signature += 1;
      }

      return {
        ...event,
        provenance: {
          source: event?.provenance?.source || defaultSource,
          event_hash: eventHash,
          signature: signatureToStore || undefined,
          signature_valid: signatureValid,
          signing_algorithm: signatureToStore ? (signingKey ? 'hmac-sha256' : 'external') : 'none',
          received_at: new Date().toISOString(),
          signer: signingKey ? 'opencode-local' : undefined,
        },
      };
    })
    .filter((event) => {
      const hasSignature = Boolean(event?.provenance?.signature);
      const validSignature = event?.provenance?.signature_valid === true;

      if (signingMode === 'off' || signingMode === 'allow-unsigned') {
        if (hasSignature) normalizationDiagnostics.accepted_signed += 1;
        else normalizationDiagnostics.accepted_unsigned += 1;
        return true;
      }

      if (signingMode === 'require-signed') {
        if (!hasSignature) return false;
        normalizationDiagnostics.accepted_signed += 1;
        return true;
      }

      if (signingMode === 'require-valid-signature') {
        if (!hasSignature || !validSignature) return false;
        normalizationDiagnostics.accepted_signed += 1;
        return true;
      }

      return true;
    });

  return { normalized, normalizationDiagnostics };
}

export async function persistEvents({ filePath, version, existingEvents, replace, normalized, maxEvents = 10000 }) {
  const doTransaction = async () => {
    let events;
    if (replace) {
      events = normalized;
    } else {
      // Read fresh inside queue to prevent lost-update race condition.
      // Previously, callers passed stale existingEvents snapshots read before
      // enqueueing, so concurrent writers would overwrite each other's events.
      let freshExisting = [];
      try {
        const raw = await fsPromises.readFile(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        freshExisting = Array.isArray(parsed.events) ? parsed.events : [];
      } catch {
        // File doesn't exist yet or is invalid — use caller's snapshot as fallback
        freshExisting = Array.isArray(existingEvents) ? existingEvents : [];
      }
      events = [...freshExisting, ...normalized].slice(-maxEvents);
    }

    const payload = { version: version || '1.0.0', updated_at: new Date().toISOString(), events };

    // Atomic file swap (inlined to avoid double-queuing through atomicWrite)
    const tmp = `${filePath}.tmp.${Date.now()}.${process.pid}`;
    const json = JSON.stringify(payload);
    try {
      await fsPromises.writeFile(tmp, json, 'utf8');
      await fsPromises.rename(tmp, filePath);
    } catch (err) {
      if (err.code === 'EPERM' || err.code === 'EACCES') {
        await fsPromises.writeFile(filePath, json, 'utf8');
        try { await fsPromises.unlink(tmp); } catch (cleanupErr) { console.warn('[event-store] cleanup failed:', cleanupErr.message); }
      } else {
        try { await fsPromises.unlink(tmp); } catch (cleanupErr) { console.warn('[event-store] cleanup failed:', cleanupErr.message); }
        throw err;
      }
    }

    return events;
  };

  _writePromise = _writePromise.catch(() => {}).then(doTransaction);
  return _writePromise;
}

export function summarizeEventProvenance({ normalized, signingKey, diagnostics }) {
  const signed = normalized.filter((event) => Boolean(event?.provenance?.signature)).length;
  const valid = normalized.filter((event) => event?.provenance?.signature_valid === true).length;

  return {
    signing_enabled: Boolean(signingKey),
    signed_events: signed,
    valid_signed_events: valid,
    diagnostics,
  };
}
