import crypto from 'crypto';
import fs from 'fs';

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

function atomicWrite(filePath, data) {
  const tmp = `${filePath}.tmp.${Date.now()}.${process.pid}`;

  try {
    fs.writeFileSync(tmp, JSON.stringify(data), 'utf8');
  } catch (error) {
    try {
      if (fs.existsSync(tmp)) {
        fs.unlinkSync(tmp);
      }
    } catch {}
    throw error;
  }

  try {
    fs.renameSync(tmp, filePath);
  } catch (error) {
    try {
      if (fs.existsSync(tmp)) {
        fs.unlinkSync(tmp);
      }
    } catch {}
    throw error;
  }
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

export function persistEvents({ filePath, version, existingEvents, replace, normalized, maxEvents = 10000 }) {
  const events = replace ? normalized : [...(Array.isArray(existingEvents) ? existingEvents : []), ...normalized].slice(-maxEvents);
  atomicWrite(filePath, { version: version || '1.0.0', updated_at: new Date().toISOString(), events });
  return events;
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
