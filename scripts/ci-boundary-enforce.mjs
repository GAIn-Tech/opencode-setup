#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const SOURCE_FILE_EXTENSIONS = new Set(['.js', '.mjs', '.ts', '.tsx']);
const PACKAGES_DIRNAME = 'packages';
const MODELS_PACKAGE_NAME = 'opencode-model-manager';
const FORBIDDEN_PATH_PATTERN = /(?:^|\/)opencode-model-manager\/(?:src|lib)\//;

function collectSourceFiles(dirPath, results = []) {
  if (!fs.existsSync(dirPath)) return results;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(fullPath, results);
      continue;
    }

    if (entry.isFile() && SOURCE_FILE_EXTENSIONS.has(path.extname(entry.name))) {
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

function collectPackageSourceFiles(projectRoot) {
  const packagesDir = path.join(projectRoot, PACKAGES_DIRNAME);
  if (!fs.existsSync(packagesDir)) return [];

  const packageEntries = fs.readdirSync(packagesDir, { withFileTypes: true });
  const files = [];

  for (const entry of packageEntries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === MODELS_PACKAGE_NAME) continue;

    const sourceDir = path.join(packagesDir, entry.name, 'src');
    collectSourceFiles(sourceDir, files);
  }

  return files;
}

function parseArgs(argv) {
  let rootDir = process.cwd();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--root') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('Missing value for --root');
      }

      rootDir = path.resolve(value);
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { rootDir };
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
  let rootDir;
  try {
    ({ rootDir } = parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(`boundary-enforce: ${error.message}`);
    process.exit(1);
  }

  const files = collectPackageSourceFiles(rootDir);
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
    console.log(`boundary-enforce: PASS (${files.length} source file${files.length === 1 ? '' : 's'} scanned)`);
    process.exit(0);
  }

  const violationCount = allViolations.reduce((count, entry) => count + entry.violations.length, 0);

  console.error(
    `boundary-enforce: FAIL (${violationCount} violation${violationCount === 1 ? '' : 's'} in ${allViolations.length} file${allViolations.length === 1 ? '' : 's'})`
  );

  for (const entry of allViolations) {
    const relativePath = path.relative(rootDir, entry.filePath).replace(/\\/g, '/');
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
