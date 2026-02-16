'use strict';

/**
 * taxonomy.js — Error classification system for Memory Graph v3.0
 *
 * Provides a hierarchical taxonomy tree mapping error types to parent categories,
 * with regex-based classification from message content and stack traces.
 * Ported from backfill.js ERROR_KEYWORDS as baseline, expanded into a full tree.
 */

// ═══════════════════════════════════════════════════════════════════════════
//  Taxonomy Tree Definition
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Static taxonomy tree. Each key is a node; value is an object of children.
 * Leaf nodes have empty objects as values.
 *
 * error
 * ├── runtime_error
 * │   ├── type_error
 * │   ├── reference_error
 * │   ├── range_error
 * │   └── eval_error
 * ├── syntax_error
 * ├── io_error
 * │   ├── fs_error         (ENOENT, EPERM, EACCES)
 * │   ├── network_error    (ECONNREFUSED, ENOTFOUND)
 * │   └── timeout_error    (ETIMEOUT, request timeout)
 * ├── module_error
 * │   ├── module_not_found
 * │   └── command_not_found
 * ├── permission_error     (permission denied, EACCES, EPERM)
 * ├── crash_error          (panic, crash, FATAL, abort)
 * ├── assertion_error
 * └── unknown_error
 */
const TAXONOMY_TREE = {
  error: {
    runtime_error: {
      type_error: {},
      reference_error: {},
      range_error: {},
      eval_error: {},
    },
    syntax_error: {},
    io_error: {
      fs_error: {},
      network_error: {},
      timeout_error: {},
    },
    module_error: {
      module_not_found: {},
      command_not_found: {},
    },
    permission_error: {},
    crash_error: {},
    assertion_error: {},
    unknown_error: {},
  },
};

// ═══════════════════════════════════════════════════════════════════════════
//  Pre-computed Lookup Tables (built once at module load)
// ═══════════════════════════════════════════════════════════════════════════

/** @type {Map<string, string>} child → parent */
const _parentMap = new Map();

/** @type {Map<string, string[]>} node → immediate children */
const _childrenMap = new Map();

/**
 * Recursively walk the tree and populate _parentMap and _childrenMap.
 * @param {object} node
 * @param {string|null} parentKey
 */
function _buildLookups(node, parentKey) {
  for (const [key, children] of Object.entries(node)) {
    if (parentKey) {
      _parentMap.set(key, parentKey);
    }
    const childKeys = Object.keys(children);
    _childrenMap.set(key, childKeys);
    if (childKeys.length > 0) {
      _buildLookups(children, key);
    }
  }
}

_buildLookups(TAXONOMY_TREE, null);

// ═══════════════════════════════════════════════════════════════════════════
//  Classification Regexes (cached at module load — fast matching)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ordered from most-specific to least-specific.
 * Each entry: { regex, type }. First match wins.
 * Ported from backfill.js ERROR_KEYWORDS + expanded.
 */
