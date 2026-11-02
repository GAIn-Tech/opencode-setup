'use strict';

const path = require('path');
const { pathToFileURL } = require('url');

const MODULE_CACHE = new Map();
const WARNING_CACHE = new Set();

const DEFAULT_LOGGER = Object.freeze({
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
});

/**
 * @typedef {{
 *   id: string,
 *   mode?: 'auto' | 'require' | 'import'
 * }} OptionalModuleCandidate
 */

/**
 * @template T
 * @typedef {{
 *   name: string,
 *   packageId?: string,
 *   workspacePath?: string,
 *   candidates?: Array<string | OptionalModuleCandidate>,
 *   exportName?: string,
 *   transform?: (loadedModule: unknown) => T,
 *   fallbackValue?: T | null,
 *   failOpen?: boolean,
 *   logMissing?: boolean,
 *   logger?: { warn?: (...args: unknown[]) => void, error?: (...args: unknown[]) => void },
 *   warnKey?: string,
 *   cwd?: string
 * }} ResolveOptionalModuleOptions
 */

/**
 * @template T
 * @typedef {{
 *   ok: boolean,
 *   value: T | null,
 *   source: string | null,
 *   error: Error | null,
 *   attempted: string[]
 * }} ResolveOptionalModuleResult
 */

function normalizeCandidate(candidate) {
  if (typeof candidate === 'string') {
    return { id: candidate, mode: 'auto' };
  }
  return {
    id: candidate.id,
    mode: candidate.mode || 'auto',
  };
}

function buildCandidates(options) {
  const collected = [];

  if (Array.isArray(options.candidates)) {
    for (const entry of options.candidates) {
      if (!entry) continue;
      collected.push(normalizeCandidate(entry));
    }
  } else {
    if (options.packageId) {
      collected.push({ id: options.packageId, mode: 'auto' });
    }
    if (options.workspacePath) {
      collected.push({ id: options.workspacePath, mode: 'auto' });
    }
  }

  return collected;
}

function pickExport(loadedModule, exportName) {
  if (!exportName) {
    return loadedModule;
  }
  if (loadedModule && typeof loadedModule === 'object' && exportName in loadedModule) {
    return loadedModule[exportName];
  }
  return null;
}

function toImportSpecifier(id, cwd) {
  if (id.startsWith('file://')) return id;
  if (path.isAbsolute(id)) return pathToFileURL(id).href;
  if (id.startsWith('./') || id.startsWith('../')) {
    return pathToFileURL(path.resolve(cwd || process.cwd(), id)).href;
  }
  return id;
}

function logOnce(messageKey, logger, message, error) {
  if (WARNING_CACHE.has(messageKey)) {
    return;
  }
  WARNING_CACHE.add(messageKey);
  if (error) {
    (logger.warn || DEFAULT_LOGGER.warn)(message, error);
    return;
  }
  (logger.warn || DEFAULT_LOGGER.warn)(message);
}

function cacheKey(candidate, phase) {
  return `${phase}:${candidate.mode}:${candidate.id}`;
}

function loadWithRequireSync(candidate) {
  return require(candidate.id);
}

async function loadWithImport(candidate, cwd) {
  const specifier = toImportSpecifier(candidate.id, cwd);
  return import(specifier);
}

function applyTransform(loaded, options) {
  const picked = pickExport(loaded, options.exportName);
  const selected = picked === null ? loaded : picked;
  if (typeof options.transform === 'function') {
    return options.transform(selected);
  }
  return selected;
}

/**
 * Resolve optional dependency synchronously (CommonJS-first).
 *
 * For ESM-only modules, prefer resolveOptionalModule(...) async API.
 *
 * @template T
 * @param {ResolveOptionalModuleOptions<T>} options
 * @returns {ResolveOptionalModuleResult<T>}
 */
