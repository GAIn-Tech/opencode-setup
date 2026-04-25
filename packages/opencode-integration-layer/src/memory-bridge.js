'use strict';

const {
  validateMemoryRecord,
  normalizeMemoryRecord,
  computeIdempotencyKey,
} = require('./memory-schema.js');

const DEFAULT_WRITE_TIMEOUT_MS = 5000;
const DEFAULT_RECALL_TIMEOUT_MS = 10000;

/**
 * Unified Memory Write/Recall Bridge.
 *
 * Orchestrates the write/recall pipeline:
 * - save(): validate → normalize → idempotency check → write to Supermemory (or degraded queue)
 * - recall(): query Supermemory → return results
 * - search(): vector similarity search via Supermemory recall
 */
class MemoryBridge {
  /**
   * @param {object} opts
   * @param {object} [opts.schema] – schema module (default: memory-schema)
   * @param {object} [opts.degradedHandler] – DegradedModeHandler instance
   * @param {object} [opts.pathResolver] – path resolver module (default: memory-paths)
   * @param {object} [opts.logger] – structured logger ({ info, warn, error })
   * @param {number} [opts.writeTimeoutMs] – write timeout (default 5000)
   * @param {number} [opts.recallTimeoutMs] – recall timeout (default 10000)
   */
  constructor(opts = {}) {
    this._schema = opts.schema || require('./memory-schema.js');
    this._degradedHandler = opts.degradedHandler || null;
    this._logger = opts.logger || createNoopLogger();
    this._writeTimeoutMs = normalizePositiveInteger(opts.writeTimeoutMs, DEFAULT_WRITE_TIMEOUT_MS);
    this._recallTimeoutMs = normalizePositiveInteger(opts.recallTimeoutMs, DEFAULT_RECALL_TIMEOUT_MS);

    // Resolve Supermemory functions from globals or injected
    this._supermemoryMemory = resolveOptionalFunction(opts.supermemoryMemory, 'supermemory_memory');
    this._supermemoryRecall = resolveOptionalFunction(opts.supermemoryRecall, 'supermemory_recall');
    this._supermemoryWhoAmI = resolveOptionalFunction(opts.supermemoryWhoAmI, 'supermemory_whoAmI');
  }

  /**
   * Save a memory record.
   *
   * Flow:
   * 1. Validate via validateMemoryRecord() → reject if invalid
   * 2. Normalize via normalizeMemoryRecord() → fill defaults, compute hash
   * 3. Compute idempotency key → check if already exists (via recall)
   * 4. If duplicate → return existing memory ID (idempotent)
   * 5. If new → write to Supermemory via supermemory_memory()
   * 6. On Supermemory failure → delegate to degradedHandler.write()
   * 7. Return { id, status: 'saved' | 'duplicate' | 'queued' }
   *
   * @param {object} record
   * @returns {Promise<{id: string, status: string}>}
   */
  async save(record) {
    // Step 1: Validate
    const validation = this._schema.validateMemoryRecord(record);
    if (!validation.valid) {
      throw new Error(`[MemoryBridge] validation failed: ${validation.errors.join('; ')}`);
    }

    // Step 2: Normalize
    const normalized = this._schema.normalizeMemoryRecord(record);

// Step 3: Compute idempotency key and store in metadata for reliable duplicate detection
  const idempotencyKey = this._schema.computeIdempotencyKey(normalized);
  normalized.metadata = { ...normalized.metadata, idempotencyKey };

  // Step 4: Check for duplicate via recall
    const existing = await this._checkDuplicate(normalized, idempotencyKey);
    if (existing) {
      this._logger.info('[MemoryBridge] duplicate detected', {
        id: existing.id || normalized.id,
        status: 'duplicate',
        idempotencyKey,
      });
      return { id: existing.id || normalized.id, status: 'duplicate' };
    }

    // Step 5: Write to Supermemory
    try {
      const written = await this._writeToSupermemory(normalized);
      this._logger.info('[MemoryBridge] saved to Supermemory', {
        id: normalized.id,
        status: 'saved',
        idempotencyKey,
      });
      return { id: normalized.id, status: 'saved' };
    } catch (error) {
      this._logger.warn('[MemoryBridge] Supermemory write failed, delegating to degraded handler', {
        id: normalized.id,
        error: error.message,
      });

      // Step 6: Fallback to degraded queue
      if (this._degradedHandler) {
        const result = await this._degradedHandler.write(normalized);
        return { id: normalized.id, status: result.queued ? 'queued' : 'saved' };
      }

      throw error;
    }
  }

