import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();

function parseWorkflowEventPaths(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const events = { pull_request: [], push: [] };

  let inOn = false;
  let currentEvent = null;
  let inPaths = false;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '    ');

    if (!inOn) {
      if (/^on:\s*$/.test(line)) {
        inOn = true;
      }
      continue;
    }

    if (/^[^\s]/.test(line) && !/^on:\s*$/.test(line)) {
      break;
    }

    const eventMatch = line.match(/^  (pull_request|push):\s*$/);
    if (eventMatch) {
      currentEvent = eventMatch[1];
      inPaths = false;
      continue;
    }

    if (!currentEvent) continue;

    if (/^    paths:\s*$/.test(line)) {
      inPaths = true;
      continue;
    }

    if (inPaths) {
      const itemMatch = line.match(/^      -\s+"([^"]+)"\s*$/);
      if (itemMatch) {
        events[currentEvent].push(itemMatch[1]);
        continue;
      }

      if (/^    \S/.test(line)) {
        inPaths = false;
      }
    }
  }

  return events;
}

describe('workflow trigger coverage for portability surfaces (Gap A1)', () => {
  const requiredOnAll = ['plugins/**', 'local/**'];
  const workflowFiles = [
    '.github/workflows/portability-matrix.yml',
    '.github/workflows/bootstrap-readiness.yml',
    '.github/workflows/governance-gate.yml',
  ];

  for (const relPath of workflowFiles) {
    test(`${relPath} includes required pull_request and push portability paths`, () => {
      const filePath = join(ROOT, relPath);
      const events = parseWorkflowEventPaths(filePath);

      for (const eventName of ['pull_request', 'push']) {
        const paths = events[eventName];
        expect(paths.length).toBeGreaterThan(0);

        for (const requiredPath of requiredOnAll) {
          expect(paths).toContain(requiredPath);
        }

        expect(new Set(paths).size).toBe(paths.length);
      }
    });
  }

  test('governance-gate includes mcp-servers portability surface', () => {
    const workflowPath = join(ROOT, '.github/workflows/governance-gate.yml');
    const events = parseWorkflowEventPaths(workflowPath);

    expect(events.pull_request).toContain('mcp-servers/**');
    expect(events.push).toContain('mcp-servers/**');
  });
});
