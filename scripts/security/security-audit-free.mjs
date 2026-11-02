#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const STRICT = !process.argv.includes('--allow-missing-tools');
const MODE_FROM_ENV = String(process.env.OPENCODE_SECURITY_AUDIT_MODE || '').trim().toLowerCase();
const ADVISORY = process.argv.includes('--advisory') || MODE_FROM_ENV === 'advisory';

function toPosix(p) {
  return p.replace(/\\/g, '/');
}

function wildcardToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '::DOUBLE_STAR::')
    .replace(/\*/g, '[^/]*')
    .replace(/::DOUBLE_STAR::/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function loadSecretIgnoreMatchers() {
  const ignorePath = path.join(ROOT, 'security', 'secret-scan-ignore.txt');
  if (!fs.existsSync(ignorePath)) return [];
  const lines = fs
    .readFileSync(ignorePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
  return lines.map((line) => ({ pattern: line, regex: wildcardToRegex(line) }));
}

function run(cmd, args, cwd = ROOT) {
  return spawnSync(cmd, args, {
    cwd,
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 180000,
  });
}

function semgrepScan() {
  const rules = path.join(ROOT, 'security', 'semgrep_rules.yml');
  if (!fs.existsSync(rules)) {
    return { ok: false, reason: `rules_missing:${rules}`, findings: 0 };
  }

  const res = run('semgrep', ['scan', '--config', rules, '--json', 'packages']);
  if (res.error) {
    return {
      ok: !STRICT,
      reason: STRICT ? 'semgrep_not_available' : 'semgrep_not_available_soft',
      findings: 0,
    };
  }

  let parsed = { results: [] };
  try {
    parsed = JSON.parse(res.stdout || '{}');
  } catch {
    return { ok: false, reason: 'semgrep_invalid_json', findings: 0 };
  }

  const findings = Array.isArray(parsed.results) ? parsed.results.length : 0;
  const high = (parsed.results || []).filter((r) => {
    const sev = String(r?.extra?.severity || '').toUpperCase();
    return sev === 'ERROR' || sev === 'HIGH';
  }).length;

  return {
    ok: res.status === 0 || res.status === 1,
    reason: res.status === 0 || res.status === 1 ? 'ok' : `semgrep_exit_${res.status}`,
    findings,
    high,
  };
}

function dependencyScan() {
  const lockfiles = [
    path.join(ROOT, 'package-lock.json'),
    path.join(ROOT, 'pnpm-lock.yaml'),
    path.join(ROOT, 'yarn.lock'),
  ].filter((p) => fs.existsSync(p));

  if (lockfiles.length === 0) {
    return { ok: true, reason: 'no_root_lockfile', findings: 0 };
  }

  const npmAudit = run('npm', ['audit', '--json']);
  if (npmAudit.error) {
    return {
      ok: !STRICT,
      reason: STRICT ? 'npm_audit_not_available' : 'npm_audit_not_available_soft',
      findings: 0,
    };
  }

  let parsed = {};
  try {
    parsed = JSON.parse(npmAudit.stdout || '{}');
  } catch {
    return { ok: false, reason: 'npm_audit_invalid_json', findings: 0 };
  }

  const vulns = parsed?.metadata?.vulnerabilities || {};
  const total = Object.values(vulns).reduce((sum, n) => sum + Number(n || 0), 0);
  return {
    ok: npmAudit.status === 0,
    reason: npmAudit.status === 0 ? 'ok' : `npm_audit_exit_${npmAudit.status}`,
    findings: total,
    vulnerabilities: vulns,
  };
}

function secretHeuristicScan() {
  const includeExt = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.yml', '.yaml', '.md', '.env']);
  const denyDirs = new Set(['.git', 'node_modules', '.next', 'dist', 'build', '.turbo']);
  const patterns = [
    /AKIA[0-9A-Z]{16}/g,
    /(api[_-]?key|secret|token)\s*[:=]\s*['"][^'\"]{16,}['"]/gi,
  ];

  const suspects = [];
  const ignoreMatchers = loadSecretIgnoreMatchers();

  function isIgnored(relPath) {
    const p = toPosix(relPath);
    if (
      p.endsWith('.test.ts') ||
      p.endsWith('.test.tsx') ||
      p.endsWith('.spec.ts') ||
      p.endsWith('.spec.tsx') ||
      p.includes('/test/') ||
      p.includes('/tests/') ||
      p === 'setup-instructions.md'
    ) {
      return true;
    }
    return ignoreMatchers.some((m) => m.regex.test(p));
  }

  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (denyDirs.has(entry.name)) continue;
        walk(abs);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!includeExt.has(ext) && entry.name !== '.env') continue;
      const rel = path.relative(ROOT, abs);
      if (isIgnored(rel)) continue;
      let content = '';
      try {
        content = fs.readFileSync(abs, 'utf8');
      } catch {
        continue;
      }
      for (const pat of patterns) {
        if (pat.test(content)) {
          suspects.push(rel);
          break;
        }
      }
    }
  }

  walk(ROOT);
  return {
    ok: suspects.length === 0,
    reason: suspects.length === 0 ? 'clean' : 'potential_secrets_found',
    findings: suspects.length,
    suspects: suspects.slice(0, 25),
  };
}

function main() {
  const semgrep = semgrepScan();
  const deps = dependencyScan();
  const secrets = secretHeuristicScan();

  const ok = semgrep.ok && deps.ok && secrets.ok && Number(semgrep.high || 0) === 0;
  const reportId = `security-free-${Date.now()}`;
  const signatureInput = JSON.stringify({ semgrep, deps, secrets, strict: STRICT, advisory: ADVISORY });
  const signature = crypto.createHash('sha256').update(signatureInput).digest('hex');

  const report = {
    report_id: reportId,
    report_type: 'security-audit-free',
    generated_at: new Date().toISOString(),
    strict: STRICT,
    advisory: ADVISORY,
    summary: {
      ok,
      semgrep,
      dependencies: deps,
      secrets,
    },
    signature: {
      algorithm: 'sha256',
      value: signature,
    },
  };

  const outDir = path.join(ROOT, 'reports', 'security');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'security-audit-free.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log(JSON.stringify({ status: ok ? 'pass' : 'fail', outPath, strict: STRICT, advisory: ADVISORY }, null, 2));
  if (!ok && !ADVISORY) {
    process.exit(1);
  }
}

main();
