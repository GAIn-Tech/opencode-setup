#!/usr/bin/env node
/**
 * check-agents-drift.mjs — Compare AGENTS.md documented claims against
 * filesystem reality. Generates proposed diffs when drift is detected.
 *
 * Output: Drift report to stdout + .sisyphus/proposals/agents-drift-YYYY-MM-DD.md
 *
 * Usage:
 *   node scripts/check-agents-drift.mjs          # Human-readable report
 *   node scripts/check-agents-drift.mjs --json   # Machine-readable JSON
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRoot } from './resolve-root.mjs';

const __filename = fileURLToPath(import.meta.url);

const ROOT = resolveRoot();
const args = process.argv.slice(2);
const JSON_OUTPUT = args.includes('--json');

// --- Helpers ---

/**
 * Count directories in a path (non-recursive, excludes node_modules/.files).
 */
function countDirs(dirPath) {
  if (!existsSync(dirPath)) return 0;
  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .length;
  } catch {
    return 0;
  }
}

/**
 * Count files matching an extension in a directory (non-recursive).
 */
function countFilesByExt(dirPath, ext) {
  if (!existsSync(dirPath)) return 0;
  try {
    return readdirSync(dirPath)
      .filter(name => name.endsWith(ext))
      .length;
  } catch {
    return 0;
  }
}

/**
 * Count files in a directory, excluding .gitkeep (non-recursive).
 */
function countFiles(dirPath) {
  if (!existsSync(dirPath)) return 0;
  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .filter(e => e.isFile() && e.name !== '.gitkeep')
      .length;
  } catch {
    return 0;
  }
}

/**
 * Count all files recursively in a directory, excluding .gitkeep and node_modules.
 */
function countFilesRecursive(dirPath, excludeDirs = ['node_modules', '.next', '.git']) {
  if (!existsSync(dirPath)) return 0;
  let count = 0;
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (excludeDirs.includes(entry.name)) continue;
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        count += countFilesRecursive(fullPath, excludeDirs);
      } else if (entry.name !== '.gitkeep') {
        count++;
      }
    }
  } catch { /* ignore */ }
  return count;
}

/**
 * Count subdirectories in a path (non-recursive).
 */
function countSubdirs(dirPath) {
  if (!existsSync(dirPath)) return 0;
  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .length;
  } catch {
    return 0;
  }
}

/**
 * Extract numeric claims from AGENTS.md text using known patterns.
 */
