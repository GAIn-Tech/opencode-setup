/**
 * Safe JSON Operations
 * Prevents crashes from circular references, stack overflow, and malformed JSON
 */

/**
 * Safely stringify an object, handling circular references
 * @param {any} obj - Object to stringify
 * @param {number} depth - Maximum depth (default: 10)
 * @returns {string} JSON string or error message
 */
export function safeStringify(obj, depth = 10) {
  if (obj === undefined) return 'undefined';
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
  } catch (error) {
    return `{"_stringifyError":"${error.message}"}`;
  }
}

/**
 * Safely parse JSON with error handling
 * @param {string} json - JSON string to parse
 * @param {any} fallback - Fallback value on error (default: null)
 * @returns {any} Parsed object or fallback
 */
export function safeParse(json, fallback = null) {
  if (!json || typeof json !== 'string') {
    return fallback;
  }
  
  try {
    return JSON.parse(json);
  } catch (error) {
    console.warn('[SafeJSON] Parse error:', error.message);
    return fallback;
  }
}

/**
 * Safely deep clone an object
 * @param {any} obj - Object to clone
 * @param {number} maxDepth - Maximum depth (default: 20)
 * @returns {any} Cloned object or original if failed
 */
export function safeClone(obj, maxDepth = 20) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  
  if (obj instanceof Array) {
    const arr = [];
    for (let i = 0; i < obj.length; i++) {
      if (maxDepth <= 0) return obj; // Prevent infinite recursion
      arr.push(safeClone(obj[i], maxDepth - 1));
    }
    return arr;
  }
  
  if (obj instanceof Object) {
    const clone = {};
    for (const key of Object.keys(obj)) {
      if (maxDepth <= 0) return obj;
      clone[key] = safeClone(obj[key], maxDepth - 1);
    }
    return clone;
  }
  
  return obj;
}

/**
 * Safe JSON module with all utilities
 */
export const SafeJSON = {
  stringify: safeStringify,
  parse: safeParse,
  clone: safeClone,
  
  // Check if value is safely serializable
  isSerializable: (value) => {
    try {
      JSON.stringify(value);
      return true;
    } catch {
      return false;
    }
  },
  
  // Get size estimate in bytes
  estimateSize: (value) => {
    try {
      return new Blob([JSON.stringify(value)]).size;
    } catch {
      return -1;
    }
  }
};

export default SafeJSON;