  /**
   * Recall memories matching a query.
   *
   * Flow:
   * 1. Call supermemory_recall(query, containerTag=options.project, includeProfile=false)
   * 2. If Supermemory unavailable → return { memories: [], status: 'degraded', message: ... }
   * 3. Return { memories, status: 'ok' }
   *
   * @param {string} query
   * @param {object} [options]
   * @param {string} [options.project] – containerTag for project scoping
   * @returns {Promise<{memories: object[], status: string, message?: string}>}
   */
  async recall(query, options = {}) {
    const project = typeof options.project === 'string' && options.project.length > 0
      ? options.project
      : 'sm_project_default';

    try {
      const memories = await withTimeout(
        Promise.resolve().then(() => this._callSupermemoryRecall(query, project)),
        this._recallTimeoutMs,
        'recall timed out',
      );

      return { memories: memories || [], status: 'ok' };
    } catch (error) {
      this._logger.warn('[MemoryBridge] recall failed', { error: error.message });
      return {
        memories: [],
        status: 'degraded',
        message: 'Memory unavailable',
      };
    }
  }

  /**
   * Search memories via vector similarity.
   *
   * Flow:
   * 1. Call supermemory_recall(query) for vector similarity search
   * 2. Return results with computed scores from scoring pipeline (if provided)
   *
   * @param {string} query
   * @param {object} [options]
   * @param {string} [options.project] – containerTag
   * @param {object} [options.scoringPipeline] – MemoryScoringPipeline instance
   * @returns {Promise<{memories: object[], status: string}>}
   */
  async search(query, options = {}) {
    const result = await this.recall(query, { project: options.project });

    if (result.status !== 'ok' || !options.scoringPipeline) {
      return result;
    }

    // Apply scoring pipeline if provided
    const scoredMemories = await Promise.all(
      result.memories.map((memory) =>
        options.scoringPipeline.score(memory, { query }).then((score) => ({
          ...memory,
          _score: score,
        })),
      ),
    );

    // Sort by score descending
    scoredMemories.sort((a, b) => (b._score?.total || 0) - (a._score?.total || 0));

    return { memories: scoredMemories, status: 'ok' };
  }

  // --- Private helpers ---

  async _checkDuplicate(normalized, idempotencyKey) {
    if (typeof this._supermemoryRecall !== 'function') {
      return null;
    }

    try {
      // Try to find existing memory with same content_hash
      const results = await withTimeout(
        Promise.resolve().then(() =>
          this._supermemoryRecall(normalized.content_hash, normalized.project, false),
        ),
        this._recallTimeoutMs,
        'duplicate check timed out',
      );

      if (Array.isArray(results)) {
        return results.find((m) => {
          if (m.content_hash === normalized.content_hash) {
            return true;
          }
          // Also check via idempotency key stored in metadata
          if (m.metadata && m.metadata.idempotencyKey === idempotencyKey) {
            return true;
          }
          return false;
        }) || null;
      }

      return null;
    } catch (_error) {
      return null;
    }
  }

  async _writeToSupermemory(record) {
    if (typeof this._supermemoryMemory !== 'function') {
      throw new Error('supermemory_memory is unavailable');
    }

    const payload = JSON.stringify(record);
    const containerTag = record.project || 'sm_project_default';

    if (this._supermemoryMemory.length >= 2) {
      return await withTimeout(
        Promise.resolve(this._supermemoryMemory(payload, containerTag)),
        this._writeTimeoutMs,
        'write timed out',
      );
    }

    return await withTimeout(
      Promise.resolve(this._supermemoryMemory({ content: payload, action: 'save', containerTag })),
      this._writeTimeoutMs,
      'write timed out',
    );
  }

  async _callSupermemoryRecall(query, containerTag) {
    if (typeof this._supermemoryRecall !== 'function') {
      throw new Error('supermemory_recall is unavailable');
    }

    if (this._supermemoryRecall.length >= 2) {
      return this._supermemoryRecall(query, containerTag);
    }

    return this._supermemoryRecall({ query, containerTag, includeProfile: false });
  }
}

// --- Utilities ---

function normalizePositiveInteger(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback;
  }
  return Math.floor(numeric);
}

function resolveOptionalFunction(candidate, globalName) {
  if (typeof candidate === 'function') {
    return candidate;
  }
  if (globalThis && typeof globalThis[globalName] === 'function') {
    return globalThis[globalName];
  }
  return null;
}

function createNoopLogger() {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

async function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutId = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

module.exports = { MemoryBridge };