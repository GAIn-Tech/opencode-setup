#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { resolvePath } from './resolve-root.mjs';

const API_ROOT = resolvePath('packages', 'opencode-dashboard', 'src', 'app', 'api');
const TS_FILE_EXTENSIONS = new Set(['.ts', '.tsx']);
const FORBIDDEN_PATH_PATTERN = /(?:^|\/)opencode-model-manager\/(?:src|lib)\//;

function collectTypeScriptFiles(dirPath, results = []) {
  if (!fs.existsSync(dirPath)) return results;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectTypeScriptFiles(fullPath, results);
      continue;
    }

    if (entry.isFile() && TS_FILE_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results;
}

function extractSpecifiersFromLine(line) {
  const matches = [];

  const importRegex = /\bimport\s+(?:type\s+)?(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  const requireRegex = /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const regex of [importRegex, requireRegex]) {
    let match = regex.exec(line);
    while (match) {
      matches.push(match[1]);
      match = regex.exec(line);
    }
  }

  return matches;
}

function isForbiddenImport(specifier) {
  const normalized = specifier.replace(/\\/g, '/');
  return FORBIDDEN_PATH_PATTERN.test(normalized);
}

function findViolations(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const violations = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const specifiers = extractSpecifiersFromLine(line);

    for (const specifier of specifiers) {
      if (!isForbiddenImport(specifier)) continue;
      violations.push({
        lineNumber: index + 1,
        lineText: line.trim(),
        specifier
      });
    }
  }

  return violations;
}

function main() {
  const files = collectTypeScriptFiles(API_ROOT);
  const allViolations = [];

  for (const filePath of files) {
    const violations = findViolations(filePath);
    if (violations.length === 0) continue;

    allViolations.push({
      filePath,
      violations
    });
  }

  if (allViolations.length === 0) {
    console.log(`boundary-enforce: PASS (${files.length} TypeScript file${files.length === 1 ? '' : 's'} scanned)`);
    process.exit(0);
  }

  const violationCount = allViolations.reduce((count, entry) => count + entry.violations.length, 0);

  console.error(
    `boundary-enforce: FAIL (${violationCount} violation${violationCount === 1 ? '' : 's'} in ${allViolations.length} file${allViolations.length === 1 ? '' : 's'})`
  );

  for (const entry of allViolations) {
    const relativePath = path.relative(resolvePath(), entry.filePath).replace(/\\/g, '/');
    console.error(`\n- ${relativePath}`);

    for (const violation of entry.violations) {
      console.error(`  line ${violation.lineNumber}: ${violation.lineText}`);
      console.error(`  forbidden import: '${violation.specifier}'`);
      console.error("  fix: Use package entrypoint import: 'opencode-model-manager' (or 'opencode-model-manager/index.js')");
    }
  }

  process.exit(1);
}

main();
