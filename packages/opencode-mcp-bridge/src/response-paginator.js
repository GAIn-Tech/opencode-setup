/**
 * Response Paginator — Paginates list-returning tool responses.
 *
 * Default page size: 50 items. Supports page_token for continuation.
 *
 * @module opencode-response-paginator
 */

const DEFAULT_PAGE_SIZE = 50;

/**
 * Paginate an array response.
 *
 * @param {Array} items - Array of items to paginate
 * @param {object} [options]
 * @param {number} [options.pageSize] - Items per page (default: 50)
 * @param {number} [options.page] - Page number (0-indexed, default: 0)
 * @returns {{ items: Array, page: number, pageSize: number, totalCount: number, hasMore: boolean, nextPageToken: string|null }}
 */
function paginateResponse(items, options = {}) {
  const { pageSize = DEFAULT_PAGE_SIZE, page = 0 } = options;

  if (!Array.isArray(items)) {
    return {
      items: [],
      page: 0,
      pageSize,
      totalCount: 0,
      hasMore: false,
      nextPageToken: null
    };
  }

  const totalCount = items.length;
  const start = page * pageSize;
  const end = Math.min(start + pageSize, totalCount);
  const pageItems = items.slice(start, end);
  const hasMore = end < totalCount;
  const nextPageToken = hasMore ? String(page + 1) : null;

  return {
    items: pageItems,
    page,
    pageSize,
    totalCount,
    hasMore,
    nextPageToken
  };
}

/**
 * Parse a page token from a request.
 *
 * @param {object} params - Request params
 * @param {string} [params.page_token] - Page token string
 * @returns {number} Page number (0-indexed)
 */
function parsePageToken(params = {}) {
  const token = params.page_token;
  if (!token) return 0;

  const page = parseInt(token, 10);
  return Number.isFinite(page) && page >= 0 ? page : 0;
}

module.exports = {
  paginateResponse,
  parsePageToken,
  DEFAULT_PAGE_SIZE
};