function extractNumericClaims(content, filePath) {
  const claims = [];
  const relPath = relative(ROOT, filePath).replace(/\\/g, '/');

  // Pattern: "N workspace packages" or "# N packages"
  const pkgMatch = content.match(/(\d+)\s+(?:workspace\s+)?packages?\b/i);
  if (pkgMatch) {
    claims.push({
      claim: 'Package count',
      documented: parseInt(pkgMatch[1], 10),
      countFn: () => countDirs(join(ROOT, 'packages')),
    });
  }

  // Pattern: "N .mjs infrastructure scripts" or "N scripts"
  const scriptMatch = content.match(/(\d+)\s+\.mjs\s+(?:infrastructure\s+)?scripts?\b/i);
  if (scriptMatch) {
    claims.push({
      claim: 'Script count (.mjs)',
      documented: parseInt(scriptMatch[1], 10),
      countFn: () => countFilesByExt(join(ROOT, 'scripts'), '.mjs'),
    });
  }

  // Pattern: "N external plugins"
  const pluginMatch = content.match(/(\d+)\s+external\s+(?:OpenCode\s+)?plugins?\b/i);
  if (pluginMatch) {
    claims.push({
      claim: 'Plugin count',
      documented: parseInt(pluginMatch[1], 10),
      countFn: () => countDirs(join(ROOT, 'plugins')),
    });
  }

  // Pattern: "N agent definitions"
  const agentMatch = content.match(/(\d+)\s+agent\s+definitions?\b/i);
  if (agentMatch) {
    claims.push({
      claim: 'Agent definitions',
      documented: parseInt(agentMatch[1], 10),
      countFn: () => countFiles(join(ROOT, 'opencode-config', 'agents')),
    });
  }

  // Pattern: "N skill definitions"
  const skillMatch = content.match(/(\d+)\s+skill\s+definitions?\b/i);
  if (skillMatch) {
    claims.push({
      claim: 'Skill definitions',
      documented: parseInt(skillMatch[1], 10),
      countFn: () => countDirs(join(ROOT, 'opencode-config', 'skills')),
    });
  }

  // Pattern: "N files across N subdirectories"
  const filesMatch = content.match(/(\d+)\s+files?\s+across\s+(\d+)\s+subdirector/i);
  if (filesMatch) {
    claims.push({
      claim: 'Total files',
      documented: parseInt(filesMatch[1], 10),
      countFn: () => countFilesRecursive(join(ROOT, 'opencode-config')),
    });
    claims.push({
      claim: 'Subdirectory count',
      documented: parseInt(filesMatch[2], 10),
      countFn: () => countSubdirs(join(ROOT, 'opencode-config')),
    });
  }

  // Pattern: "N named agents"
  const namedAgentMatch = content.match(/(\d+)\s+named\s+agents?\b/i);
  if (namedAgentMatch) {
    claims.push({
      claim: 'Named agents',
      documented: parseInt(namedAgentMatch[1], 10),
      countFn: () => countFiles(join(ROOT, 'opencode-config', 'agents')),
    });
  }

  // Pattern: "N skills" (standalone, e.g. "46 skills")
  const skillsStandalone = content.match(/(\d+)\s+skills?\b(?!\s+definitions?)/i);
  if (skillsStandalone && !skillMatch) {
    claims.push({
      claim: 'Skills',
      documented: parseInt(skillsStandalone[1], 10),
      countFn: () => countDirs(join(ROOT, 'opencode-config', 'skills')),
    });
  }

  // Pattern: "N tests" or "N assertions"
  const testMatch = content.match(/(\d+)\s+tests?\b/i);
  // We don't verify test counts — they change too often. Skip.

  return claims;
}

/**
 * Recursively find AGENTS.md files, skipping excluded directories.
 */
function findAgentsMdFiles(dir, excludeDirs = ['node_modules', '.next', '.git', '.worktrees', 'local']) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    if (excludeDirs.includes(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findAgentsMdFiles(fullPath, excludeDirs));
    } else if (entry.name === 'AGENTS.md') {
      results.push(fullPath);
    }
  }
  return results;
}

// --- Main ---

function checkDrift() {
  const agentsMdFiles = findAgentsMdFiles(ROOT);
  const report = {
    date: new Date().toISOString().split('T')[0],
    files: [],
    total_drift: 0,
    total_ok: 0,
  };

  for (const mdPath of agentsMdFiles) {
    const relPath = relative(ROOT, mdPath).replace(/\\/g, '/');
    let content;
    try {
      content = readFileSync(mdPath, 'utf-8');
    } catch {
      continue;
    }

    const claims = extractNumericClaims(content, mdPath);
    const fileReport = {
      file: relPath,
      checks: [],
    };

    for (const claim of claims) {
      const actual = claim.countFn();
      const delta = actual - claim.documented;
      const status = delta === 0 ? 'OK' : 'DRIFT';
      fileReport.checks.push({
        claim: claim.claim,
        documented: claim.documented,
        actual,
        delta,
        status,
      });
      if (status === 'DRIFT') report.total_drift++;
      else report.total_ok++;
    }

    if (fileReport.checks.length > 0) {
      report.files.push(fileReport);
    }
  }

  return report;
}

