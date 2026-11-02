#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRoot } from './resolve-root.mjs';

const __filename = fileURLToPath(import.meta.url);

const ROOT = resolveRoot();
const PROPOSALS_DIR = join(ROOT, '.sisyphus', 'proposals');
const DATE_STAMP = new Date().toISOString().slice(0, 10);
const REPORT_PATH = join(PROPOSALS_DIR, `agents-drift-report-${DATE_STAMP}.md`);
const PROPOSAL_PATH = join(PROPOSALS_DIR, `agents-drift-${DATE_STAMP}.md`);

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

function walkFiles(dir, fileName, excludeDirs = ['node_modules', '.git', '.next', '.worktrees', 'local', '.sisyphus']) {
  const found = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return found;
  }

  for (const entry of entries) {
    if (excludeDirs.includes(entry.name)) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...walkFiles(abs, fileName, excludeDirs));
    } else if (entry.name === fileName) {
      found.push(abs);
    }
  }
  return found;
}

function extractSection(content, sectionName) {
  const headerPattern = new RegExp(`^## ${sectionName}.*$`, 'mi');
  const headerMatch = content.match(headerPattern);
  if (!headerMatch) return null;
  const start = headerMatch.index + headerMatch[0].length;
  const rest = content.slice(start);
  const nextHeader = rest.match(/^## /m);
  const body = nextHeader ? rest.slice(0, nextHeader.index) : rest;
  return body.trim();
}

function countImmediateDirectories(absDir) {
  if (!existsSync(absDir)) return 0;
  try {
    const entries = readdirSync(absDir, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).length;
  } catch {
    return 0;
  }
}

function countFilesRecursive(absDir, predicate) {
  let count = 0;
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const abs = join(absDir, entry.name);
    if (entry.isDirectory()) {
      count += countFilesRecursive(abs, predicate);
      continue;
    }
    if (predicate(entry.name, abs)) count += 1;
  }
  return count;
}

function normalizeRelPath(absPath) {
  return relative(ROOT, absPath).replace(/\\/g, '/');
}

function parseCountClaims(content) {
  const claims = [];
  const lines = content.split('\n');
  const patterns = [
    { type: 'package_count', regex: /(\d+)\s+(?:workspace\s+)?packages?\b/i, label: 'Package count' },
    { type: 'script_count', regex: /(\d+)\s+(?:\.mjs\s+)?(?:infrastructure\s+)?scripts?\b/i, label: 'Script count' },
    { type: 'agent_count', regex: /(\d+)\s+agents?\b(?!\.md)/i, label: 'Agent definitions' },
    { type: 'skill_count', regex: /(\d+)\s+skills?\b/i, label: 'Skill definitions' },
  ];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const pattern of patterns) {
      const match = line.match(pattern.regex);
      if (!match) continue;
      claims.push({
        type: pattern.type,
        label: pattern.label,
        documented: Number(match[1]),
        lineNumber: i + 1,
        lineText: line,
      });
    }
  }
  return claims;
}

