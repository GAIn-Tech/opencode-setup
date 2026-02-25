const { describe, test, expect, beforeAll, afterAll } = require('bun:test');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { streamLogLines, processEntry } = require('../memory-graph-bridge.js');

const TEST_DIR = path.join(os.tmpdir(), 'memory-graph-bridge-test-' + Date.now());
const LOG_PATH = path.join(TEST_DIR, 'test-sessions.jsonl');

const SAMPLE_ENTRIES = [
  { type: 'task_start', task_hash: 'abc123', agent: 'build', model: 'claude-opus-4-20250514', complexity: 'high', prompt_preview: 'Fix the bug', timestamp: '2026-01-01T00:00:00Z' },
  { type: 'task_complete', task_hash: 'abc123', agent: 'build', success: true, duration_ms: 5000, timestamp: '2026-01-01T00:00:05Z' },
  { type: 'error', agent: 'explore', error_type: 'TimeoutError', error_message: 'Request timed out', context: 'search', timestamp: '2026-01-01T00:00:06Z' },
  { type: 'model_routing', from_model: 'gpt-4', to_model: 'claude-opus-4-20250514', reason: 'cost', timestamp: '2026-01-01T00:00:07Z' },
];

beforeAll(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

function writeJsonlFile(filePath, entries) {
  const content = entries.map(e => JSON.stringify(e)).join('\n') + '\n';
  fs.writeFileSync(filePath, content);
  return content;
}

describe('memory-graph-bridge streaming', () => {

  describe('streamLogLines', () => {
    test('streams all non-empty lines from JSONL file', async () => {
      writeJsonlFile(LOG_PATH, SAMPLE_ENTRIES);

      const lines = [];
      for await (const line of streamLogLines(LOG_PATH)) {
        lines.push(line);
      }

      expect(lines.length).toBe(4);
      expect(JSON.parse(lines[0]).type).toBe('task_start');
      expect(JSON.parse(lines[3]).type).toBe('model_routing');
    });

    test('skips blank and whitespace-only lines', async () => {
      const filePath = path.join(TEST_DIR, 'blanks.jsonl');
      fs.writeFileSync(filePath, '{"a":1}\n\n   \n{"b":2}\n\n');

      const lines = [];
      for await (const line of streamLogLines(filePath)) {
        lines.push(line);
      }

      expect(lines.length).toBe(2);
      expect(JSON.parse(lines[0])).toEqual({ a: 1 });
      expect(JSON.parse(lines[1])).toEqual({ b: 2 });
    });

    test('resumes from byte offset (startPosition)', async () => {
      const entry1 = JSON.stringify(SAMPLE_ENTRIES[0]) + '\n';
      const entry2 = JSON.stringify(SAMPLE_ENTRIES[1]) + '\n';
      const filePath = path.join(TEST_DIR, 'offset.jsonl');
      fs.writeFileSync(filePath, entry1 + entry2);

      const startPos = Buffer.byteLength(entry1, 'utf8');

      const lines = [];
      for await (const line of streamLogLines(filePath, startPos)) {
        lines.push(line);
      }

      expect(lines.length).toBe(1);
      expect(JSON.parse(lines[0]).type).toBe('task_complete');
    });

    test('yields nothing for empty file', async () => {
      const filePath = path.join(TEST_DIR, 'empty.jsonl');
      fs.writeFileSync(filePath, '');

      const lines = [];
      for await (const line of streamLogLines(filePath)) {
        lines.push(line);
      }

      expect(lines.length).toBe(0);
    });

    test('handles 1000 lines via streaming', async () => {
      const filePath = path.join(TEST_DIR, 'large.jsonl');
      const lines_data = [];
      for (let i = 0; i < 1000; i++) {
        lines_data.push(JSON.stringify({ type: 'task_start', i, timestamp: new Date().toISOString() }));
      }
      fs.writeFileSync(filePath, lines_data.join('\n') + '\n');

      let count = 0;
      for await (const line of streamLogLines(filePath)) {
        JSON.parse(line);
        count++;
      }

      expect(count).toBe(1000);
    });
  });

  describe('processEntry', () => {
    test('processes task_start entry', async () => {
      const nodes = [];
      const mockGraph = {
        addNode: (type, data) => nodes.push({ type, data }),
        addEdge: () => {},
      };

      await processEntry(mockGraph, SAMPLE_ENTRIES[0]);
      expect(nodes.length).toBe(1);
      expect(nodes[0].type).toBe('task');
      expect(nodes[0].data.agent).toBe('build');
    });

    test('processes task_complete with edge', async () => {
      const nodes = [];
      const edges = [];
      const mockGraph = {
        addNode: (type, data) => nodes.push({ type, data }),
        addEdge: (fromType, fromId, toType, toId, meta) =>
          edges.push({ fromType, fromId, toType, toId, meta }),
      };

      await processEntry(mockGraph, SAMPLE_ENTRIES[1]);
      expect(nodes.length).toBe(1);
      expect(nodes[0].type).toBe('outcome');
      expect(edges.length).toBe(1);
      expect(edges[0].meta.relation).toBe('succeeded');
    });

    test('processes error entry with agent edge', async () => {
      const edges = [];
      const mockGraph = {
        addNode: () => {},
        addEdge: (fromType, fromId, toType, toId, meta) =>
          edges.push({ fromType, fromId, meta }),
      };

      await processEntry(mockGraph, SAMPLE_ENTRIES[2]);
      expect(edges.length).toBe(1);
      expect(edges[0].fromType).toBe('agent');
      expect(edges[0].fromId).toBe('explore');
      expect(edges[0].meta.relation).toBe('encountered');
    });

    test('processes model_routing entry', async () => {
      const nodes = [];
      const mockGraph = {
        addNode: (type, data) => nodes.push({ type, data }),
        addEdge: () => {},
      };

      await processEntry(mockGraph, SAMPLE_ENTRIES[3]);
      expect(nodes.length).toBe(1);
      expect(nodes[0].type).toBe('routing');
      expect(nodes[0].data.from).toBe('gpt-4');
      expect(nodes[0].data.to).toBe('claude-opus-4-20250514');
    });
  });

  describe('end-to-end streaming', () => {
    test('streams and processes all entries correctly', async () => {
      writeJsonlFile(LOG_PATH, SAMPLE_ENTRIES);

      const nodes = [];
      const edges = [];
      const mockGraph = {
        addNode: (type, data) => nodes.push({ type, data }),
        addEdge: (fromType, fromId, toType, toId, meta) =>
          edges.push({ fromType, fromId, toType, toId, meta }),
      };

      let processed = 0;
      for await (const line of streamLogLines(LOG_PATH)) {
        const entry = JSON.parse(line);
        await processEntry(mockGraph, entry);
        processed++;
      }

      expect(processed).toBe(4);
      expect(nodes.length).toBe(4);
      expect(edges.length).toBe(2);
    });

    test('handles mixed valid and invalid JSON lines', async () => {
      const filePath = path.join(TEST_DIR, 'mixed.jsonl');
      fs.writeFileSync(filePath, [
        JSON.stringify(SAMPLE_ENTRIES[0]),
        'NOT_VALID_JSON',
        JSON.stringify(SAMPLE_ENTRIES[1]),
        '{broken',
      ].join('\n') + '\n');

      let parsed = 0;
      let errors = 0;
      for await (const line of streamLogLines(filePath)) {
        try {
          JSON.parse(line);
          parsed++;
        } catch {
          errors++;
        }
      }

      expect(parsed).toBe(2);
      expect(errors).toBe(2);
    });
  });
});