function formatReport(report) {
  const lines = [];
  lines.push(`AGENTS.md Drift Report — ${report.date}`);
  lines.push('='.repeat(50));
  lines.push('');

  for (const fileReport of report.files) {
    lines.push(fileReport.file);
    for (const check of fileReport.checks) {
      const deltaStr = check.delta > 0 ? `+${check.delta}` : `${check.delta}`;
      const icon = check.status === 'OK' ? 'OK' : `DRIFT (${deltaStr})`;
      lines.push(`  ${check.claim}: documented=${check.documented}, actual=${check.actual} — ${icon}`);
    }
    lines.push('');
  }

  lines.push(`Summary: ${report.total_drift} drift issues, ${report.total_ok} OK across ${report.files.length} files.`);
  return lines.join('\n');
}

/**
 * Find the line in AGENTS.md content that contains a specific numeric value
 * in context of a claim, and return the surrounding context for a diff.
 */
function findClaimLine(content, documented) {
  const lines = content.split('\n');
  const docStr = String(documented);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(docStr)) {
      const start = Math.max(0, i - 1);
      const end = Math.min(lines.length, i + 2);
      return {
        lineNumber: i + 1,
        original: lines.slice(start, end).join('\n'),
        targetLine: lines[i],
        targetIndex: i,
      };
    }
  }
  return null;
}

function generateProposal(report) {
  const lines = [];
  lines.push(`# AGENTS.md Drift Proposals — ${report.date}`);
  lines.push('');
  lines.push(`> Auto-generated by \`scripts/check-agents-drift.mjs\`.`);
  lines.push(`> Review and apply manually. Do NOT auto-commit.`);
  lines.push('');

  for (const fileReport of report.files) {
    const driftChecks = fileReport.checks.filter(c => c.status === 'DRIFT');
    if (driftChecks.length === 0) continue;

    lines.push(`## ${fileReport.file}`);
    lines.push('');
    lines.push('| Claim | Documented | Actual | Delta |');
    lines.push('|-------|-----------|--------|-------|');
    for (const check of driftChecks) {
      const deltaStr = check.delta > 0 ? `+${check.delta}` : `${check.delta}`;
      lines.push(`| ${check.claim} | ${check.documented} | ${check.actual} | ${deltaStr} |`);
    }
    lines.push('');

    // Generate proposed markdown diffs with surrounding context
    lines.push('### Proposed Diffs');
    lines.push('');

    let content = null;
    try {
      content = readFileSync(join(ROOT, fileReport.file), 'utf-8');
    } catch { /* file unreadable — fall back to simple format */ }

    for (const check of driftChecks) {
      lines.push(`**${check.claim}** (line context):`);
      lines.push('');

      if (content) {
        const match = findClaimLine(content, check.documented);
        if (match) {
          const proposed = match.targetLine.replace(
            String(check.documented),
            String(check.actual)
          );
          lines.push('```diff');
          lines.push(`@@ ${fileReport.file}:${match.lineNumber} @@`);
          lines.push(`- ${match.targetLine}`);
          lines.push(`+ ${proposed}`);
          lines.push('```');
        } else {
          lines.push(`Change \`${check.documented}\` to \`${check.actual}\` (line not located)`);
        }
      } else {
        lines.push(`Change \`${check.documented}\` to \`${check.actual}\``);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// --- Entry point ---

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  const report = checkDrift();

  if (JSON_OUTPUT) {
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  console.log(formatReport(report));

  // Write proposal file if drift found
  if (report.total_drift > 0) {
    const proposalsDir = join(ROOT, '.sisyphus', 'proposals');
    if (!existsSync(proposalsDir)) mkdirSync(proposalsDir, { recursive: true });

    const proposalPath = join(proposalsDir, `agents-drift-${report.date}.md`);
    writeFileSync(proposalPath, generateProposal(report), 'utf-8');
    console.log(`\nProposal written to: ${relative(ROOT, proposalPath)}`);
  }

  process.exit(0);
}

export { checkDrift };
