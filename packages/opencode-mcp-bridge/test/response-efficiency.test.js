import { describe, test, expect } from 'bun:test';
import { truncateResponse, estimateTokens, DEFAULT_MAX_TOKENS } from '../src/response-truncator.js';
import { paginateResponse, parsePageToken, DEFAULT_PAGE_SIZE } from '../src/response-paginator.js';

describe('Token-Efficient Tool Responses', () => {
  describe('truncateResponse', () => {
    test('does not truncate short responses', () => {
      const result = truncateResponse('Hello world');
      expect(result.wasTruncated).toBe(false);
      expect(result.truncated).toBe('Hello world');
      expect(result.omittedTokens).toBe(0);
    });

    test('truncates long responses', () => {
      const longText = 'x'.repeat(200000); // ~50K tokens
      const result = truncateResponse(longText, { maxTokens: 1000 });

      expect(result.wasTruncated).toBe(true);
      expect(result.originalTokens).toBeGreaterThan(1000);
      expect(result.truncatedTokens).toBeLessThanOrEqual(1000);
      expect(result.omittedTokens).toBeGreaterThan(0);
      expect(result.truncated).toContain('[truncated');
    });

    test('preserves head and tail of truncated response', () => {
      const longText = 'HEAD' + 'x'.repeat(200000) + 'TAIL';
      const result = truncateResponse(longText, { maxTokens: 1000 });

      expect(result.wasTruncated).toBe(true);
      expect(result.truncated.startsWith('HEAD')).toBe(true);
      expect(result.truncated.endsWith('TAIL')).toBe(true);
    });

    test('handles empty input', () => {
      const result = truncateResponse('');
      expect(result.wasTruncated).toBe(false);
      expect(result.truncated).toBe('');
    });

    test('handles null input', () => {
      const result = truncateResponse(null);
      expect(result.wasTruncated).toBe(false);
      expect(result.truncated).toBe('');
    });

    test('respects custom maxTokens', () => {
      const longText = 'x'.repeat(40000);
      const result = truncateResponse(longText, { maxTokens: 500 });

      expect(result.wasTruncated).toBe(true);
      expect(result.truncatedTokens).toBeLessThanOrEqual(500);
    });

    test('estimateTokens returns reasonable estimate', () => {
      const text = 'Hello world, this is a test';
      const tokens = estimateTokens(text);
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThanOrEqual(Math.ceil(text.length / 2));
    });
  });

  describe('paginateResponse', () => {
    test('paginates an array', () => {
      const items = Array.from({ length: 150 }, (_, i) => `item-${i}`);
      const result = paginateResponse(items, { pageSize: 50, page: 0 });

      expect(result.items).toHaveLength(50);
      expect(result.page).toBe(0);
      expect(result.pageSize).toBe(50);
      expect(result.totalCount).toBe(150);
      expect(result.hasMore).toBe(true);
      expect(result.nextPageToken).toBe('1');
    });

    test('returns last page correctly', () => {
      const items = Array.from({ length: 120 }, (_, i) => `item-${i}`);
      const result = paginateResponse(items, { pageSize: 50, page: 2 });

      expect(result.items).toHaveLength(20);
      expect(result.page).toBe(2);
      expect(result.hasMore).toBe(false);
      expect(result.nextPageToken).toBeNull();
    });

    test('handles empty array', () => {
      const result = paginateResponse([]);
      expect(result.items).toHaveLength(0);
      expect(result.totalCount).toBe(0);
      expect(result.hasMore).toBe(false);
    });

    test('handles non-array input', () => {
      const result = paginateResponse(null);
      expect(result.items).toHaveLength(0);
      expect(result.totalCount).toBe(0);
    });

    test('returns first page by default', () => {
      const items = Array.from({ length: 100 }, (_, i) => `item-${i}`);
      const result = paginateResponse(items);

      expect(result.page).toBe(0);
      expect(result.items).toHaveLength(DEFAULT_PAGE_SIZE);
    });
  });

  describe('parsePageToken', () => {
    test('parses valid page token', () => {
      expect(parsePageToken({ page_token: '5' })).toBe(5);
    });

    test('returns 0 for missing token', () => {
      expect(parsePageToken({})).toBe(0);
    });

    test('returns 0 for invalid token', () => {
      expect(parsePageToken({ page_token: 'invalid' })).toBe(0);
    });

    test('returns 0 for negative token', () => {
      expect(parsePageToken({ page_token: '-1' })).toBe(0);
    });
  });
});
