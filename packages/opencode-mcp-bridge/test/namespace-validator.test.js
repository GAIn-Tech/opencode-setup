import { describe, test, expect } from 'bun:test';
import {
  validateToolName,
  validateToolNames,
  generateSuggestion,
  loadNamespacingConfig,
  NAMESPACE_PATTERN
} from '../src/namespace-validator.js';

describe('Tool Namespacing Validator', () => {
  describe('NAMESPACE_PATTERN', () => {
    test('matches valid namespaced names', () => {
      expect(NAMESPACE_PATTERN.test('github_issue_create')).toBe(true);
      expect(NAMESPACE_PATTERN.test('filesystem_read')).toBe(false); // Only 2 parts
      expect(NAMESPACE_PATTERN.test('lsp_goto_definition')).toBe(true);
      expect(NAMESPACE_PATTERN.test('websearch_search_and_crawl')).toBe(true);
    });

    test('rejects invalid patterns', () => {
      expect(NAMESPACE_PATTERN.test('InvalidName')).toBe(false);
      expect(NAMESPACE_PATTERN.test('invalid')).toBe(false);
      expect(NAMESPACE_PATTERN.test('INVALID_NAME_HERE')).toBe(false);
      expect(NAMESPACE_PATTERN.test('123_test_case')).toBe(false);
    });
  });

  describe('validateToolName', () => {
    test('validates correct namespaced names', () => {
      const result = validateToolName('github_issue_create');
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.suggestion).toBeNull();
    });

    test('rejects non-namespaced names', () => {
      const result = validateToolName('GotoDefinition');
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.suggestion).toBeDefined();
    });

    test('allows legacy names when allowLegacy is true', () => {
      const result = validateToolName('legacyTool', { allowLegacy: true });
      expect(result.valid).toBe(true);
      expect(result.suggestion).toContain('Consider migrating');
    });

    test('rejects empty tool name', () => {
      const result = validateToolName('');
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('non-empty'))).toBe(true);
    });

    test('rejects null tool name', () => {
      const result = validateToolName(null);
      expect(result.valid).toBe(false);
    });

    test('generates suggestion for PascalCase names', () => {
      const result = validateToolName('GotoDefinition');
      expect(result.valid).toBe(false);
      expect(result.suggestion).toBe('unknown_goto_definition');
    });

    test('generates suggestion for single-segment names', () => {
      const result = validateToolName('search');
      expect(result.suggestion).toBe('unknown_search_execute');
    });

    test('generates suggestion for two-segment names', () => {
      const result = validateToolName('file_read');
      expect(result.suggestion).toBe('file_read_execute');
    });
  });

  describe('validateToolNames', () => {
    test('validates multiple names', () => {
      const result = validateToolNames(['github_issue_create', 'lsp_goto_definition']);
      expect(result.valid).toBe(true);
      expect(result.results.every(r => r.valid)).toBe(true);
    });

    test('detects invalid names in batch', () => {
      const result = validateToolNames(['github_issue_create', 'InvalidName']);
      expect(result.valid).toBe(false);
      expect(result.results.some(r => !r.valid)).toBe(true);
    });
  });

  describe('generateSuggestion', () => {
    test('suggests lowercase for PascalCase', () => {
      expect(generateSuggestion('GotoDefinition')).toBe('unknown_goto_definition');
      expect(generateSuggestion('LspGotoDefinition')).toBe('lsp_goto_definition');
    });

    test('suggests fallback for single segment', () => {
      expect(generateSuggestion('search')).toBe('unknown_search_execute');
    });

    test('suggests fallback for two segments', () => {
      expect(generateSuggestion('file_read')).toBe('file_read_execute');
    });

    test('returns null for empty input', () => {
      expect(generateSuggestion('')).toBeNull();
    });

    test('returns null for null input', () => {
      expect(generateSuggestion(null)).toBeNull();
    });
  });

  describe('loadNamespacingConfig', () => {
    test('loads config from file', () => {
      const config = loadNamespacingConfig();
      expect(config.convention).toBe('{service}_{resource}_{action}');
    });

    test('returns defaults when config file missing', () => {
      const config = loadNamespacingConfig('/nonexistent/path.json');
      expect(config.convention).toBe('{service}_{resource}_{action}');
      expect(config.validation.pattern).toBe(NAMESPACE_PATTERN.source);
    });
  });
});