function resolveOptionalModuleSync(options) {
  const logger = options.logger || DEFAULT_LOGGER;
  const candidates = buildCandidates(options);
  const attempted = [];
  let lastError = null;

  for (const candidate of candidates) {
    attempted.push(candidate.id);

    if (candidate.mode === 'import') {
      continue;
    }

    const key = cacheKey(candidate, 'require');
    try {
      const loaded = MODULE_CACHE.has(key) ? MODULE_CACHE.get(key) : loadWithRequireSync(candidate);
      if (!MODULE_CACHE.has(key)) MODULE_CACHE.set(key, loaded);

      const value = applyTransform(loaded, options);
      if (value !== null && value !== undefined) {
        return { ok: true, value, source: candidate.id, error: null, attempted };
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  const resultValue = options.fallbackValue ?? null;
  const warnKey = options.warnKey || `${options.name}:${attempted.join('|')}`;

  if (options.failOpen !== false && options.logMissing !== false) {
    logOnce(
      warnKey,
      logger,
      `[optional-module] ${options.name} unavailable (sync): ${attempted.join(', ')}`,
      lastError,
    );
  }

  if (options.failOpen === false) {
    const failError = lastError || new Error(`[optional-module] ${options.name} unavailable`);
    (logger.error || DEFAULT_LOGGER.error)(`[optional-module] ${options.name} hard failure`, failError);
    throw failError;
  }

  return {
    ok: false,
    value: resultValue,
    source: null,
    error: lastError,
    attempted,
  };
}

/**
 * Resolve optional dependency with both require() and dynamic import().
 *
 * @template T
 * @param {ResolveOptionalModuleOptions<T>} options
 * @returns {Promise<ResolveOptionalModuleResult<T>>}
 */
async function resolveOptionalModule(options) {
  const logger = options.logger || DEFAULT_LOGGER;
  const candidates = buildCandidates(options);
  const attempted = [];
  let lastError = null;

  for (const candidate of candidates) {
    attempted.push(candidate.id);

    const phases = candidate.mode === 'auto'
      ? ['require', 'import']
      : [candidate.mode];

    for (const phase of phases) {
      const key = cacheKey(candidate, phase);

      try {
        let loaded;
        if (MODULE_CACHE.has(key)) {
          loaded = MODULE_CACHE.get(key);
        } else if (phase === 'require') {
          loaded = loadWithRequireSync(candidate);
          MODULE_CACHE.set(key, loaded);
        } else {
          loaded = await loadWithImport(candidate, options.cwd);
          MODULE_CACHE.set(key, loaded);
        }

        const value = applyTransform(loaded, options);
        if (value !== null && value !== undefined) {
          return { ok: true, value, source: candidate.id, error: null, attempted };
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  const resultValue = options.fallbackValue ?? null;
  const warnKey = options.warnKey || `${options.name}:${attempted.join('|')}`;

  if (options.failOpen !== false && options.logMissing !== false) {
    logOnce(
      warnKey,
      logger,
      `[optional-module] ${options.name} unavailable: ${attempted.join(', ')}`,
      lastError,
    );
  }

  if (options.failOpen === false) {
    const failError = lastError || new Error(`[optional-module] ${options.name} unavailable`);
    (logger.error || DEFAULT_LOGGER.error)(`[optional-module] ${options.name} hard failure`, failError);
    throw failError;
  }

  return {
    ok: false,
    value: resultValue,
    source: null,
    error: lastError,
    attempted,
  };
}

function resetOptionalModuleResolverCaches() {
  MODULE_CACHE.clear();
  WARNING_CACHE.clear();
}

function getOptionalModuleResolverState() {
  return {
    moduleCacheSize: MODULE_CACHE.size,
    warnedKeys: Array.from(WARNING_CACHE),
  };
}

module.exports = {
  resolveOptionalModule,
  resolveOptionalModuleSync,
  resetOptionalModuleResolverCaches,
  getOptionalModuleResolverState,
};
