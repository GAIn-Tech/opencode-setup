#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const rules = [
  { pattern: /opencode-ai/g, reason: 'Use `opencode` package name.' },
  { pattern: /npm install -g bun/g, reason: 'Do not instruct global Bun install via npm.' },
  { pattern: /verify-setup\.sh/g, reason: 'Use `bun run verify`.' },
  { pattern: /health-check\.sh/g, reason: 'Use `bun run health`.' },
  { pattern: /\.\/setup\.sh/g, reason: 'Use `bun run setup`.' },
  { pattern: /scripts\/setup\.sh/g, reason: 'Use `bun run setup`.' },
];

function listTrackedMarkdown() {
  const result = spawnSync('git', ['ls-files', '*.md'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'Failed to enumerate markdown files via git ls-files');
  }

  return (result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function main() {
  const files = listTrackedMarkdown();
  const violations = [];

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    for (const rule of rules) {
      rule.pattern.lastIndex = 0;
      for (const match of content.matchAll(rule.pattern)) {
        violations.push({
          file,
          line: lineNumberAt(content, match.index || 0),
          text: match[0],
          reason: rule.reason,
        });
      }
    }
  }

  if (violations.length === 0) {
    console.log('docs-governance-check: PASS');
    return;
  }

  console.error(`docs-governance-check: FAIL (${violations.length} violation${violations.length === 1 ? '' : 's'})`);
  for (const v of violations) {
    console.error(`- ${v.file}:${v.line} -> ${v.text} (${v.reason})`);
  }
  process.exit(1);
}

main();
