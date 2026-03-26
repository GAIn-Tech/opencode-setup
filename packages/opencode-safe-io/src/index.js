'use strict';

/**
 * @deprecated This package is currently orphaned — it has no callers in the integration layer.
 * Pending: either wire into integration-layer or formally deprecate and remove.
 * See orchestration-fixes audit (March 2026), Gap #32.
 */


const fs = require('fs');
const fsPromises = require('fs').promises;

// 50 MB max size guard
const MAX_JSON_SIZE = 50 * 1024 * 1024;

// ─── Safe JSON Parse ────────────────────────────────────────────────

/**
 * Safely parse a JSON string with fallback on failure.
 * Guards against non-string input and oversized strings (>50MB).
 *
 * @param {string} str - JSON string to parse
 * @param {*} fallback - Value to return on failure
 * @param {string} [label] - Label for warning messages
 * @returns {*} Parsed value or fallback
 */
function safeJsonParse(str, fallback, label) {
  if (typeof str !== 'string' || !str.trim()) return fallback;
  if (str.length > MAX_JSON_SIZE) {
    console.warn(`[safeJsonParse] Input exceeds 50MB limit${label ? ` (${label})` : ''}`);
    return fallback;
  }
  try {
    return JSON.parse(str);
  } catch (err) {
    if (label) {
      console.warn(`[safeJsonParse] Could not parse ${label}: ${err.message}`);
    }
    return fallback;
  }
}

// ─── Safe JSON File Read (Async) ────────────────────────────────────

/**
 * Asynchronously read and parse a JSON file with fallback.
 * Returns fallback on ENOENT (file not found) or parse failure.
 *
 * @param {string} filePath - Path to JSON file
 * @param {*} fallback - Value to return on failure
 * @param {string} [label] - Label for warning messages
 * @returns {Promise<*>} Parsed value or fallback
 */
async function safeJsonRead(filePath, fallback, label) {
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    return safeJsonParse(raw, fallback, label || filePath);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    console.warn(`[safeJsonRead] Could not read ${label || filePath}: ${err.message}`);
    return fallback;
  }
}

// ─── Safe JSON File Read (Sync) ─────────────────────────────────────


// ─── SafeJSON (crash-guard compatible API) ──────────────────────────

/**
 * Safe JSON operations matching crash-guard safe-json.js API.
 * Handles circular references, stack overflow, and malformed JSON.
 */
const SafeJSON = {
  /**
   * Safely parse JSON with fallback.
   *
   * @param {string} str - JSON string to parse
   * @param {*} [fallback=null] - Fallback value on error
   * @returns {*} Parsed value or fallback
   */
  parse(str, fallback) {
    if (fallback === undefined) fallback = null;
    if (!str || typeof str !== 'string') return fallback;
    try {
      return JSON.parse(str);
    } catch (err) {
      console.warn('[SafeJSON] Parse error:', err.message);
      return fallback;
    }
  },

  /**
   * Safely stringify an object, handling circular references.
   *
   * @param {*} obj - Object to stringify
   * @param {string} [fallback='{}'] - Fallback string on error
   * @returns {string} JSON string or fallback
   */
  stringify(obj, fallback) {
    if (fallback === undefined) fallback = '{}';
    if (obj === undefined) return '"undefined"';
    if (obj === null) return 'null';

    const seen = new WeakSet();
    try {
      return JSON.stringify(obj, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return `[Circular:${key}]`;
          }
          seen.add(value);
        }
        if (typeof value === 'function') {
          return `[Function:${key}]`;
        }
        if (typeof value === 'symbol') {
          return `[Symbol:${key}]`;
        }
        return value;
      }, 2);
    } catch (err) {
      console.warn('[SafeJSON] Stringify error:', err.message);
      return fallback;
    }
  },
};

// ─── Managed Interval ───────────────────────────────────────────────

/**
 * Create a managed interval that stores its ID and calls .unref().
 * Returns a stoppable handle.
 *
 * @param {Function} fn - Function to call on each tick
 * @param {number} ms - Interval in milliseconds
 * @param {object} [options]
 * @param {string} [options.label] - Label for debugging
 * @returns {{ id: *, stop: Function, label: string|undefined }}
 */
function managedInterval(fn, ms, options) {
  const opts = options || {};
  const id = setInterval(fn, ms);
  if (typeof id.unref === 'function') {
    id.unref();
  }
  return {
    id,
    label: opts.label,
    stop() {
      clearInterval(id);
    },
  };
}

// ─── Managed Listener ───────────────────────────────────────────────

/**
 * Attach a managed event listener. Uses .once() by default.
 * Pass { persistent: true } for .on() with tracked cleanup.
 *
 * @param {EventEmitter} emitter - Event emitter
 * @param {string} event - Event name
 * @param {Function} handler - Event handler
 * @param {object} [options]
 * @param {boolean} [options.persistent=false] - Use .on() instead of .once()
 * @returns {{ remove: Function }}
 */
function managedListener(emitter, event, handler, options) {
  const opts = options || {};
  if (opts.persistent) {
    emitter.on(event, handler);
  } else {
    emitter.once(event, handler);
  }
  return {
    remove() {
      emitter.removeListener(event, handler);
    },
  };
}

// ─── Exports ────────────────────────────────────────────────────────

module.exports = {
  safeJsonParse,
  safeJsonRead,
  SafeJSON,
  managedInterval,
  managedListener,
};
