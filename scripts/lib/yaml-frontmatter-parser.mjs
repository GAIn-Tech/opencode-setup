/**
 * Robust YAML frontmatter parser using js-yaml.
 * Replaces fragile regex-based extraction in consolidate-skills.mjs.
 *
 * Handles: quoted/unquoted strings, single-line arrays, multi-line arrays,
 * block scalars (> and |), YAML comments, missing fields, CRLF line endings.
 */

import yaml from 'js-yaml';

const FRONTMATTER_RE = /^---[\t ]*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * Parse YAML frontmatter from a markdown file's content string.
 *
 * @param {string} content - Full file content (markdown with optional YAML frontmatter)
 * @returns {object|null} Parsed frontmatter as a plain object, or null if no valid frontmatter
 */
export function parseFrontmatter(content) {
  if (content == null || typeof content !== 'string' || content.length === 0) {
    return null;
  }

  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return null;
  }

  const rawYaml = match[1];

  // Empty frontmatter block
  if (!rawYaml.trim()) {
    return {};
  }

  try {
    const parsed = yaml.load(rawYaml, { schema: yaml.DEFAULT_SCHEMA });

    // yaml.load can return non-objects for scalar YAML; guard against that
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    // Malformed YAML — return null rather than crashing
    return null;
  }
}
