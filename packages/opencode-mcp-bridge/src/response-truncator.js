/**
 * Response Truncator — Truncates tool responses to configurable max tokens.
 *
 * Preserves beginning and end of response with truncation marker.
 * Default: 25,000 tokens (Anthropic Claude Code default).
 *
 * @module opencode-response-truncator
 */

const DEFAULT_MAX_TOKENS = 25000;
const TOKENS_PER_CHAR_ESTIMATE = 4; // Rough estimate: 1 token ≈ 4 chars
const TRUNCATION_MARKER = '\n\n--- [truncated, ~{omitted_tokens} tokens omitted] ---\n\n';

/**
 * Truncate a text response to max tokens.
 *
 * @param {string} text - Text to truncate
 * @param {object} [options]
 * @param {number} [options.maxTokens] - Maximum tokens (default: 25000)
 * @param {number} [options.headRatio] - Ratio of text to keep at head (default: 0.7)
 * @returns {{ truncated: string, wasTruncated: boolean, originalTokens: number, truncatedTokens: number, omittedTokens: number }}
 */
function truncateResponse(text, options = {}) {
  const { maxTokens = DEFAULT_MAX_TOKENS, headRatio = 0.7 } = options;

  if (!text || typeof text !== 'string') {
    return {
      truncated: text || '',
      wasTruncated: false,
      originalTokens: 0,
      truncatedTokens: 0,
      omittedTokens: 0
    };
  }

  const originalTokens = estimateTokens(text);

  if (originalTokens <= maxTokens) {
    return {
      truncated: text,
      wasTruncated: false,
      originalTokens,
      truncatedTokens: originalTokens,
      omittedTokens: 0
    };
  }

  // Calculate character limits
  const maxChars = maxTokens * TOKENS_PER_CHAR_ESTIMATE;
  const headChars = Math.floor(maxChars * headRatio);
  const tailChars = maxChars - headChars;

  // Reserve space for truncation marker
  const markerTokens = estimateTokens(TRUNCATION_MARKER);
  const availableChars = maxChars - (markerTokens * TOKENS_PER_CHAR_ESTIMATE);
  const adjustedHeadChars = Math.floor(availableChars * headRatio);
  const adjustedTailChars = availableChars - adjustedHeadChars;

  const head = text.slice(0, adjustedHeadChars);
  const tail = text.slice(-adjustedTailChars);

  const omittedTokens = originalTokens - estimateTokens(head) - estimateTokens(tail);
  const marker = TRUNCATION_MARKER.replace('{omitted_tokens}', omittedTokens.toLocaleString());

  const truncated = head + marker + tail;
  const truncatedTokens = estimateTokens(truncated);

  return {
    truncated,
    wasTruncated: true,
    originalTokens,
    truncatedTokens,
    omittedTokens
  };
}

/**
 * Estimate token count for text.
 *
 * @param {string} text
 * @returns {number} Estimated token count
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / TOKENS_PER_CHAR_ESTIMATE);
}

module.exports = {
  truncateResponse,
  estimateTokens,
  DEFAULT_MAX_TOKENS,
  TRUNCATION_MARKER
};
