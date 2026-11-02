import { describe, expect, test } from 'bun:test';
import {
  compareRuntimeToolsToSelection,
  extractExperimentalToolQueryFields,
} from '../runtime-tool-surface-proof.mjs';
import { readFileSync } from 'fs';
import { join } from 'path';

const PACKAGE_JSON = join(import.meta.dir, '..', '..', 'package.json');

describe('runtime-tool-surface-proof helpers', () => {
  test('package.json exposes an mcp:runtime-proof script', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8'));
    expect(pkg.scripts['mcp:runtime-proof']).toBe('node scripts/runtime-tool-surface-proof.mjs');
  });

  test('extracts provider and model query fields from installed runtime source', () => {
    const snippet = `
      .get(
        "/tool",
        validator(
          "query",
          z.object({
            provider: z.string(),
            model: z.string(),
          }),
        ),
      )
    `;

    expect(extractExperimentalToolQueryFields(snippet)).toEqual(['provider', 'model']);
  });

  test('extracts provider and model query fields from a source map payload', () => {
    const sourceMap = JSON.stringify({
      sourcesContent: [
        'nothing here',
        'operationId: "tool.list" validator("query", z.object({ provider: z.string(), model: z.string() }))',
      ],
    });

    expect(extractExperimentalToolQueryFields(sourceMap)).toEqual(['provider', 'model']);
  });

  test('reports preload-selected tools missing from runtime-visible tool list', () => {
    const result = compareRuntimeToolsToSelection({
      runtimeToolIds: ['bash', 'read', 'supermemory', 'skill_mcp', 'compress', 'todowrite', 'grep'],
      selectedToolNames: [
        'context7_query_docs',
        'distill_run_tool',
        'supermemory',
        'supermemory_search',
        'writing-plans',
        'grep_grep_query',
      ],
    });

    expect(result.presentSelectedTools).toEqual([
      'context7_query_docs',
      'distill_run_tool',
      'supermemory',
      'supermemory_search',
      'writing-plans',
      'grep_grep_query',
    ]);
    expect(result.missingSelectedTools).toEqual([]);
    expect(result.resolvedToolMapping).toEqual({
      context7_query_docs: 'skill_mcp',
      distill_run_tool: 'compress',
      supermemory: 'supermemory',
      supermemory_search: 'supermemory',
      'writing-plans': 'todowrite',
      grep_grep_query: 'grep',
    });
    expect(result.allSelectedToolsVisible).toBe(true);
  });

  test('keeps truly unavailable tools marked as missing', () => {
    const result = compareRuntimeToolsToSelection({
      runtimeToolIds: ['bash', 'read'],
      selectedToolNames: ['context7_query_docs', 'nonexistent_tool'],
    });

    expect(result.presentSelectedTools).toEqual([]);
    expect(result.missingSelectedTools).toEqual(['context7_query_docs', 'nonexistent_tool']);
    expect(result.resolvedToolMapping).toEqual({
      context7_query_docs: null,
      nonexistent_tool: null,
    });
    expect(result.allSelectedToolsVisible).toBe(false);
  });
});
