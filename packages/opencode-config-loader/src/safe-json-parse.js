'use strict';
function safeJsonParse(src, fallback, label) {
  if (typeof src !== 'string' || !src.trim()) return fallback;
  try {
    return JSON.parse(src);
  } catch (err) {
    if (label) {
      console.warn(`[safeJsonParse] Could not parse ${label}: ${err.message}`);
    }
    return fallback;
  }
}
module.exports = { safeJsonParse };