function parseStructureDirectories(content, baseDir) {
  const structure = extractSection(content, 'STRUCTURE');
  if (!structure) return [];

  const blocks = [];
  const fenceRe = /```[\s\S]*?```/g;
  for (const match of structure.matchAll(fenceRe)) blocks.push(match[0]);
  if (blocks.length === 0) return [];

  const dirs = [];
  for (const block of blocks) {
    const body = block.replace(/^```[a-z]*\s*/i, '').replace(/```$/, '');
    const lines = body.split('\n');
    let treeRoot = null;
    let treeStack = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const treeMatch = line.match(/^([\s│]*)[├└]──\s+([^#\s]+\/)/);
      if (treeMatch) {
        const prefix = treeMatch[1] || '';
        const depth = Math.floor(prefix.length / 4);
        const entry = treeMatch[2].replace(/\/$/, '');

        treeStack[depth] = entry;
        treeStack.length = depth + 1;

        const parts = treeRoot
          ? [treeRoot, ...treeStack.slice(0, depth + 1)]
          : treeStack.slice(0, depth + 1);

        dirs.push({ entry: parts.join('/'), lineText: line.trim() });
        continue;
      }

      const standaloneMatch = line.trim().match(/^([A-Za-z0-9._-]+\/)$/);
      if (!standaloneMatch) continue;

      const entry = standaloneMatch[1];
      const currentDirName = `${basename(baseDir)}/`;
      if (entry === currentDirName || entry === './') continue;

      const normalizedEntry = entry.replace(/\/$/, '');
      dirs.push({ entry: normalizedEntry, lineText: line.trim() });

      let nextNonEmptyLine = null;
      for (let lookahead = index + 1; lookahead < lines.length; lookahead += 1) {
        if (!lines[lookahead].trim()) continue;
        nextNonEmptyLine = lines[lookahead];
        break;
      }

      if (nextNonEmptyLine && /^[\s│]*[├└]──\s+([^#\s]+\/)/.test(nextNonEmptyLine)) {
        treeRoot = normalizedEntry;
        treeStack = [];
      } else {
        treeRoot = null;
        treeStack = [];
      }
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const dir of dirs) {
    const normalized = dir.entry.replace(/\/$/, '');
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push({ entry: normalized, lineText: dir.lineText || `${normalized}/` });
  }
  return deduped;
}

function resolveStructurePath(baseDir, entry) {
  if (entry.startsWith('./')) return join(baseDir, entry.slice(2));
  return join(baseDir, entry);
}

function parseCommandRows(content) {
  const section = extractSection(content, 'COMMANDS');
  if (!section) return [];
  const rows = [];
  const sectionLines = section.split('\n');
  for (let index = 0; index < sectionLines.length; index += 1) {
    const line = sectionLines[index];
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    if (/^\|\s*-+/.test(trimmed)) continue;
    if (/^\|\s*Command\s*\|/i.test(trimmed)) continue;
    const cells = trimmed.split('|').map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 2) continue;
    rows.push({
      command: cells[0].replace(/`/g, ''),
      purpose: cells[1].replace(/`/g, ''),
      lineNumber: index + 1,
      lineText: trimmed,
    });
  }
  return rows;
}

function extractFileReferences(text) {
  const refs = [];
  const pathRefRe = /([A-Za-z0-9._-]+\/[A-Za-z0-9._/-]*\.(?:mjs|js|cjs|sh|ts|tsx|json|ya?ml))/g;
  const bareRefRe = /(?:^|[\s(])([A-Za-z0-9._-]+\.(?:mjs|cjs|sh|json|ya?ml))(?=[\s),]|$)/g;

  for (const match of text.matchAll(pathRefRe)) refs.push(match[1]);
  for (const match of text.matchAll(bareRefRe)) refs.push(match[1]);

  return [...new Set(refs)];
}

function commandRefExists(baseDir, ref) {
  const candidates = [];
  if (ref.includes('/')) {
    candidates.push(join(ROOT, ref));
    candidates.push(join(baseDir, ref));
  } else {
    candidates.push(join(baseDir, ref));
    candidates.push(join(ROOT, ref));
    candidates.push(join(ROOT, 'scripts', ref));
  }
  return candidates.some((candidate) => existsSync(candidate));
}

function actualForClaimType(type) {
  if (type === 'package_count') {
    return countImmediateDirectories(join(ROOT, 'packages'));
  }
  if (type === 'script_count') {
    return countFilesRecursive(join(ROOT, 'scripts'), (name) => name.endsWith('.mjs'));
  }
  if (type === 'agent_count') {
    return countFilesRecursive(join(ROOT, 'opencode-config', 'agents'), (name) => name.endsWith('.md'));
  }
  if (type === 'skill_count') {
    return countImmediateDirectories(join(ROOT, 'opencode-config', 'skills'));
  }
  return null;
}

function analyzeAgentsFile(absPath) {
  const relPath = normalizeRelPath(absPath);
  const baseDir = dirname(absPath);

  let content;
  try {
    content = readFileSync(absPath, 'utf-8');
  } catch (error) {
    return {
      file: relPath,
      countDrifts: [],
      directoryDrifts: [],
      commandDrifts: [{ command: '(read-failure)', reference: '-', detail: `Failed to read file: ${error.message}` }],
    };
  }

  const countDrifts = [];
  for (const claim of parseCountClaims(content)) {
    const actual = actualForClaimType(claim.type);
    if (actual == null || claim.documented === actual) continue;
    countDrifts.push({
      claim: claim.label,
      documented: claim.documented,
      actual,
      delta: actual - claim.documented,
      lineNumber: claim.lineNumber,
      lineText: claim.lineText,
    });
  }

  const directoryDrifts = [];
  for (const dirEntry of parseStructureDirectories(content, baseDir)) {
    const expectedDir = resolveStructurePath(baseDir, dirEntry.entry);
    if (!existsSync(expectedDir)) {
      directoryDrifts.push({
        entry: `${dirEntry.entry}/`,
        expected: normalizeRelPath(expectedDir),
        lineText: dirEntry.lineText,
      });
    }
  }

  const commandDrifts = [];
  for (const row of parseCommandRows(content)) {
    const refs = [
      ...extractFileReferences(row.command),
      ...extractFileReferences(row.purpose),
    ];

    for (const ref of refs) {
      if (commandRefExists(baseDir, ref)) continue;
      commandDrifts.push({
        command: row.command,
        reference: ref,
        detail: `Referenced file not found: ${ref}`,
        lineText: row.lineText,
      });
    }
  }

  return { file: relPath, countDrifts, directoryDrifts, commandDrifts };
}

function renderCountTable(countDrifts) {
  if (countDrifts.length === 0) return '';
  const rows = [
    '| Claim | Documented | Actual | Delta |',
    '|-------|-----------|--------|-------|',
    ...countDrifts.map((entry) => {
      const delta = entry.delta >= 0 ? `+${entry.delta}` : `${entry.delta}`;
      return `| ${entry.claim} | ${entry.documented} | ${entry.actual} | ${delta} |`;
    }),
  ];
  return rows.join('\n');
}

function renderReport(results) {
  const drifted = results.filter((item) => item.countDrifts.length > 0 || item.directoryDrifts.length > 0 || item.commandDrifts.length > 0);
  const totalIssues = drifted.reduce(
    (sum, item) => sum + item.countDrifts.length + item.directoryDrifts.length + item.commandDrifts.length,
    0,
  );

  const lines = [];
  lines.push(`# AGENTS.md Drift Report — ${DATE_STAMP}`);
  lines.push('');
  lines.push('## Summary');
  if (drifted.length === 0) {
    lines.push('No drift detected across scanned AGENTS.md files.');
  } else {
    lines.push(`Found ${totalIssues} drift issues across ${drifted.length} AGENTS.md files.`);
  }
  lines.push('');
  lines.push('## Drift Details');
  lines.push('');

  if (drifted.length === 0) {
    lines.push('No drift details to report.');
    lines.push('');
  } else {
    for (const item of drifted) {
      lines.push(`### ${item.file}`);
      if (item.countDrifts.length > 0) {
        lines.push(renderCountTable(item.countDrifts));
        lines.push('');
      }
      if (item.directoryDrifts.length > 0) {
        lines.push('- Missing directories declared in STRUCTURE:');
        for (const drift of item.directoryDrifts) {
          lines.push(`  - ${drift.entry} -> expected at ${drift.expected}`);
        }
        lines.push('');
      }
      if (item.commandDrifts.length > 0) {
        lines.push('- Invalid command file references:');
        for (const drift of item.commandDrifts) {
          lines.push(`  - \`${drift.command}\` references \`${drift.reference}\` (${drift.detail})`);
        }
        lines.push('');
      }
    }
  }

  lines.push('## Proposed Fixes');
  lines.push('');

  if (drifted.length === 0) {
    lines.push('- No fixes needed.');
  } else {
    for (const item of drifted) {
      lines.push(`### ${item.file}`);
      if (item.countDrifts.length > 0) {
        lines.push('```diff');
        for (const drift of item.countDrifts) {
          const updatedLine = drift.lineText.replace(/\d+/, String(drift.actual));
          lines.push(`- ${drift.lineText.trim()}`);
          lines.push(`+ ${updatedLine.trim()}`);
        }
        lines.push('```');
        lines.push('');
      }
      if (item.directoryDrifts.length > 0) {
        for (const drift of item.directoryDrifts) {
          lines.push('```diff');
          lines.push(`- ${drift.lineText || drift.entry}`);
          lines.push(`+ (remove this STRUCTURE entry; directory missing at ${drift.expected})`);
          lines.push('```');
        }
        lines.push('');
      }
      if (item.commandDrifts.length > 0) {
        for (const drift of item.commandDrifts) {
          lines.push('```diff');
          lines.push(`- ${drift.lineText || drift.command}`);
          lines.push(`+ (update COMMANDS row to remove or replace missing path: ${drift.reference})`);
          lines.push('```');
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n').trimEnd() + '\n';
}

function resolveUniqueOutputPath(path) {
  if (!existsSync(path)) return path;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const extIndex = path.lastIndexOf('.');
  if (extIndex === -1) return `${path}-${timestamp}`;
  return `${path.slice(0, extIndex)}-${timestamp}${path.slice(extIndex)}`;
}

function run() {
  const agentFiles = walkFiles(ROOT, 'AGENTS.md');
  const results = agentFiles.map(analyzeAgentsFile);
  const report = renderReport(results);
  const driftFound = results.some((item) => item.countDrifts.length > 0 || item.directoryDrifts.length > 0 || item.commandDrifts.length > 0);

  if (!driftFound) {
    console.error('[check-agents-drift] No drift found.');
    process.exit(0);
  }

  if (DRY_RUN) {
    console.error(`[check-agents-drift] [dry-run] Drift found. Would write report to ${normalizeRelPath(REPORT_PATH)} and proposal to ${normalizeRelPath(PROPOSAL_PATH)}`);
    console.log(report);
    process.exit(0);
  }

  if (!existsSync(PROPOSALS_DIR)) {
    mkdirSync(PROPOSALS_DIR, { recursive: true });
  }
  const reportPath = resolveUniqueOutputPath(REPORT_PATH);
  const proposalPath = resolveUniqueOutputPath(PROPOSAL_PATH);
  writeFileSync(reportPath, report, 'utf-8');
  writeFileSync(proposalPath, report, 'utf-8');
  console.error(`[check-agents-drift] Drift found. Report written to ${normalizeRelPath(reportPath)}; proposal written to ${normalizeRelPath(proposalPath)}`);
  process.exit(0);
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  run();
}

export { analyzeAgentsFile, extractSection, parseCountClaims, parseCommandRows, parseStructureDirectories, renderReport, run };