const _CLASSIFICATION_RULES = [
  // ── JS runtime errors ──
  { regex: /\btype\s*error\b/i, type: 'type_error' },
  { regex: /\btypeerror\b/i, type: 'type_error' },
  { regex: /\breference\s*error\b/i, type: 'reference_error' },
  { regex: /\breferenceerror\b/i, type: 'reference_error' },
  { regex: /\brange\s*error\b/i, type: 'range_error' },
  { regex: /\brangeerror\b/i, type: 'range_error' },
  { regex: /\beval\s*error\b/i, type: 'eval_error' },

  // ── Syntax ──
  { regex: /\bsyntax\s*error\b/i, type: 'syntax_error' },
  { regex: /\bsyntaxerror\b/i, type: 'syntax_error' },
  { regex: /\bunexpected\s+token\b/i, type: 'syntax_error' },

  // ── Filesystem IO ──
  { regex: /\bENOENT\b/, type: 'fs_error' },
  { regex: /\bEPERM\b/, type: 'fs_error' },
  { regex: /\bEISDIR\b/, type: 'fs_error' },
  { regex: /\bENOTDIR\b/, type: 'fs_error' },
  { regex: /\bEEXIST\b/, type: 'fs_error' },
  { regex: /\bEMFILE\b/, type: 'fs_error' },

  // ── Network IO ──
  { regex: /\bECONNREFUSED\b/, type: 'network_error' },
  { regex: /\bENOTFOUND\b/, type: 'network_error' },
  { regex: /\bECONNRESET\b/, type: 'network_error' },
  { regex: /\bEPIPE\b/, type: 'network_error' },
  { regex: /\bECONNABORTED\b/, type: 'network_error' },

  // ── Timeout ──
  { regex: /\bETIMEOUT\b/, type: 'timeout_error' },
  { regex: /\btimeout\b/i, type: 'timeout_error' },
  { regex: /\btimed?\s*out\b/i, type: 'timeout_error' },

  // ── Permission ──
  { regex: /\bEACCES\b/, type: 'permission_error' },
  { regex: /\bpermission\s*denied\b/i, type: 'permission_error' },
  { regex: /\baccess\s*denied\b/i, type: 'permission_error' },

  // ── Module / Command ──
  { regex: /\bmodule\s*not\s*found\b/i, type: 'module_not_found' },
  { regex: /\bcannot\s+find\s+module\b/i, type: 'module_not_found' },
  { regex: /\bcommand\s*not\s*found\b/i, type: 'command_not_found' },

  // ── Crash / Fatal ──
  { regex: /\bpanic\b/i, type: 'crash_error' },
  { regex: /\bcrash(?:ed)?\b/i, type: 'crash_error' },
  { regex: /\bFATAL\b/, type: 'crash_error' },
  { regex: /\babort(?:ed)?\b/i, type: 'crash_error' },
  { regex: /\bsegmentation\s*fault\b/i, type: 'crash_error' },
  { regex: /\bSIGSEGV\b/, type: 'crash_error' },
  { regex: /\bSIGKILL\b/, type: 'crash_error' },

  // ── Assertion ──
  { regex: /\bassertion\s*(error|fail)/i, type: 'assertion_error' },
  { regex: /\bassert(?:ion)?\s*failed\b/i, type: 'assertion_error' },

  // ── Generic fallbacks (least specific — last) ──
  { regex: /\bexception\b/i, type: 'runtime_error' },
  { regex: /\breject(?:ed)?\b/i, type: 'runtime_error' },
  { regex: /\bfailed\b/i, type: 'unknown_error' },
  { regex: /\berror\b/i, type: 'unknown_error' },
  { regex: /\bstack\s*trace\b/i, type: 'unknown_error' },
];

// ═══════════════════════════════════════════════════════════════════════════
//  Public API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Classify an error object into a taxonomy type.
 * Examines message first, then stack trace. First regex match wins.
 *
 * @param {{ message?: string, stack?: string }} error
 * @returns {string} The most specific taxonomy type (e.g., 'type_error')
 */
function classify(error) {
  if (!error) return 'unknown_error';

  // Build combined text: message + stack
  const msg = (typeof error.message === 'string' ? error.message : '') || '';
  const stack = (typeof error.stack === 'string' ? error.stack : '') || '';

  // Try message first (higher signal), then stack
  for (const text of [msg, stack]) {
    if (!text) continue;
    for (const { regex, type } of _CLASSIFICATION_RULES) {
      if (regex.test(text)) {
        return type;
      }
    }
  }

  return 'unknown_error';
}

/**
 * Get all ancestors of a taxonomy type, from parent to root.
 * Example: getAncestors('type_error') → ['runtime_error', 'error']
 *
 * @param {string} type
 * @returns {string[]}
 */
function getAncestors(type) {
  const ancestors = [];
  let current = type;
  while (_parentMap.has(current)) {
    const parent = _parentMap.get(current);
    ancestors.push(parent);
    current = parent;
  }
  return ancestors;
}

/**
 * Get immediate children of a taxonomy type.
 * Example: getChildren('runtime_error') → ['type_error', 'reference_error', 'range_error', 'eval_error']
 *
 * @param {string} type
 * @returns {string[]}
 */
function getChildren(type) {
  return _childrenMap.get(type) || [];
}

module.exports = {
  TAXONOMY_TREE,
  classify,
  getAncestors,
  getChildren,
  // Exposed for testing / advanced usage
  _CLASSIFICATION_RULES,
  _parentMap,
  _childrenMap,
};
