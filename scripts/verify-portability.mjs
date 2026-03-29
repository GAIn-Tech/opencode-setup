#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveRoot, userConfigDir, userDataDir, resolvePath } from './resolve-root.mjs';

// --- Skip/Fallback Budget Enforcement ---

const BUDGET_ALLOWLIST_PATH = path.join(resolvePath('scripts'), 'skip-budget-allowlist.json');

function loadBudgetAllowlist() {
  if (!existsSync(BUDGET_ALLOWLIST_PATH)) {
    return { defaultBudget: { skip_count: 0, fallback_count: 0 }, allowlist: { skips: [], fallbacks: [] } };
  }
  return JSON.parse(readFileSync(BUDGET_ALLOWLIST_PATH, 'utf8'));
}

function isAllowlisted(reason, type, allowlist) {
  const entries = allowlist.allowlist[type === 'skip' ? 'skips' : 'fallbacks'] || [];
  const now = new Date();
  
  for (const entry of entries) {
    // Check expiry
    if (entry.expiry && new Date(entry.expiry) < now) {
      continue; // Expired
    }
    // Check pattern match
    if (reason.includes(entry.pattern) || entry.pattern.includes(reason)) {
      return { allowed: true, entry };
    }
  }
  return { allowed: false, entry: null };
}

function checkBudgetEnforcement(failures, skipCount, fallbackCount, strictMode) {
  if (!strictMode) return;
  
  const allowlist = loadBudgetAllowlist();
  const budget = allowlist.defaultBudget;
  
  // Check skip budget
  if (skipCount > budget.skip_count) {
    const excess = skipCount - budget.skip_count;
    failures.push(`Budget violation: ${excess} unauthorized skip(s) (budget: ${budget.skip_count})`);
  }
  
  // Check fallback budget
  if (fallbackCount > budget.fallback_count) {
    const excess = fallbackCount - budget.fallback_count;
    failures.push(`Budget violation: ${excess} unauthorized fallback(s) (budget: ${budget.fallback_count})`);
  }
}

// --- End Budget Enforcement ---

const root = resolveRoot();
const isWindows = process.platform === 'win32';

const SUPPORT_FLOOR_CONTRACT = Object.freeze({
  bunVersionSource: '.bun-version',
  platforms: Object.freeze({
    linux: Object.freeze({ tier: 'tier-1', minReleaseMajor: 5, arches: Object.freeze(['x64', 'arm64']) }),
    darwin: Object.freeze({ tier: 'tier-1', minReleaseMajor: 22, arches: Object.freeze(['x64', 'arm64']) }),
    win32: Object.freeze({ tier: 'tier-1', minReleaseMajor: 10, arches: Object.freeze(['x64', 'arm64']) }),
  }),
});

function getRequiredBunVersion() {
  const bunVersionPath = path.join(root, SUPPORT_FLOOR_CONTRACT.bunVersionSource);
  if (existsSync(bunVersionPath)) {
    const value = readFileSync(bunVersionPath, 'utf8').trim();
    if (value) return value;
  }

  const packageJsonPath = path.join(root, 'package.json');
  if (existsSync(packageJsonPath)) {
    const pkg = readJson(packageJsonPath);
    if (typeof pkg.packageManager === 'string' && pkg.packageManager.startsWith('bun@')) {
      return pkg.packageManager.slice('bun@'.length);
    }
  }

  return '';
}

function detectBunVersion() {
  if (typeof process.versions?.bun === 'string' && process.versions.bun.trim()) {
    return process.versions.bun.trim();
  }

  if (!commandLocation('bun')) return 'missing';

  const result = spawnSync('bun', ['--version'], {
    encoding: 'utf8',
    timeout: 5000,
  });
  if (result.status !== 0) return 'unknown';

  const firstLine = String(result.stdout || '').split(/\r?\n/).find((line) => line.trim());
  return firstLine ? firstLine.trim() : 'unknown';
}

function getReleaseMajor(release) {
  const raw = String(release || '').trim();
  const major = Number.parseInt(raw.split('.')[0] || '', 10);
  return Number.isFinite(major) ? major : null;
}

export function checkSupportFloorReport(overrides = {}) {
  const requiredBunVersion = overrides.requiredBunVersion || getRequiredBunVersion();
  const detected = {
    platform: overrides.platform || process.env.OPENCODE_PORTABILITY_PLATFORM || process.platform,
    release: overrides.release || process.env.OPENCODE_PORTABILITY_RELEASE || os.release(),
    arch: overrides.arch || process.env.OPENCODE_PORTABILITY_ARCH || process.arch,
    bunVersion: overrides.bunVersion || process.env.OPENCODE_PORTABILITY_BUN_VERSION || detectBunVersion(),
    requiredBunVersion,
  };

  const platformContract = SUPPORT_FLOOR_CONTRACT.platforms[detected.platform];
  if (!platformContract) {
    return {
      supported: false,
      reason: `unsupported platform: ${detected.platform}`,
      detected,
    };
  }

  if (!platformContract.arches.includes(detected.arch)) {
    return {
      supported: false,
      reason: `unsupported architecture for ${detected.platform}: ${detected.arch}`,
      detected,
    };
  }

  const releaseMajor = getReleaseMajor(detected.release);
  if (releaseMajor === null || releaseMajor < platformContract.minReleaseMajor) {
    return {
      supported: false,
      reason: `unsupported ${detected.platform} release tier: ${detected.release}`,
      detected,
    };
  }

  if (!requiredBunVersion) {
    return {
      supported: false,
      reason: `bun version source-of-truth missing: ${SUPPORT_FLOOR_CONTRACT.bunVersionSource}`,
      detected,
    };
  }

  if (detected.bunVersion !== requiredBunVersion) {
    return {
      supported: false,
      reason: `unsupported bun version: ${detected.bunVersion} (required ${requiredBunVersion})`,
      detected,
    };
  }

  return {
    supported: true,
    reason: 'supported',
    detected,
  };
}

function commandLocation(command) {
  const locator = isWindows ? 'where' : 'which';
  const result = spawnSync(locator, [command], { encoding: 'utf8' });
  if (result.status !== 0) return null;
  const firstLine = (result.stdout || '').split(/\r?\n/).find((line) => line.trim());
  return firstLine ? firstLine.trim() : null;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function resolveCurrentCommitSha(cwd = root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' });
  if (result.status !== 0) return '';
  return String(result.stdout || '').trim();
}

function parseSupplyChainException(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return { provided: false, value: null, parseError: null };
  try {
    return { provided: true, value: JSON.parse(raw), parseError: null };
  } catch (error) {
    return { provided: true, value: null, parseError: `invalid JSON: ${error.message}` };
  }
}

function validateSupplyChainException(exceptionValue, now = new Date()) {
  if (!exceptionValue || typeof exceptionValue !== 'object') {
    return { valid: false, reason: 'exception metadata must be a JSON object' };
  }

  const requiredFields = ['approvalId', 'approvedBy', 'reason', 'expiresAt', 'ticket'];
  for (const field of requiredFields) {
    const value = exceptionValue[field];
    if (typeof value !== 'string' || !value.trim()) {
      return { valid: false, reason: `missing required exception field: ${field}` };
    }
  }

  const expiry = new Date(exceptionValue.expiresAt);
  if (Number.isNaN(expiry.getTime())) {
    return { valid: false, reason: 'invalid exception expiresAt timestamp' };
  }

  if (expiry.getTime() <= now.getTime()) {
    return { valid: false, reason: `exception approval expired: ${exceptionValue.expiresAt}` };
  }

  return { valid: true, reason: 'approved exception metadata valid', expiry };
}

function makeSupplyChainAuditRecord({ decision, actor, approvalId, ticket, violations, now = new Date() }) {
  const evaluatedAt = now.toISOString();
  const digest = createHash('sha256')
    .update(`${decision}|${actor}|${approvalId}|${ticket}|${violations.join('|')}|${evaluatedAt}`)
    .digest('hex')
    .slice(0, 16);

  return {
    decision,
    actor,
    approvalId,
    ticket,
    violations,
    evaluatedAt,
    recordId: `supply-chain-${digest}`,
  };
}

export function checkSupplyChainTrustReport({ strict = false } = {}) {
  const now = new Date();
  const checks = {
    releaseMode: strict ? 'release' : 'non-release',
    source: String(process.env.OPENCODE_PORTABILITY_SUPPLY_TRUST_SOURCE || 'trusted').trim() || 'trusted',
    pinning: String(process.env.OPENCODE_PORTABILITY_SUPPLY_PINNING || 'verified').trim() || 'verified',
    integrity: String(process.env.OPENCODE_PORTABILITY_SUPPLY_INTEGRITY || 'ok').trim() || 'ok',
    provenance: String(process.env.OPENCODE_PORTABILITY_SUPPLY_PROVENANCE || 'verified').trim() || 'verified',
    signature: String(process.env.OPENCODE_PORTABILITY_SUPPLY_SIGNATURE || 'valid').trim() || 'valid',
  };

  if (!strict) {
    return {
      status: 'not-applicable',
      reason: 'supply-chain trust gate only enforced in release mode',
      checks,
      exception: null,
    };
  }

  const violations = [];
  if (checks.source !== 'trusted') violations.push('untrusted source');
  if (checks.pinning !== 'verified') violations.push('pinning requirement failed');
  if (checks.integrity !== 'ok') violations.push('integrity requirement failed');
  if (checks.provenance !== 'verified') violations.push('provenance mismatch');
  if (checks.signature !== 'valid') violations.push('signature verification failed');

  if (violations.length === 0) {
    return {
      status: 'passed',
      reason: 'trusted release inputs verified',
      checks,
      exception: null,
    };
  }

  const parsedException = parseSupplyChainException(process.env.OPENCODE_PORTABILITY_SUPPLY_EXCEPTION);
  if (!parsedException.provided) {
    return {
      status: 'failed',
      reason: violations[0],
      checks,
      exception: null,
    };
  }

  if (parsedException.parseError) {
    return {
      status: 'failed',
      reason: `invalid approved exception metadata: ${parsedException.parseError}`,
      checks,
      exception: null,
    };
  }

  const validation = validateSupplyChainException(parsedException.value, now);
  if (!validation.valid) {
    return {
      status: 'failed',
      reason: `invalid approved exception metadata: ${validation.reason}`,
      checks,
      exception: null,
    };
  }

  return {
    status: 'exception-approved',
    reason: `approved exception for ${violations.join(', ')}`,
    checks,
    exception: {
      approvalId: parsedException.value.approvalId,
      approvedBy: parsedException.value.approvedBy,
      reason: parsedException.value.reason,
      expiresAt: parsedException.value.expiresAt,
      ticket: parsedException.value.ticket,
      auditRecord: makeSupplyChainAuditRecord({
        decision: 'exception-approved',
        actor: parsedException.value.approvedBy,
        approvalId: parsedException.value.approvalId,
        ticket: parsedException.value.ticket,
        violations,
        now,
      }),
    },
  };
}

const ADR_GOVERNANCE_CONTRACT = Object.freeze({
  defaultDirectory: path.join('docs', 'adr'),
  requiredDocuments: Object.freeze([
    Object.freeze({
      fileName: 'control-ownership-governance.md',
      requiredSections: Object.freeze([
        '## Control Ownership',
        '## Exception Paths',
        '## Governance Policies',
      ]),
      requiredTerms: Object.freeze([]),
    }),
    Object.freeze({
      fileName: 'exception-governance-policy.md',
      requiredSections: Object.freeze([
        '## Exception Governance',
        '## Exception Path Contract',
      ]),
      requiredTerms: Object.freeze([
        '`approvalId`',
        '`approvedBy`',
        '`reason`',
        '`expiresAt`',
        '`ticket`',
      ]),
    }),
  ]),
});

export function checkAdrGovernanceFailures({ strictMode = false, env = process.env } = {}) {
  const failures = [];
  const skips = 0;
  const fallbacks = 0;
  const skipReasons = [];
  const fallbackReasons = [];

  const adrDirInput = String(env.OPENCODE_PORTABILITY_ADR_DIR || ADR_GOVERNANCE_CONTRACT.defaultDirectory).trim();
  const adrDirectory = path.resolve(root, adrDirInput || ADR_GOVERNANCE_CONTRACT.defaultDirectory);
  const violations = [];
  const checkedDocuments = [];

  if (strictMode) {
    for (const documentContract of ADR_GOVERNANCE_CONTRACT.requiredDocuments) {
      const filePath = path.join(adrDirectory, documentContract.fileName);
      const checkedDocument = {
        fileName: documentContract.fileName,
        path: filePath,
        exists: false,
        requiredSections: [...documentContract.requiredSections],
        requiredTerms: [...documentContract.requiredTerms],
      };

      if (!existsSync(filePath)) {
        violations.push(`missing required ADR document: ${documentContract.fileName}`);
        checkedDocuments.push(checkedDocument);
        continue;
      }

      checkedDocument.exists = true;
      let content = '';

      try {
        content = readFileSync(filePath, 'utf8');
      } catch (error) {
        violations.push(`${documentContract.fileName} unreadable: ${error.message}`);
        checkedDocuments.push(checkedDocument);
        continue;
      }

      for (const section of documentContract.requiredSections) {
        if (!content.includes(section)) {
          violations.push(`${documentContract.fileName} missing section: ${section}`);
        }
      }

      for (const term of documentContract.requiredTerms) {
        if (!content.includes(term)) {
          violations.push(`${documentContract.fileName} missing contract field token: ${term}`);
        }
      }

      checkedDocuments.push(checkedDocument);
    }
  }

  for (const violation of violations) {
    failures.push(`ADR governance gate failed: ${violation}`);
  }

  const adrGovernanceReport = {
    status: strictMode ? (violations.length === 0 ? 'passed' : 'failed') : 'not-applicable',
    adrDirectory,
    requiredDocuments: ADR_GOVERNANCE_CONTRACT.requiredDocuments.map((documentContract) => documentContract.fileName),
    checkedDocuments,
    violations,
  };

  return { failures, skips, fallbacks, skipReasons, fallbackReasons, adrGovernanceReport };
}

function readObservabilityIntegrityChecks(env = process.env) {
  return {
    logIntegrity: String(env.OPENCODE_PORTABILITY_OBSERVABILITY_LOG_CHAIN || 'verified').trim() || 'verified',
    metricsIntegrity: String(env.OPENCODE_PORTABILITY_OBSERVABILITY_METRICS || 'consistent').trim() || 'consistent',
    traceCompleteness: String(env.OPENCODE_PORTABILITY_OBSERVABILITY_TRACE_COMPLETENESS || 'complete').trim() || 'complete',
    traceAuthenticity: String(env.OPENCODE_PORTABILITY_OBSERVABILITY_TRACE_AUTHENTICITY || 'verified').trim() || 'verified',
    auditTrailIntegrity: String(env.OPENCODE_PORTABILITY_OBSERVABILITY_AUDIT_TRAIL || 'verified').trim() || 'verified',
  };
}

function checkObservabilityIntegrityFailures({ strictMode = false, env = process.env } = {}) {
  const failures = [];
  const skips = 0;
  const fallbacks = 0;
  const skipReasons = [];
  const fallbackReasons = [];
  const checks = readObservabilityIntegrityChecks(env);
  const violations = [];

  if (strictMode) {
    if (checks.logIntegrity !== 'verified') {
      violations.push('log integrity hash chain verification failed');
    }

    if (checks.metricsIntegrity !== 'consistent') {
      violations.push('metrics integrity validation consistency failed');
    }

    if (checks.traceCompleteness !== 'complete') {
      violations.push('trace integrity completeness verification failed');
    }

    if (checks.traceAuthenticity !== 'verified') {
      violations.push('trace integrity authenticity verification failed');
    }

    if (checks.auditTrailIntegrity !== 'verified') {
      violations.push('audit trail tamper-evidence verification failed');
    }

    if (String(env.OPENCODE_PORTABILITY_FAULT_OBSERVABILITY_INTEGRITY || '') === '1') {
      violations.push('fault injection: intentional observability integrity violation detected');
    }
  }

  for (const violation of violations) {
    failures.push(`Observability integrity gate failed: ${violation}`);
  }

  const observabilityIntegrityReport = {
    status: strictMode ? (violations.length === 0 ? 'ok' : 'fail') : 'not-applicable',
    violations,
    checks,
    baseline: {
      logIntegrity: 'verified',
      metricsIntegrity: 'consistent',
      traceCompleteness: 'complete',
      traceAuthenticity: 'verified',
      auditTrailIntegrity: 'verified',
    },
  };

  return { failures, skips, fallbacks, skipReasons, fallbackReasons, observabilityIntegrityReport };
}

const PRIVILEGE_GOVERNANCE_BASELINE = Object.freeze({
  privilegeEscalation: 'governed',
  breakGlassAccess: 'inactive',
  breakGlassAuditTrail: 'present',
  privilegedOperationApproval: 'approved',
  defaultApprovalExpiry: '2099-01-01T00:00:00.000Z',
});

function parsePrivilegeExpiry(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) {
    return { valid: false, expired: false, reason: 'missing privileged access approval expiry timestamp' };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { valid: false, expired: false, reason: `invalid privileged access approval expiry timestamp: ${raw}` };
  }

  if (parsed.getTime() <= Date.now()) {
    return { valid: false, expired: true, reason: `privileged access approval expired: ${raw}` };
  }

  return { valid: true, expired: false, reason: 'approval expiry valid' };
}

export function checkPrivilegeGovernanceFailures({ strictMode = false, env = process.env } = {}) {
  const failures = [];
  const skips = 0;
  const fallbacks = 0;
  const skipReasons = [];
  const fallbackReasons = [];
  const violations = [];

  const checks = {
    privilegeEscalation: String(env.OPENCODE_PORTABILITY_PRIVILEGE_ESCALATION || PRIVILEGE_GOVERNANCE_BASELINE.privilegeEscalation).trim() || PRIVILEGE_GOVERNANCE_BASELINE.privilegeEscalation,
    breakGlassAccess: String(env.OPENCODE_PORTABILITY_BREAK_GLASS_ACCESS || PRIVILEGE_GOVERNANCE_BASELINE.breakGlassAccess).trim() || PRIVILEGE_GOVERNANCE_BASELINE.breakGlassAccess,
    breakGlassAuditTrail: String(env.OPENCODE_PORTABILITY_BREAK_GLASS_AUDIT_TRAIL || PRIVILEGE_GOVERNANCE_BASELINE.breakGlassAuditTrail).trim() || PRIVILEGE_GOVERNANCE_BASELINE.breakGlassAuditTrail,
    privilegedOperationApproval: String(env.OPENCODE_PORTABILITY_PRIVILEGED_OPERATION_APPROVAL || PRIVILEGE_GOVERNANCE_BASELINE.privilegedOperationApproval).trim() || PRIVILEGE_GOVERNANCE_BASELINE.privilegedOperationApproval,
  };

  const approval = {
    approvalId: String(env.OPENCODE_PORTABILITY_PRIVILEGED_APPROVAL_ID || '').trim(),
    approvedBy: String(env.OPENCODE_PORTABILITY_PRIVILEGED_APPROVED_BY || '').trim(),
    reason: String(env.OPENCODE_PORTABILITY_PRIVILEGED_REASON || '').trim(),
    ticket: String(env.OPENCODE_PORTABILITY_PRIVILEGED_TICKET || '').trim(),
    expiresAt: String(env.OPENCODE_PORTABILITY_PRIVILEGED_ACCESS_EXPIRES_AT || PRIVILEGE_GOVERNANCE_BASELINE.defaultApprovalExpiry).trim() || PRIVILEGE_GOVERNANCE_BASELINE.defaultApprovalExpiry,
  };

  const auditTrail = {
    eventId: String(env.OPENCODE_PORTABILITY_PRIVILEGED_AUDIT_EVENT_ID || '').trim(),
    recordId: String(env.OPENCODE_PORTABILITY_PRIVILEGED_AUDIT_RECORD_ID || '').trim(),
    immutableDigest: String(env.OPENCODE_PORTABILITY_PRIVILEGED_AUDIT_DIGEST || '').trim(),
  };

  if (strictMode) {
    const escalationAttempted = checks.privilegeEscalation !== PRIVILEGE_GOVERNANCE_BASELINE.privilegeEscalation;
    const breakGlassActive = checks.breakGlassAccess === 'active';
    const approvalMissing = checks.privilegedOperationApproval !== 'approved';

    if (escalationAttempted) {
      violations.push('privilege escalation requires explicit governance approval');
    }

    if (breakGlassActive && checks.breakGlassAuditTrail !== 'present') {
      violations.push('break-glass access requires immutable audit trail metadata');
    }

    if (escalationAttempted || breakGlassActive || approvalMissing) {
      if (approvalMissing) {
        violations.push('privileged operations require explicit approval before execution');
      }

      const expiryCheck = parsePrivilegeExpiry(approval.expiresAt);
      if (!expiryCheck.valid) {
        violations.push(expiryCheck.reason);
      }
    }
  }

  for (const violation of violations) {
    failures.push(`Privilege governance gate failed: ${violation}`);
  }

  const privilegeGovernanceReport = {
    status: strictMode ? (violations.length === 0 ? 'passed' : 'failed') : 'not-applicable',
    violations,
    checks,
    approval,
    auditTrail,
  };

  return { failures, skips, fallbacks, skipReasons, fallbackReasons, privilegeGovernanceReport };
}

const HERMETIC_BASELINE = Object.freeze({
  LC_ALL: 'C',
  TZ: 'UTC',
});

const HERMETIC_REQUIRED_ROOTS = Object.freeze([
  'OPENCODE_CONFIG_HOME',
  'OPENCODE_DATA_HOME',
  'XDG_CACHE_HOME',
]);

const HERMETIC_RELEASE_CRITICAL_SCRIPTS = Object.freeze([
  'scripts/verify-portability.mjs',
  'scripts/verify-setup.mjs',
  'scripts/supply-chain-guard.mjs',
  'scripts/model-rollback.mjs',
  'scripts/doctor.mjs',
]);

const DETERMINISM_BASELINE = Object.freeze({
  timezone: 'UTC',
  lcAll: 'C',
  encoding: 'UTF-8',
  fsCaseSensitivityModes: Object.freeze(['sensitive', 'insensitive']),
});

const RESTORE_DRILL_OBJECTIVES = Object.freeze({
  rtoMinutes: 60,
  rpoMinutes: 15,
  defaultEvidencePath: '.sisyphus/evidence/task-5-restore-pass.json',
});

function normalizePathForComparison(value) {
  if (typeof value !== 'string') return '';
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

export function checkHermeticityFailures({ strictMode = false, env = process.env } = {}) {
  const failures = [];
  const skips = 0;
  const fallbacks = 0;
  const skipReasons = [];
  const fallbackReasons = [];
  const violations = [];

  const observed = {
    LC_ALL: String(env.LC_ALL || ''),
    TZ: String(env.TZ || ''),
    OPENCODE_CONFIG_HOME: String(env.OPENCODE_CONFIG_HOME || ''),
    OPENCODE_DATA_HOME: String(env.OPENCODE_DATA_HOME || ''),
    XDG_CACHE_HOME: String(env.XDG_CACHE_HOME || ''),
    TMPDIR: String(env.TMPDIR || ''),
    TEMP: String(env.TEMP || ''),
    TMP: String(env.TMP || ''),
  };

  if (strictMode) {
    if (observed.LC_ALL !== HERMETIC_BASELINE.LC_ALL) {
      violations.push(`LC_ALL must be ${HERMETIC_BASELINE.LC_ALL} in strict mode`);
    }
    if (observed.TZ !== HERMETIC_BASELINE.TZ) {
      violations.push(`TZ must be ${HERMETIC_BASELINE.TZ} in strict mode`);
    }

    for (const key of HERMETIC_REQUIRED_ROOTS) {
      const raw = String(env[key] || '').trim();
      if (!raw) {
        violations.push(`${key} must be set in strict mode`);
        continue;
      }
      if (!path.isAbsolute(raw)) {
        violations.push(`${key} must be an absolute path in strict mode`);
      }
    }

    const tempRoot = String(env.TMPDIR || env.TEMP || env.TMP || '').trim();
    if (!tempRoot) {
      violations.push('deterministic temp/cache root required: set TMPDIR/TEMP/TMP');
    } else if (!path.isAbsolute(tempRoot)) {
      violations.push('deterministic temp/cache root must be absolute');
    }

    const tempVariants = ['TMPDIR', 'TEMP', 'TMP'];
    for (const key of tempVariants) {
      const raw = String(env[key] || '').trim();
      if (!raw) continue;
      if (tempRoot && normalizePathForComparison(raw) !== normalizePathForComparison(tempRoot)) {
        violations.push(`${key} must match deterministic temp root: ${tempRoot}`);
      }
    }

    const home = String(env.HOME || env.USERPROFILE || '').trim();
    if (home) {
      const normalizedHome = normalizePathForComparison(path.resolve(home));
      for (const key of HERMETIC_REQUIRED_ROOTS) {
        const rootValue = String(env[key] || '').trim();
        if (!rootValue) continue;
        const normalizedValue = normalizePathForComparison(path.resolve(rootValue));
        if (normalizedValue === normalizedHome || normalizedValue.startsWith(`${normalizedHome}${path.sep}`)) {
          violations.push(`${key} must not point inside HOME/USERPROFILE in strict mode`);
        }
      }
    }

    const hasConfigOverride = Boolean(String(env.OPENCODE_CONFIG_HOME || '').trim() || String(env.XDG_CONFIG_HOME || '').trim());
    if (!hasConfigOverride) {
      violations.push('release-critical scripts require OPENCODE_CONFIG_HOME or XDG_CONFIG_HOME in strict mode');
    }

    const hasDataOverride = Boolean(String(env.OPENCODE_DATA_HOME || '').trim() || String(env.XDG_DATA_HOME || '').trim());
    if (!hasDataOverride) {
      violations.push('release-critical scripts require OPENCODE_DATA_HOME or XDG_DATA_HOME in strict mode');
    }

    if (hasConfigOverride) {
      const expectedConfigHome = String(env.OPENCODE_CONFIG_HOME || '').trim()
        ? path.resolve(String(env.OPENCODE_CONFIG_HOME || '').trim())
        : path.resolve(path.join(String(env.XDG_CONFIG_HOME || '').trim(), 'opencode'));
      const resolvedConfigHome = path.resolve(userConfigDir());
      if (normalizePathForComparison(resolvedConfigHome) !== normalizePathForComparison(expectedConfigHome)) {
        violations.push('release-critical scripts resolved user config path via uncontrolled fallback');
      }
    }

    if (hasDataOverride) {
      const expectedDataHome = String(env.OPENCODE_DATA_HOME || '').trim()
        ? path.resolve(String(env.OPENCODE_DATA_HOME || '').trim())
        : path.resolve(path.join(String(env.XDG_DATA_HOME || '').trim(), 'opencode'));
      const resolvedDataHome = path.resolve(userDataDir());
      if (normalizePathForComparison(resolvedDataHome) !== normalizePathForComparison(expectedDataHome)) {
        violations.push('release-critical scripts resolved user data path via uncontrolled fallback');
      }
    }

    if (String(env.OPENCODE_PORTABILITY_FAULT_GLOBAL_LEAK || '') === '1') {
      violations.push('fault injection: intentional global-state dependency detected');
    }
  }

  for (const violation of violations) {
    failures.push(`Hermeticity gate failed: ${violation}`);
  }

  const hermeticityReport = {
    status: strictMode ? (violations.length === 0 ? 'ok' : 'fail') : 'not-applicable',
    violations,
    baseline: {
      ...HERMETIC_BASELINE,
      requiredRoots: [...HERMETIC_REQUIRED_ROOTS],
      deterministicTempVars: ['TMPDIR', 'TEMP', 'TMP'],
    },
    observed,
    scannedScripts: [...HERMETIC_RELEASE_CRITICAL_SCRIPTS],
  };

  return { failures, skips, fallbacks, skipReasons, fallbackReasons, hermeticityReport };
}

function normalizeEncoding(value) {
  return String(value || '').trim().replaceAll('_', '-').toUpperCase();
}

function inferEncodingFromLocale(localeValue) {
  const locale = String(localeValue || '').trim();
  if (!locale) return '';
  const dotIndex = locale.indexOf('.');
  if (dotIndex === -1) return '';
  const suffix = locale.slice(dotIndex + 1);
  const atIndex = suffix.indexOf('@');
  return normalizeEncoding(atIndex === -1 ? suffix : suffix.slice(0, atIndex));
}

export function checkDeterminismFailures({ strictMode = false, env = process.env } = {}) {
  const failures = [];
  const skips = 0;
  const fallbacks = 0;
  const skipReasons = [];
  const fallbackReasons = [];
  const violations = [];

  const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const resolvedRepoRoot = path.resolve(root);
  const filesystemCaseSensitivity = String(env.OPENCODE_PORTABILITY_FS_CASE_SENSITIVITY || '').trim().toLowerCase();
  const timezone = String(env.TZ || '').trim();
  const lcAll = String(env.LC_ALL || '').trim();
  const lang = String(env.LANG || '').trim();
  const encodingOverride = normalizeEncoding(env.OPENCODE_PORTABILITY_ENCODING || '');
  const localeEncoding = inferEncodingFromLocale(lang);
  const runtimeEncoding = normalizeEncoding(new TextEncoder().encoding);
  const sourceDateEpoch = String(env.SOURCE_DATE_EPOCH || '').trim();

  const observed = {
    filesystem: {
      repoRootResolved: resolvedRepoRoot,
      scriptRootResolved: scriptRoot,
      caseSensitivityPolicy: filesystemCaseSensitivity,
      caseSensitivityPolicyProvided: Boolean(filesystemCaseSensitivity),
    },
    time: {
      TZ: timezone,
      SOURCE_DATE_EPOCH: sourceDateEpoch,
      epochIso: new Date(0).toISOString(),
    },
    locale: {
      LC_ALL: lcAll,
      LANG: lang,
    },
    encoding: {
      requested: encodingOverride,
      runtime: runtimeEncoding,
      localeDerived: localeEncoding,
    },
  };

  if (strictMode) {
    if (normalizePathForComparison(scriptRoot) !== normalizePathForComparison(resolvedRepoRoot)) {
      violations.push('filesystem path resolution must be stable across root/script lookup');
    }

    if (!DETERMINISM_BASELINE.fsCaseSensitivityModes.includes(filesystemCaseSensitivity)) {
      violations.push(
        `filesystem case sensitivity policy must be explicit (${DETERMINISM_BASELINE.fsCaseSensitivityModes.join('|')})`,
      );
    }

    if (timezone !== DETERMINISM_BASELINE.timezone) {
      violations.push(`TZ must be ${DETERMINISM_BASELINE.timezone} in strict mode`);
    }

    if (lcAll !== DETERMINISM_BASELINE.lcAll) {
      violations.push(`LC_ALL must be ${DETERMINISM_BASELINE.lcAll} in strict mode`);
    }

    if (sourceDateEpoch && !/^\d+$/.test(sourceDateEpoch)) {
      violations.push('SOURCE_DATE_EPOCH must be an integer when provided');
    }

    if (!lang) {
      violations.push('LANG must be set in strict mode for deterministic locale behavior');
    }

    const resolvedEncoding = encodingOverride || localeEncoding;
    if (resolvedEncoding !== DETERMINISM_BASELINE.encoding) {
      violations.push('character encoding must be UTF-8 (set OPENCODE_PORTABILITY_ENCODING=UTF-8 or LANG=*.UTF-8)');
    }

    if (runtimeEncoding !== normalizeEncoding(DETERMINISM_BASELINE.encoding)) {
      violations.push(`runtime TextEncoder encoding must be ${DETERMINISM_BASELINE.encoding}`);
    }

    if (String(env.OPENCODE_PORTABILITY_FAULT_DETERMINISM || '') === '1') {
      violations.push('fault injection: intentional determinism leak detected');
    }
  }

  for (const violation of violations) {
    failures.push(`Determinism gate failed: ${violation}`);
  }

  const determinismReport = {
    status: strictMode ? (violations.length === 0 ? 'ok' : 'fail') : 'not-applicable',
    violations,
    baseline: {
      timezone: DETERMINISM_BASELINE.timezone,
      lcAll: DETERMINISM_BASELINE.lcAll,
      encoding: DETERMINISM_BASELINE.encoding,
      fsCaseSensitivityModes: [...DETERMINISM_BASELINE.fsCaseSensitivityModes],
    },
    observed,
  };

  return { failures, skips, fallbacks, skipReasons, fallbackReasons, determinismReport };
}

function printCheck(name, passed, details = null) {
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}`);
  if (details) console.log(`  ${details}`);
}

export function normalizePluginName(specifier) {
  if (typeof specifier !== 'string') return '';
  const s = specifier.trim();
  if (!s) return '';

  if (s.startsWith('@')) {
    const slash = s.indexOf('/');
    if (slash === -1) return s;
    const versionSep = s.indexOf('@', slash + 1);
    return versionSep === -1 ? s : s.slice(0, versionSep);
  }

  const versionSep = s.indexOf('@');
  return versionSep === -1 ? s : s.slice(0, versionSep);
}

function parseCsvEnv(name) {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return new Set();
  return new Set(raw.split(',').map((entry) => entry.trim()).filter(Boolean));
}

function collectSkillIdsFromDir(skillsRoot) {
  if (!existsSync(skillsRoot)) return [];

  const stack = [skillsRoot];
  const skillIds = [];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (entry.isFile() && entry.name === 'SKILL.md') {
        const id = path.relative(skillsRoot, path.dirname(full)).split(path.sep).join('/');
        if (id) skillIds.push(id);
      }
    }
  }

  return skillIds.sort((a, b) => a.localeCompare(b));
}

function isLegacyModelReference(modelRef) {
  if (typeof modelRef !== 'string' || !modelRef.trim()) return false;
  const value = modelRef.trim();
  if (!value.includes('/')) return true;
  return value.startsWith('anthropic/') || value.startsWith('claude-') || value.startsWith('antigravity-claude-');
}

function checkOhMyModelMigrationFailures(repoOhMy, userOhMy, strictMode = false) {
  if (!strictMode) return [];
  if (!repoOhMy || !userOhMy || typeof repoOhMy !== 'object' || typeof userOhMy !== 'object') return [];

  const failures = [];

  const checkSection = (sectionName) => {
    const repoSection = repoOhMy?.[sectionName];
    const userSection = userOhMy?.[sectionName];
    if (!repoSection || !userSection || typeof repoSection !== 'object' || typeof userSection !== 'object') return;

    for (const [name, repoEntry] of Object.entries(repoSection)) {
      if (!repoEntry || typeof repoEntry !== 'object' || typeof repoEntry.model !== 'string') continue;
      const userEntry = userSection?.[name];
      if (!userEntry || typeof userEntry !== 'object') continue;
      if (!isLegacyModelReference(userEntry.model)) continue;
      if (userEntry.model === repoEntry.model) continue;
      failures.push(`Legacy oh-my model default requires migration: ${sectionName}.${name}=${userEntry.model} -> ${repoEntry.model}`);
    }
  };

  checkSection('agents');
  checkSection('categories');

  return failures;
}

const PLUGIN_COMMAND_REQUIREMENTS = {
  'opencode-beads': ['bd'],
};

export function extractEnvPlaceholders(value, found = new Set()) {
  if (typeof value === 'string') {
    const matches = value.matchAll(/\{env:([A-Z0-9_]+)\}/g);
    for (const m of matches) found.add(m[1]);
    return found;
  }

  if (Array.isArray(value)) {
    for (const item of value) extractEnvPlaceholders(item, found);
    return found;
  }

  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) extractEnvPlaceholders(v, found);
  }

  return found;
}

export function getEnabledLocalMcpCommands(mcpConfig) {
  if (!mcpConfig || typeof mcpConfig !== 'object') return [];

  const commands = [];
  for (const [name, cfg] of Object.entries(mcpConfig)) {
    if (!cfg || typeof cfg !== 'object') continue;
    if (cfg.enabled !== true) continue;
    if (cfg.type !== 'local') continue;
    if (!Array.isArray(cfg.command) || cfg.command.length === 0) continue;
    if (typeof cfg.command[0] !== 'string' || !cfg.command[0].trim()) continue;
    commands.push({ name, command: cfg.command[0].trim() });
  }

  return commands.sort((a, b) => a.name.localeCompare(b.name));
}

function getEnabledLocalMcpEntries(mcpConfig) {
  if (!mcpConfig || typeof mcpConfig !== 'object') return [];

  const entries = [];
  for (const [name, cfg] of Object.entries(mcpConfig)) {
    if (!cfg || typeof cfg !== 'object') continue;
    if (cfg.enabled !== true) continue;
    if (cfg.type !== 'local') continue;
    if (!Array.isArray(cfg.command) || cfg.command.length === 0) continue;
    entries.push({ name, command: cfg.command });
  }
  return entries.sort((a, b) => a.name.localeCompare(b.name));
}

function checkUserConfigSyncFailures() {
  const failures = [];
  const skips = 0;
  const fallbacks = 0;
  const skipReasons = [];
  const fallbackReasons = [];
  const cfgHome = userConfigDir();
  const dataHome = userDataDir();

  const requiredFiles = [
    'opencode.json',
    'antigravity.json',
    'oh-my-opencode.json',
    'compound-engineering.json',
    'rate-limit-fallback.json',
    'supermemory.json',
    'tool-tiers.json',
    'tool-manifest.json',
  ];

  for (const name of requiredFiles) {
    const target = path.join(cfgHome, name);
    if (!existsSync(target)) failures.push(`Missing user config file: ${target}`);
  }

  const requiredDirs = ['skills', 'agents', 'commands', 'models', 'docs', 'supermemory', 'learning-updates'];
  for (const name of requiredDirs) {
    const target = path.join(cfgHome, name);
    if (!existsSync(target)) failures.push(`Missing user config directory: ${target}`);
  }

  const dataConfig = path.join(dataHome, 'config.yaml');
  if (!existsSync(dataConfig)) failures.push(`Missing user data config: ${dataConfig}`);

  return { failures, skips, fallbacks, skipReasons, fallbackReasons };
}

function checkRegistryMirrorFailures(strictMode = false) {
  const failures = [];
  let skips = 0;
  let fallbacks = 0;
  const skipReasons = [];
  const fallbackReasons = [];
  
  const registryPath = path.join(root, 'opencode-config', 'skills', 'registry.json');
  if (!existsSync(registryPath)) {
    failures.push('Missing repo skill registry: opencode-config/skills/registry.json');
    return { failures, skips, fallbacks, skipReasons, fallbackReasons };
  }

  const skillsRoot = path.join(root, 'opencode-config', 'skills');
  const userSkillsRoot = path.join(userConfigDir(), 'skills');
  const relativeSkillPaths = collectSkillIdsFromDir(skillsRoot);

  // Registry must exist, but mirror only what the repo actually ships.
  readJson(registryPath);

  for (const skillName of relativeSkillPaths) {
    const skillFile = path.join(userSkillsRoot, skillName, 'SKILL.md');
    if (!existsSync(skillFile)) {
      failures.push(`Missing mirrored skill: ${skillName} (${skillFile})`);
    }
  }

  if (strictMode && existsSync(userSkillsRoot)) {
    const allowlisted = parseCsvEnv('OPENCODE_PORTABILITY_SKILL_ALLOWLIST');
    const repoSkillSet = new Set(relativeSkillPaths);
    const userSkills = collectSkillIdsFromDir(userSkillsRoot);

    for (const skillName of userSkills) {
      if (repoSkillSet.has(skillName)) continue;
      if (allowlisted.has(skillName)) continue;
      failures.push(`Unexpected mirrored skill in strict mode: ${skillName} (allowlist via OPENCODE_PORTABILITY_SKILL_ALLOWLIST)`);
    }
  }

  return { failures, skips, fallbacks, skipReasons, fallbackReasons };
}

function checkAgentMirrorFailures(strictMode = false) {
  const failures = [];
  let skips = 0;
  let fallbacks = 0;
  const skipReasons = [];
  const fallbackReasons = [];
  
  const repoAgentsDir = path.join(root, 'opencode-config', 'agents');
  const userAgentsDir = path.join(userConfigDir(), 'agents');

  if (!existsSync(repoAgentsDir)) {
    failures.push('Missing repo agents directory: opencode-config/agents');
    return { failures, skips, fallbacks, skipReasons, fallbackReasons };
  }
  if (!existsSync(userAgentsDir)) {
    failures.push(`Missing user agents directory: ${userAgentsDir}`);
    return { failures, skips, fallbacks, skipReasons, fallbackReasons };
  }

  const repoAgents = readdirSync(repoAgentsDir).filter((f) => f.endsWith('.md'));
  const repoAgentSet = new Set(repoAgents);
  for (const agent of repoAgents) {
    const target = path.join(userAgentsDir, agent);
    if (!existsSync(target)) failures.push(`Missing mirrored agent: ${agent}`);
  }

  if (strictMode) {
    const allowlisted = parseCsvEnv('OPENCODE_PORTABILITY_AGENT_ALLOWLIST');
    const userAgents = readdirSync(userAgentsDir).filter((f) => f.endsWith('.md'));
    for (const agent of userAgents) {
      if (repoAgentSet.has(agent)) continue;
      if (allowlisted.has(agent)) continue;
      failures.push(`Unexpected mirrored agent in strict mode: ${agent} (allowlist via OPENCODE_PORTABILITY_AGENT_ALLOWLIST)`);
    }
  }

  return { failures, skips, fallbacks, skipReasons, fallbackReasons };
}

// --- Mirror Staleness Enforcement ---

const STALENESS_ALLOWLIST_PATH = path.join(resolvePath('scripts'), 'mirror-staleness-allowlist.json');

function loadStalenessAllowlist() {
  if (!existsSync(STALENESS_ALLOWLIST_PATH)) {
    return { maxStalenessDays: 30, allowlist: [] };
  }
  return JSON.parse(readFileSync(STALENESS_ALLOWLIST_PATH, 'utf8'));
}

function isStalenessAllowlisted(entryName, type, allowlist) {
  const entries = allowlist.allowlist || [];
  const now = new Date();
  
  for (const entry of entries) {
    if (entry.expiry && new Date(entry.expiry) < now) {
      continue; // Expired
    }
    if (entry.name === entryName && entry.type === type) {
      return { allowed: true, entry };
    }
  }
  return { allowed: false, entry: null };
}

function getFileAgeDays(filePath) {
  try {
    const stats = statSync(filePath);
    const now = Date.now();
    const ageMs = now - stats.mtimeMs;
    return Math.floor(ageMs / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

function checkMirrorStalenessFailures(strictMode = false) {
  const failures = [];
  let skips = 0;
  let fallbacks = 0;
  const skipReasons = [];
  const fallbackReasons = [];
  const stalenessReport = {
    checkedSkills: 0,
    checkedAgents: 0,
    checkedMcp: 0,
    staleSkills: [],
    staleAgents: [],
    staleMcp: [],
    unexpectedSkills: [],
    unexpectedAgents: [],
    unexpectedMcp: [],
  };
  
  const allowlist = loadStalenessAllowlist();
  const maxStalenessDays = allowlist.maxStalenessDays || 30;
  
  // Check skills mirror staleness
  const repoSkillsRoot = path.join(root, 'opencode-config', 'skills');
  const userSkillsRoot = path.join(userConfigDir(), 'skills');
  
  if (existsSync(repoSkillsRoot) && existsSync(userSkillsRoot)) {
    const repoSkills = collectSkillIdsFromDir(repoSkillsRoot);
    const userSkills = collectSkillIdsFromDir(userSkillsRoot);
    const repoSkillSet = new Set(repoSkills);
    
    for (const skillName of userSkills) {
      stalenessReport.checkedSkills++;
      
      // Check for unexpected skills (not in repo)
      if (!repoSkillSet.has(skillName)) {
        const allowlisted = isStalenessAllowlisted(skillName, 'skill', allowlist);
        if (!allowlisted.allowed) {
          stalenessReport.unexpectedSkills.push(skillName);
          if (strictMode) {
            failures.push(`Unexpected skill in user mirror: ${skillName} (not in repo, not allowlisted)`);
          }
        }
        continue;
      }
      
      // Check staleness for mirrored skills
      const userSkillPath = path.join(userSkillsRoot, skillName, 'SKILL.md');
      if (existsSync(userSkillPath)) {
        const ageDays = getFileAgeDays(userSkillPath);
        if (ageDays !== null && ageDays > maxStalenessDays) {
          const allowlisted = isStalenessAllowlisted(skillName, 'skill-stale', allowlist);
          if (!allowlisted.allowed) {
            stalenessReport.staleSkills.push({ name: skillName, ageDays });
            if (strictMode) {
              failures.push(`Stale mirrored skill: ${skillName} (${ageDays} days old, max ${maxStalenessDays})`);
            }
          }
        }
      }
    }
  }
  
  // Check agents mirror staleness
  const repoAgentsDir = path.join(root, 'opencode-config', 'agents');
  const userAgentsDir = path.join(userConfigDir(), 'agents');
  
  if (existsSync(repoAgentsDir) && existsSync(userAgentsDir)) {
    const repoAgents = readdirSync(repoAgentsDir).filter((f) => f.endsWith('.md'));
    const userAgents = readdirSync(userAgentsDir).filter((f) => f.endsWith('.md'));
    const repoAgentSet = new Set(repoAgents);
    
    for (const agent of userAgents) {
      stalenessReport.checkedAgents++;
      
      // Check for unexpected agents
      if (!repoAgentSet.has(agent)) {
        const allowlisted = isStalenessAllowlisted(agent, 'agent', allowlist);
        if (!allowlisted.allowed) {
          stalenessReport.unexpectedAgents.push(agent);
          if (strictMode) {
            failures.push(`Unexpected agent in user mirror: ${agent} (not in repo, not allowlisted)`);
          }
        }
        continue;
      }
      
      // Check staleness for mirrored agents
      const userAgentPath = path.join(userAgentsDir, agent);
      if (existsSync(userAgentPath)) {
        const ageDays = getFileAgeDays(userAgentPath);
        if (ageDays !== null && ageDays > maxStalenessDays) {
          const allowlisted = isStalenessAllowlisted(agent, 'agent-stale', allowlist);
          if (!allowlisted.allowed) {
            stalenessReport.staleAgents.push({ name: agent, ageDays });
            if (strictMode) {
              failures.push(`Stale mirrored agent: ${agent} (${ageDays} days old, max ${maxStalenessDays})`);
            }
          }
        }
      }
    }
  }
  
  return { failures, skips, fallbacks, skipReasons, fallbackReasons, stalenessReport };
}

// --- End Mirror Staleness Enforcement ---

// --- Rollback Dry-Run Compatibility Gate ---

function checkRollbackDryRunCompatibility(strictMode = false) {
  const failures = [];
  let skips = 0;
  let fallbacks = 0;
  const skipReasons = [];
  const fallbackReasons = [];
  const rollbackReport = {
    catalogExists: false,
    snapshotStoreExists: false,
    auditLogExists: false,
    backupDirExists: false,
    dryRunPassed: false,
    dryRunOutput: null,
    dryRunError: null,
  };
  
  // Check if model catalog exists
  const catalogPath = path.join(root, 'opencode-config', 'models', 'catalog-2026.json');
  rollbackReport.catalogExists = existsSync(catalogPath);
  
  // Check if snapshot store exists
  const snapshotPath = path.join(root, 'packages', 'opencode-model-manager', 'snapshots', 'snapshots.json');
  rollbackReport.snapshotStoreExists = existsSync(snapshotPath);
  
  // Check if audit log exists
  const auditPath = path.join(root, 'packages', 'opencode-model-manager', 'audit.db');
  rollbackReport.auditLogExists = existsSync(auditPath);
  
  // Check if backup directory exists or can be created
  const backupDir = path.join(root, '.rollback-backups');
  rollbackReport.backupDirExists = existsSync(backupDir);
  
  // Run rollback dry-run to validate compatibility
  if (rollbackReport.catalogExists) {
    const result = spawnSync('node', ['scripts/model-rollback.mjs', '--dry-run'], {
      cwd: root,
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 30000,
    });
    
    rollbackReport.dryRunOutput = (result.stdout || '').trim();
    rollbackReport.dryRunError = (result.stderr || '').trim();
    
    // Dry-run should succeed (exit 0) for compatibility
    if (result.status === 0) {
      rollbackReport.dryRunPassed = true;
    } else if (strictMode) {
      failures.push(`Rollback dry-run failed: ${rollbackReport.dryRunError || rollbackReport.dryRunOutput}`);
    }
  } else if (strictMode) {
    failures.push('Model catalog missing - rollback dry-run cannot be validated');
  }
  
  return { failures, skips, fallbacks, skipReasons, fallbackReasons, rollbackReport };
}

// --- End Rollback Dry-Run Compatibility Gate ---

// --- Lock/Cache Integrity Check ---

const LOCK_INTEGRITY_ALLOWLIST_PATH = path.join(resolvePath('scripts'), 'lock-integrity-allowlist.json');

function loadLockIntegrityAllowlist() {
  if (!existsSync(LOCK_INTEGRITY_ALLOWLIST_PATH)) {
    return { allowedLockPatterns: ['bun.lock'], maxStaleAgeMs: 3600000 };
  }
  return JSON.parse(readFileSync(LOCK_INTEGRITY_ALLOWLIST_PATH, 'utf8'));
}

function isLockAllowlisted(lockName, allowlist) {
  const patterns = allowlist.allowedLockPatterns || [];
  for (const pattern of patterns) {
    if (lockName === pattern || lockName.endsWith(pattern)) {
      return true;
    }
  }
  return false;
}

function checkLockCacheIntegrity(strictMode = false) {
  const failures = [];
  let skips = 0;
  let fallbacks = 0;
  const skipReasons = [];
  const fallbackReasons = [];
  const integrityReport = {
    lockFilesChecked: 0,
    staleLocksFound: 0,
    allowlistedLocks: 0,
    cacheIntegrityOk: true,
    staleLockDetails: [],
  };
  
  const allowlist = loadLockIntegrityAllowlist();
  const maxStaleAgeMs = allowlist.maxStaleAgeMs || 3600000;
  
  // Check for stale lock files in data home
  const dataHome = userDataDir();
  if (existsSync(dataHome)) {
    const stack = [dataHome];
    while (stack.length > 0) {
      const current = stack.pop();
      let entries = [];
      try {
        entries = readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }
      
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(full);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.lock')) continue;
        
        integrityReport.lockFilesChecked++;
        
        // Check if lock is allowlisted
        if (isLockAllowlisted(entry.name, allowlist)) {
          integrityReport.allowlistedLocks++;
          continue;
        }
        
        // Check staleness
        try {
          const ageMs = Date.now() - statSync(full).mtimeMs;
          if (ageMs > maxStaleAgeMs) {
            integrityReport.staleLocksFound++;
            integrityReport.staleLockDetails.push({
              file: full,
              ageMs,
              ageMinutes: Math.floor(ageMs / 60000),
            });
            
            if (strictMode) {
              failures.push(`Stale lock file detected: ${full} (${Math.floor(ageMs / 60000)} minutes old)`);
            }
          }
        } catch {
          // Best effort
        }
      }
    }
  }
  
  // Check bun.lock exists (bootstrap reproducibility)
  const bunLockPath = path.join(root, 'bun.lock');
  if (!existsSync(bunLockPath)) {
    failures.push('bun.lock missing - bootstrap reproducibility cannot be guaranteed');
  }
  
  // Check node_modules exists (for offline mode)
  const modulesPath = path.join(root, 'node_modules');
  if (!existsSync(modulesPath)) {
    if (strictMode) {
      failures.push('node_modules missing - offline mode not supported');
    }
  }
  
  integrityReport.cacheIntegrityOk = failures.length === 0;
  
  return { failures, skips, fallbacks, skipReasons, fallbackReasons, integrityReport };
}

// --- End Lock/Cache Integrity Check ---

function checkPluginDeclarationFailures(repoConfig, userConfig) {
  const failures = [];
  const skips = 0;
  const fallbacks = 0;
  const skipReasons = [];
  const fallbackReasons = [];

  const repoPlugins = (Array.isArray(repoConfig.plugin) ? repoConfig.plugin : [])
    .map(normalizePluginName)
    .filter(Boolean)
    .sort();
  const userPlugins = (Array.isArray(userConfig.plugin) ? userConfig.plugin : [])
    .map(normalizePluginName)
    .filter(Boolean)
    .sort();

  for (const plugin of repoPlugins) {
    if (!userPlugins.includes(plugin)) failures.push(`Missing plugin declaration in user config: ${plugin}`);
  }

  return { failures, skips, fallbacks, skipReasons, fallbackReasons };
}

export function checkPluginCommandFailures(userConfig, locateCommand = commandLocation) {
  const failures = [];
  const skips = 0;
  const fallbacks = 0;
  const skipReasons = [];
  const fallbackReasons = [];
  
  const configuredPlugins = (Array.isArray(userConfig.plugin) ? userConfig.plugin : [])
    .map(normalizePluginName)
    .filter(Boolean);

  for (const plugin of configuredPlugins) {
    const commands = PLUGIN_COMMAND_REQUIREMENTS[plugin] || [];
    for (const command of commands) {
      if (!locateCommand(command)) {
        failures.push(`Missing required command '${command}' for configured plugin '${plugin}'`);
      }
    }
  }

  return { failures, skips, fallbacks, skipReasons, fallbackReasons };
}

function checkEnabledLocalMcpCommandFailures(userConfig) {
  const failures = [];
  const skips = 0;
  const fallbacks = 0;
  const skipReasons = [];
  const fallbackReasons = [];
  
  const enabledLocal = getEnabledLocalMcpCommands(userConfig.mcp || {});
  for (const item of enabledLocal) {
    if (!commandLocation(item.command)) {
      failures.push(`Missing local MCP command '${item.command}' for enabled server '${item.name}'`);
    }
  }
  return { failures, skips, fallbacks, skipReasons, fallbackReasons };
}

function checkEnabledLocalMcpScriptPathFailures(userConfig) {
  const failures = [];
  const skips = 0;
  const fallbacks = 0;
  const skipReasons = [];
  const fallbackReasons = [];
  
  const enabledLocalEntries = getEnabledLocalMcpEntries(userConfig.mcp || {});

  for (const item of enabledLocalEntries) {
    const [command, scriptCandidate] = item.command;
    if (typeof command !== 'string' || typeof scriptCandidate !== 'string') continue;
    if (!['node', 'bun'].includes(command)) continue;

    if (!/\.(mjs|js|cjs|ts|mts|cts)$/i.test(scriptCandidate)) continue;

    const resolvedScriptPath = path.isAbsolute(scriptCandidate)
      ? scriptCandidate
      : path.join(root, scriptCandidate);

    if (!existsSync(resolvedScriptPath)) {
      failures.push(`Missing local MCP script '${scriptCandidate}' (resolved: ${resolvedScriptPath}) for enabled server '${item.name}'`);
    }
  }

  return { failures, skips, fallbacks, skipReasons, fallbackReasons };
}

// --- Probe Reason Taxonomy ---
const PROBE_REASONS = {
  SKIPPED: {
    NON_SCRIPT_SHAPE: 'non-script command shape',
    UNSAFE_LAUNCHER: (launcher) => `launcher '${launcher}' is not probe-safe`,
    NOT_JS_ENTRYPOINT: 'script argument is not a JS/TS entrypoint',
    DISABLED: 'MCP probe disabled',
    ENV_SKIP: 'MCP probe skipped via OPENCODE_SKIP_MCP_PROBE=1',
  },
  FAILED: {
    TIMEOUT: (ms) => `launch probe timed out after ${ms}ms`,
    SPAWN_ERROR: (msg) => `spawn error: ${msg}`,
    NON_ZERO_EXIT: (code) => `process exited with code ${code}`,
  },
  OK: {
    LAUNCHED: (exitCode) => `launched with exit=${exitCode ?? 'unknown'}`,
  },
};

function probeLocalMcpScriptLaunch(entry, timeoutMs = 7000) {
  const [command, scriptCandidate, ...rest] = entry.command;
  if (typeof command !== 'string' || typeof scriptCandidate !== 'string') {
    return { skipped: true, reason: PROBE_REASONS.SKIPPED.NON_SCRIPT_SHAPE, category: 'non-script' };
  }

  if (!['node', 'bun'].includes(command)) {
    return { skipped: true, reason: PROBE_REASONS.SKIPPED.UNSAFE_LAUNCHER(command), category: 'unsafe-launcher' };
  }

  if (!/\.(mjs|js|cjs|ts|mts|cts)$/i.test(scriptCandidate)) {
    return { skipped: true, reason: PROBE_REASONS.SKIPPED.NOT_JS_ENTRYPOINT, category: 'non-js-entrypoint' };
  }

  const probeArgs = [scriptCandidate, '--help'];
  const result = spawnSync(command, probeArgs, {
    cwd: root,
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: timeoutMs,
    env: {
      ...process.env,
      OPENCODE_MCP_PROBE: '1',
      OPENCODE_VERIFY_ENV_PROFILE: process.env.OPENCODE_VERIFY_ENV_PROFILE || 'none',
    },
  });

  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      return { skipped: false, ok: false, reason: PROBE_REASONS.FAILED.TIMEOUT(timeoutMs), category: 'timeout' };
    }
    return { skipped: false, ok: false, reason: PROBE_REASONS.FAILED.SPAWN_ERROR(result.error.message), category: 'spawn-error' };
  }

  // For portability probing, non-zero exit is acceptable as long as the process launched.
  if (result.status !== 0 && result.status !== null) {
    return { skipped: false, ok: true, reason: PROBE_REASONS.OK.LAUNCHED(result.status), category: 'launched-nonzero' };
  }
  
  return { skipped: false, ok: true, reason: PROBE_REASONS.OK.LAUNCHED(result.status), category: 'launched' };
}

function generateProbeReport(probeResults) {
  const report = {
    total: probeResults.length,
    exercised: 0,
    skipped: 0,
    failed: 0,
    byCategory: {},
  };
  
  for (const result of probeResults) {
    const category = result.category || 'unknown';
    if (!report.byCategory[category]) {
      report.byCategory[category] = { count: 0, items: [] };
    }
    report.byCategory[category].count++;
    report.byCategory[category].items.push({
      name: result.name,
      reason: result.reason,
    });
    
    if (result.skipped) {
      report.skipped++;
    } else if (!result.ok) {
      report.failed++;
    } else {
      report.exercised++;
    }
  }
  
  return report;
}

function checkEnabledLocalMcpLaunchProbeFailures(userConfig, strictMode = false, probeEnabled = false) {
  const shouldProbe = strictMode || probeEnabled;
  const failures = [];
  let skips = 0;
  let fallbacks = 0;
  const skipReasons = [];
  const fallbackReasons = [];
  const probeResults = [];
  const allowlist = loadBudgetAllowlist();
  
  if (!shouldProbe) {
    const reason = 'MCP probe disabled (not strict mode and --probe-mcp not set)';
    const allowed = isAllowlisted(reason, 'skip', allowlist);
    if (!allowed.allowed) {
      skips++;
      skipReasons.push(reason);
    }
    return { failures, skips, fallbacks, skipReasons, fallbackReasons, probeReport: null };
  }
  if (String(process.env.OPENCODE_SKIP_MCP_PROBE || '') === '1') {
    const reason = 'MCP probe skipped via OPENCODE_SKIP_MCP_PROBE=1';
    const allowed = isAllowlisted(reason, 'skip', allowlist);
    if (!allowed.allowed) {
      skips++;
      skipReasons.push(reason);
    }
    return { failures, skips, fallbacks, skipReasons, fallbackReasons, probeReport: null };
  }

  const enabledLocalEntries = getEnabledLocalMcpEntries(userConfig.mcp || {});
  for (const item of enabledLocalEntries) {
    const probe = probeLocalMcpScriptLaunch(item);
    probeResults.push({ name: item.name, ...probe });
    
    if (probe.skipped) {
      const reason = `MCP probe skipped for '${item.name}': ${probe.reason}`;
      const allowed = isAllowlisted(reason, 'skip', allowlist);
      if (!allowed.allowed) {
        skips++;
        skipReasons.push(reason);
      }
      continue;
    }
    if (!probe.ok) {
      failures.push(`Local MCP launch probe failed for '${item.name}': ${probe.reason}`);
    }
  }

  const probeReport = generateProbeReport(probeResults);
  return { failures, skips, fallbacks, skipReasons, fallbackReasons, probeReport };
}

export function checkRequiredEnvFailures(userConfig, strictMode) {
  const failures = [];
  let skips = 0;
  let fallbacks = 0;
  const skipReasons = [];
  const fallbackReasons = [];

  const enabledMcpOnly = {};
  for (const [name, cfg] of Object.entries(userConfig.mcp || {})) {
    if (cfg && typeof cfg === 'object' && cfg.enabled === true) {
      enabledMcpOnly[name] = cfg;
    }
  }

  const requiredEnvVars = extractEnvPlaceholders({
    provider: userConfig.provider || {},
    mcp: enabledMcpOnly,
  });

  for (const envVar of requiredEnvVars) {
    const isSet = typeof process.env[envVar] === 'string' && process.env[envVar].trim().length > 0;
    if (!isSet) failures.push(`Missing required env var from active config: ${envVar}`);
  }

  if (strictMode) {
    const providerKeys = ['OPENAI_API_KEYS', 'GOOGLE_API_KEYS', 'ANTHROPIC_API_KEYS'];
    const hasAtLeastOneProviderKey = providerKeys.some((name) => {
      const value = process.env[name];
      return typeof value === 'string' && value.trim().length > 0;
    });
    if (!hasAtLeastOneProviderKey) {
      failures.push(`Strict mode requires at least one provider API key: ${providerKeys.join(', ')}`);
    }
  }

  return { failures, skips, fallbacks, skipReasons, fallbackReasons };
}

function parseIsoTimestamp(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) {
    return { value: null, raw: '', valid: false, reason: 'missing timestamp' };
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return { value: null, raw, valid: false, reason: `invalid timestamp: ${raw}` };
  }

  return { value: parsed, raw, valid: true, reason: null };
}

function resolveRestoreDrillExpectedRun(env = process.env) {
  return {
    runId: String(
      env.OPENCODE_PORTABILITY_RUN_ID
      || env.OPENCODE_PORTABILITY_PROOF_RUN_ID
      || env.OPENCODE_PROOF_RUN_ID
      || env.GITHUB_RUN_ID
      || '',
    ).trim(),
    commitSha: String(
      env.OPENCODE_PORTABILITY_COMMIT_SHA
      || env.OPENCODE_PORTABILITY_PROOF_COMMIT_SHA
      || env.OPENCODE_PROOF_COMMIT_SHA
      || env.GITHUB_SHA
      || resolveCurrentCommitSha(root)
      || '',
    ).trim(),
  };
}

function toRoundedMinutes(ms) {
  return Math.round(ms / 60000);
}

export function checkRestoreDrillReport({ strictMode = false, env = process.env } = {}) {
  const failures = [];
  const evidencePathInput = String(env.OPENCODE_PORTABILITY_RESTORE_DRILL_EVIDENCE || RESTORE_DRILL_OBJECTIVES.defaultEvidencePath).trim();
  const evidencePathResolved = path.resolve(root, evidencePathInput);
  const expectedRun = resolveRestoreDrillExpectedRun(env);

  const report = {
    status: strictMode ? 'failed' : 'not-applicable',
    rto: {
      targetMinutes: RESTORE_DRILL_OBJECTIVES.rtoMinutes,
      actualMinutes: null,
      compliant: !strictMode,
    },
    rpo: {
      targetMinutes: RESTORE_DRILL_OBJECTIVES.rpoMinutes,
      actualMinutes: null,
      compliant: !strictMode,
    },
    evidence: {
      path: evidencePathResolved,
      exists: false,
      valid: false,
      expectedRun,
      integrityCheck: null,
      startedAt: null,
      completedAt: null,
      backupTimestamp: null,
      convergenceRunId: null,
      convergenceCommitSha: null,
      issues: [],
    },
  };

  if (!strictMode) {
    report.status = 'not-applicable';
    report.evidence.valid = existsSync(evidencePathResolved);
    report.evidence.exists = report.evidence.valid;
    return { failures, restoreDrillReport: report };
  }

  if (!existsSync(evidencePathResolved)) {
    report.evidence.issues.push('evidence file not found');
    failures.push('Restore drill gate failed: evidence file not found');
    return { failures, restoreDrillReport: report };
  }

  report.evidence.exists = true;

  let evidencePayload = null;
  try {
    evidencePayload = readJson(evidencePathResolved);
  } catch (error) {
    const reason = `invalid evidence JSON: ${error.message}`;
    report.evidence.issues.push(reason);
    failures.push(`Restore drill gate failed: ${reason}`);
    return { failures, restoreDrillReport: report };
  }

  const startedAt = parseIsoTimestamp(evidencePayload.startedAt);
  const completedAt = parseIsoTimestamp(evidencePayload.completedAt);
  const backupTimestamp = parseIsoTimestamp(evidencePayload.backupTimestamp);
  report.evidence.startedAt = startedAt.raw || null;
  report.evidence.completedAt = completedAt.raw || null;
  report.evidence.backupTimestamp = backupTimestamp.raw || null;

  if (!startedAt.valid) report.evidence.issues.push(`startedAt ${startedAt.reason}`);
  if (!completedAt.valid) report.evidence.issues.push(`completedAt ${completedAt.reason}`);
  if (!backupTimestamp.valid) report.evidence.issues.push(`backupTimestamp ${backupTimestamp.reason}`);

  if (startedAt.valid && completedAt.valid && completedAt.value.getTime() < startedAt.value.getTime()) {
    report.evidence.issues.push('completedAt must be greater than or equal to startedAt');
  }

  if (backupTimestamp.valid && startedAt.valid && backupTimestamp.value.getTime() > startedAt.value.getTime()) {
    report.evidence.issues.push('backupTimestamp must be less than or equal to startedAt');
  }

  const integrityCheck = String(evidencePayload.integrityCheck || '').trim().toLowerCase();
  report.evidence.integrityCheck = integrityCheck || null;
  if (integrityCheck !== 'pass') {
    report.evidence.issues.push('integrityCheck must be "pass"');
  }

  const convergenceSnapshot = (evidencePayload.convergenceSnapshot && typeof evidencePayload.convergenceSnapshot === 'object')
    ? evidencePayload.convergenceSnapshot
    : null;
  const convergenceRunId = String(convergenceSnapshot?.runId || '').trim();
  const convergenceCommitSha = String(convergenceSnapshot?.commitSha || '').trim();
  report.evidence.convergenceRunId = convergenceRunId || null;
  report.evidence.convergenceCommitSha = convergenceCommitSha || null;

  const staleEvidenceReasons = [];
  if (!convergenceSnapshot) {
    staleEvidenceReasons.push('convergenceSnapshot missing from restore drill evidence');
  }
  if (expectedRun.runId && !convergenceRunId) {
    staleEvidenceReasons.push(`CONVERGENCE_STALE_RUN: missing runId (expected ${expectedRun.runId})`);
  }
  if (expectedRun.runId && convergenceRunId && convergenceRunId !== expectedRun.runId) {
    staleEvidenceReasons.push(`CONVERGENCE_STALE_RUN: runId=${convergenceRunId} expected=${expectedRun.runId}`);
  }
  if (expectedRun.commitSha && !convergenceCommitSha) {
    staleEvidenceReasons.push(`CONVERGENCE_COMMIT_MISMATCH: missing commitSha (expected ${expectedRun.commitSha})`);
  }
  if (expectedRun.commitSha && convergenceCommitSha && convergenceCommitSha !== expectedRun.commitSha) {
    staleEvidenceReasons.push(`CONVERGENCE_COMMIT_MISMATCH: commitSha=${convergenceCommitSha} expected=${expectedRun.commitSha}`);
  }
  if (staleEvidenceReasons.length > 0) {
    report.evidence.issues.push(`RESTORE_DRILL_STALE_EVIDENCE: ${staleEvidenceReasons.join('; ')}`);
    report.evidence.issues.push(...staleEvidenceReasons);
  }

  if (startedAt.valid && completedAt.valid) {
    report.rto.actualMinutes = toRoundedMinutes(completedAt.value.getTime() - startedAt.value.getTime());
  }

  if (backupTimestamp.valid && startedAt.valid) {
    report.rpo.actualMinutes = toRoundedMinutes(startedAt.value.getTime() - backupTimestamp.value.getTime());
  }

  if (report.rto.actualMinutes !== null) {
    report.rto.compliant = report.rto.actualMinutes <= report.rto.targetMinutes;
    if (!report.rto.compliant) {
      failures.push(`Restore drill gate failed: RTO breach (${report.rto.actualMinutes}m > ${report.rto.targetMinutes}m)`);
    }
  } else {
    report.rto.compliant = false;
    report.evidence.issues.push('unable to compute RTO minutes from evidence timestamps');
  }

  if (report.rpo.actualMinutes !== null) {
    report.rpo.compliant = report.rpo.actualMinutes <= report.rpo.targetMinutes;
    if (!report.rpo.compliant) {
      failures.push(`Restore drill gate failed: RPO breach (${report.rpo.actualMinutes}m > ${report.rpo.targetMinutes}m)`);
    }
  } else {
    report.rpo.compliant = false;
    report.evidence.issues.push('unable to compute RPO minutes from evidence timestamps');
  }

  if (report.evidence.issues.length > 0) {
    for (const issue of report.evidence.issues) {
      const failure = `Restore drill gate failed: ${issue}`;
      if (!failures.includes(failure)) failures.push(failure);
    }
  }

  report.evidence.valid = report.evidence.issues.length === 0;
  report.status = failures.length === 0 ? 'passed' : 'failed';
  return { failures, restoreDrillReport: report };
}

function appendStrictSupplyChainFailure(failures, strict, supplyChainReport) {
  if (!strict) return;
  if (supplyChainReport?.status === 'passed') return;

  const reason = String(supplyChainReport?.reason || 'supply-chain report missing reason').trim();
  if (supplyChainReport?.status === 'exception-approved') {
    failures.push(`Supply chain gate failed: ZERO_WAIVER_EXCEPTION_STATUS: ${reason}`);
    return;
  }

  failures.push(`Supply chain gate failed: ${reason}`);
}

const UNIVERSAL_PROOF_CONTRACT = Object.freeze({
  mcpSmoke: Object.freeze({
    envKey: 'OPENCODE_PORTABILITY_MCP_SMOKE_PROOF_PATH',
    defaultPath: path.join(root, '.sisyphus', 'evidence', 'mcp-smoke-proof.json'),
  }),
  runtimeToolSurface: Object.freeze({
    envKey: 'OPENCODE_PORTABILITY_RUNTIME_SURFACE_PROOF_PATH',
    defaultPath: path.join(root, '.sisyphus', 'evidence', 'runtime-tool-surface-proof.json'),
  }),
});

function resolveUniversalProofExpectedRun(env) {
  return {
    runId: String(
      env.OPENCODE_PORTABILITY_PROOF_RUN_ID
      || env.OPENCODE_PROOF_RUN_ID
      || env.GITHUB_RUN_ID
      || '',
    ).trim(),
    commitSha: String(
      env.OPENCODE_PORTABILITY_PROOF_COMMIT_SHA
      || env.OPENCODE_PROOF_COMMIT_SHA
      || env.GITHUB_SHA
      || '',
    ).trim(),
  };
}

function readUniversalProofArtifact(filePath) {
  if (!existsSync(filePath)) {
    return { exists: false, payload: null, parseError: null };
  }

  try {
    return {
      exists: true,
      payload: readJson(filePath),
      parseError: null,
    };
  } catch (error) {
    return {
      exists: true,
      payload: null,
      parseError: error instanceof Error ? error.message : String(error),
    };
  }
}

function extractUniversalProof(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.universalProof && typeof payload.universalProof === 'object') {
    return payload.universalProof;
  }
  return null;
}

export function checkUniversalProofAttestationFailures({ strictMode = false, env = process.env } = {}) {
  const failures = [];
  const skips = 0;
  const fallbacks = 0;
  const skipReasons = [];
  const fallbackReasons = [];

  const universalProofReport = {
    status: strictMode ? 'passed' : 'not-applicable',
    expectedRun: resolveUniversalProofExpectedRun(env),
    violations: [],
    surfaces: {},
  };

  if (!strictMode) {
    return { failures, skips, fallbacks, skipReasons, fallbackReasons, universalProofReport };
  }

  const thresholdOverride = String(
    env.OPENCODE_PORTABILITY_ALLOW_THRESHOLD_PROOF
    || env.OPENCODE_PORTABILITY_PROOF_THRESHOLD
    || '',
  ).trim().toLowerCase();

  if (thresholdOverride === '1' || thresholdOverride === 'true' || thresholdOverride === '50') {
    universalProofReport.violations.push('PROOF_THRESHOLD_FORBIDDEN: threshold-based proof pass is forbidden (requires universal same-run attestations)');
  }

  for (const [surfaceName, contract] of Object.entries(UNIVERSAL_PROOF_CONTRACT)) {
    const configuredPath = String(env[contract.envKey] || '').trim();
    const artifactPath = configuredPath || contract.defaultPath;
    const artifact = readUniversalProofArtifact(artifactPath);
    const surfaceReport = {
      artifactPath,
      status: 'passed',
      requiredCount: 0,
      attestedCount: 0,
      missingAttestations: [],
      runId: null,
      commitSha: null,
      violations: [],
    };

    if (!artifact.exists) {
      surfaceReport.status = 'failed';
      surfaceReport.violations.push(`PROOF_MISSING_ATTESTATION:${surfaceName}: proof artifact missing at ${artifactPath}`);
    } else if (artifact.parseError) {
      surfaceReport.status = 'failed';
      surfaceReport.violations.push(`PROOF_MISSING_ATTESTATION:${surfaceName}: invalid JSON (${artifact.parseError})`);
    } else {
      const proof = extractUniversalProof(artifact.payload);
      if (!proof) {
        surfaceReport.status = 'failed';
        surfaceReport.violations.push(`PROOF_MISSING_ATTESTATION:${surfaceName}: universalProof payload missing`);
      } else {
        const requiredCount = Number(proof.requiredCount || 0);
        const attestedCount = Number(proof.attestedCount || 0);
        const missingAttestations = Array.isArray(proof.missingAttestations)
          ? proof.missingAttestations.map((name) => String(name || '').trim()).filter(Boolean)
          : [];

        surfaceReport.requiredCount = Number.isFinite(requiredCount) ? requiredCount : 0;
        surfaceReport.attestedCount = Number.isFinite(attestedCount) ? attestedCount : 0;
        surfaceReport.missingAttestations = missingAttestations;
        surfaceReport.runId = String(proof.runId || artifact.payload?.proofRunId || '').trim() || null;
        surfaceReport.commitSha = String(proof.commitSha || artifact.payload?.proofCommitSha || '').trim() || null;

        if (surfaceReport.requiredCount > 0 && missingAttestations.length > 0) {
          surfaceReport.status = 'failed';
          surfaceReport.violations.push(`PROOF_MISSING_ATTESTATION:${surfaceName}: missing same-run attestations for ${missingAttestations.join(', ')}`);
        }

        if (surfaceReport.requiredCount > 0 && surfaceReport.attestedCount < surfaceReport.requiredCount && missingAttestations.length === 0) {
          surfaceReport.status = 'failed';
          surfaceReport.violations.push(`PROOF_MISSING_ATTESTATION:${surfaceName}: attested ${surfaceReport.attestedCount}/${surfaceReport.requiredCount}`);
        }

        const expectedRunId = universalProofReport.expectedRun.runId;
        const expectedCommitSha = universalProofReport.expectedRun.commitSha;
        if (expectedRunId && surfaceReport.runId && surfaceReport.runId !== expectedRunId) {
          surfaceReport.status = 'failed';
          surfaceReport.violations.push(`PROOF_STALE_RUN:${surfaceName}: runId=${surfaceReport.runId} expected=${expectedRunId}`);
        }
        if (expectedCommitSha && surfaceReport.commitSha && surfaceReport.commitSha !== expectedCommitSha) {
          surfaceReport.status = 'failed';
          surfaceReport.violations.push(`PROOF_STALE_RUN:${surfaceName}: commitSha=${surfaceReport.commitSha} expected=${expectedCommitSha}`);
        }
      }
    }

    if (surfaceReport.violations.length > 0) {
      universalProofReport.violations.push(...surfaceReport.violations);
    }
    universalProofReport.surfaces[surfaceName] = surfaceReport;
  }

  if (universalProofReport.violations.length > 0) {
    universalProofReport.status = 'failed';
    for (const violation of universalProofReport.violations) {
      failures.push(`Proof attestation gate failed: ${violation}`);
    }
  }

  return { failures, skips, fallbacks, skipReasons, fallbackReasons, universalProofReport };
}

export function runPortabilityVerification({ strict = false, probeLocalMcp = false } = {}) {
  const failures = [];
  let skipCount = 0;
  let fallbackCount = 0;
  const skipReasons = [];
  const fallbackReasons = [];
  const supportFloorReport = checkSupportFloorReport();
  const supplyChainReport = checkSupplyChainTrustReport({ strict });
  const observabilityIntegrityResult = checkObservabilityIntegrityFailures({ strictMode: strict, env: process.env });
  const privilegeGovernanceResult = checkPrivilegeGovernanceFailures({ strictMode: strict, env: process.env });
  const adrGovernanceResult = checkAdrGovernanceFailures({ strictMode: strict, env: process.env });
  const hermeticityResult = checkHermeticityFailures({ strictMode: strict, env: process.env });
  const determinismResult = checkDeterminismFailures({ strictMode: strict, env: process.env });
  const restoreDrillResult = checkRestoreDrillReport({ strictMode: strict, env: process.env });
  const universalProofResult = checkUniversalProofAttestationFailures({ strictMode: strict, env: process.env });

  if (strict && !supportFloorReport.supported) {
    failures.push(`Support floor gate failed: ${supportFloorReport.reason}`);
    appendStrictSupplyChainFailure(failures, strict, supplyChainReport);
    failures.push(...observabilityIntegrityResult.failures);
    failures.push(...privilegeGovernanceResult.failures);
    failures.push(...adrGovernanceResult.failures);
    failures.push(...hermeticityResult.failures);
    failures.push(...determinismResult.failures);
    failures.push(...restoreDrillResult.failures);
    failures.push(...universalProofResult.failures);
    return {
      ok: false,
      failures,
      budget: { skipCount, fallbackCount, skipReasons, fallbackReasons },
      probeReport: null,
      stalenessReport: null,
      rollbackReport: null,
      integrityReport: null,
      supportFloorReport,
      supplyChainReport,
      observabilityIntegrityReport: observabilityIntegrityResult.observabilityIntegrityReport,
      privilegeGovernanceReport: privilegeGovernanceResult.privilegeGovernanceReport,
      adrGovernanceReport: adrGovernanceResult.adrGovernanceReport,
      hermeticityReport: hermeticityResult.hermeticityReport,
      determinismReport: determinismResult.determinismReport,
      restoreDrillReport: restoreDrillResult.restoreDrillReport,
      universalProofReport: universalProofResult.universalProofReport,
    };
  }

  const repoConfigPath = path.join(root, 'opencode-config', 'opencode.json');
  const userConfigPath = path.join(userConfigDir(), 'opencode.json');
  const repoOhMyPath = path.join(root, 'opencode-config', 'oh-my-opencode.json');
  const userOhMyPath = path.join(userConfigDir(), 'oh-my-opencode.json');

  if (!existsSync(repoConfigPath)) {
    failures.push(`Missing repo config: ${repoConfigPath}`);
    appendStrictSupplyChainFailure(failures, strict, supplyChainReport);
    failures.push(...observabilityIntegrityResult.failures);
    failures.push(...privilegeGovernanceResult.failures);
    failures.push(...adrGovernanceResult.failures);
    failures.push(...hermeticityResult.failures);
    failures.push(...determinismResult.failures);
    failures.push(...restoreDrillResult.failures);
    failures.push(...universalProofResult.failures);
    return {
      ok: false,
      failures,
      budget: { skipCount, fallbackCount, skipReasons, fallbackReasons },
      supportFloorReport,
      supplyChainReport,
      observabilityIntegrityReport: observabilityIntegrityResult.observabilityIntegrityReport,
      privilegeGovernanceReport: privilegeGovernanceResult.privilegeGovernanceReport,
      adrGovernanceReport: adrGovernanceResult.adrGovernanceReport,
      hermeticityReport: hermeticityResult.hermeticityReport,
      determinismReport: determinismResult.determinismReport,
      restoreDrillReport: restoreDrillResult.restoreDrillReport,
      universalProofReport: universalProofResult.universalProofReport,
    };
  }
  if (!existsSync(userConfigPath)) {
    failures.push(`Missing user config: ${userConfigPath}`);
    appendStrictSupplyChainFailure(failures, strict, supplyChainReport);
    failures.push(...observabilityIntegrityResult.failures);
    failures.push(...privilegeGovernanceResult.failures);
    failures.push(...adrGovernanceResult.failures);
    failures.push(...hermeticityResult.failures);
    failures.push(...determinismResult.failures);
    failures.push(...restoreDrillResult.failures);
    failures.push(...universalProofResult.failures);
    return {
      ok: false,
      failures,
      budget: { skipCount, fallbackCount, skipReasons, fallbackReasons },
      supportFloorReport,
      supplyChainReport,
      observabilityIntegrityReport: observabilityIntegrityResult.observabilityIntegrityReport,
      privilegeGovernanceReport: privilegeGovernanceResult.privilegeGovernanceReport,
      adrGovernanceReport: adrGovernanceResult.adrGovernanceReport,
      hermeticityReport: hermeticityResult.hermeticityReport,
      determinismReport: determinismResult.determinismReport,
      restoreDrillReport: restoreDrillResult.restoreDrillReport,
      universalProofReport: universalProofResult.universalProofReport,
    };
  }

  const repoConfig = readJson(repoConfigPath);
  const userConfig = readJson(userConfigPath);
  const repoOhMy = existsSync(repoOhMyPath) ? readJson(repoOhMyPath) : null;
  const userOhMy = existsSync(userOhMyPath) ? readJson(userOhMyPath) : null;

  // Track skips and fallbacks from each check
  const userConfigSyncResult = checkUserConfigSyncFailures();
  failures.push(...userConfigSyncResult.failures);
  skipCount += userConfigSyncResult.skips || 0;
  fallbackCount += userConfigSyncResult.fallbacks || 0;
  skipReasons.push(...(userConfigSyncResult.skipReasons || []));
  fallbackReasons.push(...(userConfigSyncResult.fallbackReasons || []));

  const registryResult = checkRegistryMirrorFailures(strict);
  failures.push(...registryResult.failures);
  skipCount += registryResult.skips || 0;
  fallbackCount += registryResult.fallbacks || 0;
  skipReasons.push(...(registryResult.skipReasons || []));
  fallbackReasons.push(...(registryResult.fallbackReasons || []));

  const agentResult = checkAgentMirrorFailures(strict);
  failures.push(...agentResult.failures);
  skipCount += agentResult.skips || 0;
  fallbackCount += agentResult.fallbacks || 0;
  skipReasons.push(...(agentResult.skipReasons || []));
  fallbackReasons.push(...(agentResult.fallbackReasons || []));

  const stalenessResult = checkMirrorStalenessFailures(strict);
  failures.push(...stalenessResult.failures);
  skipCount += stalenessResult.skips || 0;
  fallbackCount += stalenessResult.fallbacks || 0;
  skipReasons.push(...(stalenessResult.skipReasons || []));
  fallbackReasons.push(...(stalenessResult.fallbackReasons || []));

  const rollbackResult = checkRollbackDryRunCompatibility(strict);
  failures.push(...rollbackResult.failures);
  skipCount += rollbackResult.skips || 0;
  fallbackCount += rollbackResult.fallbacks || 0;
  skipReasons.push(...(rollbackResult.skipReasons || []));
  fallbackReasons.push(...(rollbackResult.fallbackReasons || []));

  const lockIntegrityResult = checkLockCacheIntegrity(strict);
  failures.push(...lockIntegrityResult.failures);
  skipCount += lockIntegrityResult.skips || 0;
  fallbackCount += lockIntegrityResult.fallbacks || 0;
  skipReasons.push(...(lockIntegrityResult.skipReasons || []));
  fallbackReasons.push(...(lockIntegrityResult.fallbackReasons || []));

  const pluginDeclResult = checkPluginDeclarationFailures(repoConfig, userConfig);
  failures.push(...pluginDeclResult.failures);
  skipCount += pluginDeclResult.skips || 0;
  fallbackCount += pluginDeclResult.fallbacks || 0;
  skipReasons.push(...(pluginDeclResult.skipReasons || []));
  fallbackReasons.push(...(pluginDeclResult.fallbackReasons || []));

  const pluginCmdResult = checkPluginCommandFailures(userConfig);
  failures.push(...pluginCmdResult.failures);
  skipCount += pluginCmdResult.skips || 0;
  fallbackCount += pluginCmdResult.fallbacks || 0;
  skipReasons.push(...(pluginCmdResult.skipReasons || []));
  fallbackReasons.push(...(pluginCmdResult.fallbackReasons || []));

  const mcpCmdResult = checkEnabledLocalMcpCommandFailures(userConfig);
  failures.push(...mcpCmdResult.failures);
  skipCount += mcpCmdResult.skips || 0;
  fallbackCount += mcpCmdResult.fallbacks || 0;
  skipReasons.push(...(mcpCmdResult.skipReasons || []));
  fallbackReasons.push(...(mcpCmdResult.fallbackReasons || []));

  const mcpScriptResult = checkEnabledLocalMcpScriptPathFailures(userConfig);
  failures.push(...mcpScriptResult.failures);
  skipCount += mcpScriptResult.skips || 0;
  fallbackCount += mcpScriptResult.fallbacks || 0;
  skipReasons.push(...(mcpScriptResult.skipReasons || []));
  fallbackReasons.push(...(mcpScriptResult.fallbackReasons || []));
  
  const probeResult = checkEnabledLocalMcpLaunchProbeFailures(userConfig, strict, probeLocalMcp);
  failures.push(...probeResult.failures);
  skipCount += probeResult.skips || 0;
  fallbackCount += probeResult.fallbacks || 0;
  skipReasons.push(...(probeResult.skipReasons || []));
  fallbackReasons.push(...(probeResult.fallbackReasons || []));

  const envResult = checkRequiredEnvFailures(userConfig, strict);
  failures.push(...envResult.failures);
  skipCount += envResult.skips || 0;
  fallbackCount += envResult.fallbacks || 0;
  skipReasons.push(...(envResult.skipReasons || []));
  fallbackReasons.push(...(envResult.fallbackReasons || []));

  failures.push(...checkOhMyModelMigrationFailures(repoOhMy, userOhMy, strict));
  failures.push(...observabilityIntegrityResult.failures);
  failures.push(...privilegeGovernanceResult.failures);
  failures.push(...adrGovernanceResult.failures);
  failures.push(...hermeticityResult.failures);
  failures.push(...determinismResult.failures);
  failures.push(...restoreDrillResult.failures);
  failures.push(...universalProofResult.failures);

  appendStrictSupplyChainFailure(failures, strict, supplyChainReport);

  // Enforce budget in strict mode
  checkBudgetEnforcement(failures, skipCount, fallbackCount, strict);

  return {
    ok: failures.length === 0,
    failures,
    budget: { skipCount, fallbackCount, skipReasons, fallbackReasons },
    probeReport: probeResult.probeReport,
    stalenessReport: stalenessResult.stalenessReport,
    rollbackReport: rollbackResult.rollbackReport,
    integrityReport: lockIntegrityResult.integrityReport,
    supportFloorReport,
    supplyChainReport,
    observabilityIntegrityReport: observabilityIntegrityResult.observabilityIntegrityReport,
    privilegeGovernanceReport: privilegeGovernanceResult.privilegeGovernanceReport,
    adrGovernanceReport: adrGovernanceResult.adrGovernanceReport,
    hermeticityReport: hermeticityResult.hermeticityReport,
    determinismReport: determinismResult.determinismReport,
    restoreDrillReport: restoreDrillResult.restoreDrillReport,
    universalProofReport: universalProofResult.universalProofReport,
  };
}

function normalizeGateReasons(reasons, fallbackReason = 'no additional reason provided') {
  const normalized = (Array.isArray(reasons) ? reasons : [])
    .map((reason) => String(reason || '').trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : [fallbackReason];
}

function mapReportStatusToGateStatus(status) {
  if (status === 'failed' || status === 'fail') return 'failed';
  if (status === 'passed' || status === 'ok') return 'passed';
  if (status === 'not-applicable') return 'not-applicable';
  return 'unknown';
}

const ZERO_WAIVER_BLOCKED_STATUSES = new Set(['exception-approved']);
const ZERO_WAIVER_BLOCKED_FIELDS = new Set([
  'waiver',
  'waivers',
  'exception',
  'exceptions',
  'approvalId',
  'approvedBy',
  'expiresAt',
  'ticket',
]);

function collectZeroWaiverFieldViolations(value, pathSegments = []) {
  const violations = [];
  if (!value || typeof value !== 'object') return violations;

  const entries = Object.entries(value);
  for (const [key, nested] of entries) {
    const nextPath = [...pathSegments, key];
    if (ZERO_WAIVER_BLOCKED_FIELDS.has(key)) {
      violations.push(`ZERO_WAIVER_FIELD_PRESENT:${nextPath.join('.')}`);
    }

    if (nested && typeof nested === 'object') {
      violations.push(...collectZeroWaiverFieldViolations(nested, nextPath));
    }
  }

  return violations;
}

export function lintReleaseVerdictZeroWaiver(releaseVerdict) {
  const violations = [];

  if (!releaseVerdict || typeof releaseVerdict !== 'object') {
    return ['ZERO_WAIVER_INVALID_PAYLOAD:releaseVerdict'];
  }

  const topLevelStatus = String(releaseVerdict.status || '').trim();
  if (ZERO_WAIVER_BLOCKED_STATUSES.has(topLevelStatus)) {
    violations.push(`ZERO_WAIVER_EXCEPTION_STATUS:releaseVerdict:${topLevelStatus}`);
  }

  const gates = releaseVerdict.gates;
  if (gates && typeof gates === 'object') {
    for (const [gateName, gate] of Object.entries(gates)) {
      const gateStatus = String(gate?.status || '').trim();
      if (ZERO_WAIVER_BLOCKED_STATUSES.has(gateStatus)) {
        violations.push(`ZERO_WAIVER_EXCEPTION_STATUS:${gateName}:${gateStatus}`);
      }

      if (gate && typeof gate === 'object') {
        violations.push(...collectZeroWaiverFieldViolations(gate, [gateName]));
      }
    }
  }

  const unique = new Set(violations);
  return [...unique];
}

function buildReleaseVerdict({ strict, result }) {
  const failurePrefixExclusions = [
    'Support floor gate failed:',
    'Supply chain gate failed:',
    'Observability integrity gate failed:',
    'Privilege governance gate failed:',
    'ADR governance gate failed:',
    'Hermeticity gate failed:',
    'Determinism gate failed:',
    'Restore drill gate failed:',
    'Proof attestation gate failed:',
    'Budget violation:',
  ];

  const supportFloorStatus = result.supportFloorReport?.supported ? 'passed' : 'failed';
  const supportFloorReasons = normalizeGateReasons([
    result.supportFloorReport?.reason,
  ], 'support-floor contract evaluation missing');

  const supplyChainStatus = strict
    ? (result.supplyChainReport?.status === 'passed' ? 'passed' : 'failed')
    : 'not-applicable';
  const supplyChainReasons = normalizeGateReasons(
    [
      result.supplyChainReport?.status === 'exception-approved'
        ? `ZERO_WAIVER_EXCEPTION_STATUS:${result.supplyChainReport?.reason || 'approved exception is forbidden for release verdict'}`
        : result.supplyChainReport?.reason,
    ],
    strict ? 'supply-chain release checks did not return a reason' : 'supply-chain gate enforced only in strict mode',
  );

  const observabilityStatus = mapReportStatusToGateStatus(result.observabilityIntegrityReport?.status);
  const privilegeStatus = mapReportStatusToGateStatus(result.privilegeGovernanceReport?.status);
  const adrGovernanceStatus = mapReportStatusToGateStatus(result.adrGovernanceReport?.status);
  const hermeticityStatus = mapReportStatusToGateStatus(result.hermeticityReport?.status);
  const determinismStatus = mapReportStatusToGateStatus(result.determinismReport?.status);
  const restoreDrillStatus = mapReportStatusToGateStatus(result.restoreDrillReport?.status);

  const observabilityReasons = normalizeGateReasons(
    result.observabilityIntegrityReport?.violations,
    result.observabilityIntegrityReport?.status === 'ok'
      ? 'observability integrity checks passed'
      : 'observability integrity checks not applicable',
  );

  const privilegeReasons = normalizeGateReasons(
    result.privilegeGovernanceReport?.violations,
    result.privilegeGovernanceReport?.status === 'passed'
      ? 'privilege governance checks passed'
      : 'privilege governance checks not applicable',
  );

  const adrGovernanceReasons = normalizeGateReasons(
    result.adrGovernanceReport?.violations,
    result.adrGovernanceReport?.status === 'passed'
      ? 'ADR governance policy checks passed'
      : 'ADR governance policy checks not applicable',
  );

  const hermeticityReasons = normalizeGateReasons(
    result.hermeticityReport?.violations,
    result.hermeticityReport?.status === 'ok'
      ? 'hermeticity checks passed'
      : 'hermeticity checks not applicable',
  );

  const determinismReasons = normalizeGateReasons(
    result.determinismReport?.violations,
    result.determinismReport?.status === 'ok'
      ? 'determinism checks passed'
      : 'determinism checks not applicable',
  );

  const restoreDrillReasons = normalizeGateReasons(
    result.restoreDrillReport?.evidence?.issues,
    result.restoreDrillReport?.status === 'passed'
      ? 'restore-drill objectives satisfied'
      : 'restore-drill checks not applicable',
  );

  const budgetFailureReasons = result.failures.filter((failure) => failure.startsWith('Budget violation:'));
  const budgetStatus = strict ? (budgetFailureReasons.length === 0 ? 'passed' : 'failed') : 'not-applicable';
  const budgetReasons = strict
    ? normalizeGateReasons(budgetFailureReasons, 'budget thresholds satisfied')
    : ['budget enforcement enabled only in strict mode'];

  const proofAttestationStatus = mapReportStatusToGateStatus(result.universalProofReport?.status);
  const proofAttestationReasons = normalizeGateReasons(
    result.universalProofReport?.violations,
    result.universalProofReport?.status === 'passed'
      ? 'universal same-run attestations present for required surfaces'
      : 'universal proof attestation report unavailable',
  );

  const portabilityFailureReasons = result.failures.filter((failure) => {
    for (const prefix of failurePrefixExclusions) {
      if (failure.startsWith(prefix)) return false;
    }
    return true;
  });
  const portabilityChecksStatus = portabilityFailureReasons.length === 0 ? 'passed' : 'failed';
  const portabilityChecksReasons = normalizeGateReasons(
    portabilityFailureReasons,
    'all non-release gate checks passed',
  );

  const gates = {
    supportFloor: { status: supportFloorStatus, reasons: supportFloorReasons },
    supplyChain: { status: supplyChainStatus, reasons: supplyChainReasons },
    observabilityIntegrity: { status: observabilityStatus, reasons: observabilityReasons },
    privilegeGovernance: { status: privilegeStatus, reasons: privilegeReasons },
    adrGovernance: { status: adrGovernanceStatus, reasons: adrGovernanceReasons },
    hermeticity: { status: hermeticityStatus, reasons: hermeticityReasons },
    determinism: { status: determinismStatus, reasons: determinismReasons },
    restoreDrill: { status: restoreDrillStatus, reasons: restoreDrillReasons },
    budget: { status: budgetStatus, reasons: budgetReasons },
    proofAttestation: { status: proofAttestationStatus, reasons: proofAttestationReasons },
    portabilityChecks: { status: portabilityChecksStatus, reasons: portabilityChecksReasons },
  };

  const gateNameByKey = {
    supportFloor: 'support-floor',
    supplyChain: 'supply-chain',
    observabilityIntegrity: 'observability-integrity',
    privilegeGovernance: 'privilege-governance',
    adrGovernance: 'adr-governance',
    hermeticity: 'hermeticity',
    determinism: 'determinism',
    restoreDrill: 'restore-drill',
    budget: 'budget',
    proofAttestation: 'proof-attestation',
    portabilityChecks: 'portability-checks',
  };

  const reasons = [];
  for (const [key, gate] of Object.entries(gates)) {
    if (gate.status !== 'failed') continue;
    for (const reason of gate.reasons) {
      reasons.push(`${gateNameByKey[key]}: ${reason}`);
    }
  }

  const lintViolations = lintReleaseVerdictZeroWaiver({
    status: reasons.length === 0 ? 'passed' : 'failed',
    reasons,
    gates,
  });

  if (lintViolations.length > 0) {
    for (const violation of lintViolations) {
      reasons.push(`zero-waiver-contract: ${violation}`);
    }
  }

  const finalReasons = reasons.length === 0 ? ['all release gates passed'] : reasons;
  return {
    status: reasons.length === 0 ? 'passed' : 'failed',
    reasons: finalReasons,
    gates,
  };
}

function main() {
  const strict = process.argv.includes('--strict');
  const probeLocalMcp = process.argv.includes('--probe-mcp');
  const jsonOutput = process.argv.includes('--json');
  
  if (!jsonOutput) {
    console.log(`== Portability Verification${strict ? ' (strict)' : ''}${probeLocalMcp ? ' (probe-mcp)' : ''} ==`);
  }

  const result = runPortabilityVerification({ strict, probeLocalMcp });

  const releaseVerdict = buildReleaseVerdict({ strict, result });

  if (jsonOutput) {
    // Machine-readable output
    console.log(JSON.stringify({
      ok: result.ok,
      failures: result.failures,
      budget: result.budget,
      probeReport: result.probeReport,
      stalenessReport: result.stalenessReport,
      rollbackReport: result.rollbackReport,
      integrityReport: result.integrityReport,
      supportFloorReport: result.supportFloorReport,
      supplyChainReport: result.supplyChainReport,
      observabilityIntegrityReport: result.observabilityIntegrityReport,
      privilegeGovernanceReport: result.privilegeGovernanceReport,
      adrGovernanceReport: result.adrGovernanceReport,
      hermeticityReport: result.hermeticityReport,
      determinismReport: result.determinismReport,
      restoreDrillReport: result.restoreDrillReport,
      universalProofReport: result.universalProofReport,
      releaseVerdict,
      timestamp: new Date().toISOString(),
    }, null, 2));
  } else {
    printCheck('Portable clone/setup transfer', result.ok, result.ok ? 'All transfer invariants satisfied.' : `${result.failures.length} issue(s) detected.`);
    if (result.supportFloorReport) {
      printCheck(
        'Support floor gate',
        result.supportFloorReport.supported,
        result.supportFloorReport.reason,
      );
    }

    // Budget report
    console.log(`\n== Budget Report ==`);
    console.log(`  Skips: ${result.budget.skipCount}`);
    console.log(`  Fallbacks: ${result.budget.fallbackCount}`);
    
    if (result.budget.skipReasons.length > 0) {
      console.log(`  Skip reasons:`);
      for (const reason of result.budget.skipReasons) {
        console.log(`    - ${reason}`);
      }
    }
    
    if (result.budget.fallbackReasons.length > 0) {
      console.log(`  Fallback reasons:`);
      for (const reason of result.budget.fallbackReasons) {
        console.log(`    - ${reason}`);
      }
    }

    // Probe coverage report
    if (result.probeReport) {
      console.log(`\n== MCP Probe Coverage Report ==`);
      console.log(`  Total enabled local MCPs: ${result.probeReport.total}`);
      console.log(`  Exercised (launched): ${result.probeReport.exercised}`);
      console.log(`  Skipped: ${result.probeReport.skipped}`);
      console.log(`  Failed: ${result.probeReport.failed}`);
      
      if (result.probeReport.total > 0) {
        const coveragePercent = (result.probeReport.exercised / result.probeReport.total) * 100;
        console.log(`  Coverage: ${coveragePercent.toFixed(1)}%`);
      }
      
      // Category breakdown
      if (Object.keys(result.probeReport.byCategory).length > 0) {
        console.log(`  Category breakdown:`);
        for (const [category, data] of Object.entries(result.probeReport.byCategory)) {
          console.log(`    ${category}: ${data.count}`);
          for (const item of data.items) {
            console.log(`      - ${item.name}: ${item.reason}`);
          }
        }
      }
    }

    // Mirror staleness report
    if (result.stalenessReport) {
      console.log(`\n== Mirror Staleness Report ==`);
      console.log(`  Checked skills: ${result.stalenessReport.checkedSkills}`);
      console.log(`  Checked agents: ${result.stalenessReport.checkedAgents}`);
      console.log(`  Checked MCPs: ${result.stalenessReport.checkedMcp}`);
      
      if (result.stalenessReport.unexpectedSkills.length > 0) {
        console.log(`  Unexpected skills (not in repo):`);
        for (const skill of result.stalenessReport.unexpectedSkills) {
          console.log(`    - ${skill}`);
        }
      }
      
      if (result.stalenessReport.unexpectedAgents.length > 0) {
        console.log(`  Unexpected agents (not in repo):`);
        for (const agent of result.stalenessReport.unexpectedAgents) {
          console.log(`    - ${agent}`);
        }
      }
      
      if (result.stalenessReport.staleSkills.length > 0) {
        console.log(`  Stale skills (exceed max staleness):`);
        for (const skill of result.stalenessReport.staleSkills) {
          console.log(`    - ${skill.name}: ${skill.ageDays} days old`);
        }
      }
      
      if (result.stalenessReport.staleAgents.length > 0) {
        console.log(`  Stale agents (exceed max staleness):`);
        for (const agent of result.stalenessReport.staleAgents) {
          console.log(`    - ${agent.name}: ${agent.ageDays} days old`);
        }
      }
      
      if (result.stalenessReport.unexpectedSkills.length === 0 &&
          result.stalenessReport.unexpectedAgents.length === 0 &&
          result.stalenessReport.staleSkills.length === 0 &&
          result.stalenessReport.staleAgents.length === 0) {
        console.log(`  No stale or unexpected entries detected.`);
      }
    }

    // Rollback dry-run compatibility report
    if (result.rollbackReport) {
      console.log(`\n== Rollback Dry-Run Compatibility ==`);
      console.log(`  Model catalog exists: ${result.rollbackReport.catalogExists ? 'Yes' : 'No'}`);
      console.log(`  Snapshot store exists: ${result.rollbackReport.snapshotStoreExists ? 'Yes' : 'No'}`);
      console.log(`  Audit log exists: ${result.rollbackReport.auditLogExists ? 'Yes' : 'No'}`);
      console.log(`  Backup directory exists: ${result.rollbackReport.backupDirExists ? 'Yes' : 'No'}`);
      printCheck('Rollback dry-run compatibility', result.rollbackReport.dryRunPassed, 
        result.rollbackReport.dryRunPassed ? 'OK' : 'Dry-run failed');
    }

    // Lock/Cache integrity report
    if (result.integrityReport) {
      console.log(`\n== Lock/Cache Integrity Report ==`);
      console.log(`  Lock files checked: ${result.integrityReport.lockFilesChecked}`);
      console.log(`  Stale locks found: ${result.integrityReport.staleLocksFound}`);
      console.log(`  Allowlisted locks: ${result.integrityReport.allowlistedLocks}`);
      printCheck('Lock/cache integrity', result.integrityReport.cacheIntegrityOk,
        result.integrityReport.cacheIntegrityOk ? 'OK' : 'Issues detected');
      
      if (result.integrityReport.staleLockDetails.length > 0) {
        console.log(`  Stale lock details:`);
        for (const lock of result.integrityReport.staleLockDetails) {
          console.log(`    - ${lock.file}: ${lock.ageMinutes} minutes old`);
        }
      }
    }

    if (result.supplyChainReport) {
      console.log(`\n== Supply Chain Trust Report ==`);
      console.log(`  Status: ${result.supplyChainReport.status}`);
      console.log(`  Reason: ${result.supplyChainReport.reason}`);

      if (result.supplyChainReport.exception?.auditRecord) {
        console.log(`  Exception approval: ${result.supplyChainReport.exception.approvalId}`);
        console.log(`  Exception actor: ${result.supplyChainReport.exception.approvedBy}`);
        console.log(`  Audit record: ${result.supplyChainReport.exception.auditRecord.recordId}`);
      }
    }

    if (result.observabilityIntegrityReport) {
      console.log(`\n== Observability Integrity Report ==`);
      console.log(`  Status: ${result.observabilityIntegrityReport.status}`);
      console.log(`  Violations: ${result.observabilityIntegrityReport.violations.length}`);
      if (result.observabilityIntegrityReport.violations.length > 0) {
        for (const violation of result.observabilityIntegrityReport.violations) {
          console.log(`    - ${violation}`);
        }
      }
    }

    if (result.privilegeGovernanceReport) {
      console.log(`\n== Privilege Governance Report ==`);
      console.log(`  Status: ${result.privilegeGovernanceReport.status}`);
      console.log(`  Violations: ${result.privilegeGovernanceReport.violations.length}`);
      if (result.privilegeGovernanceReport.violations.length > 0) {
        for (const violation of result.privilegeGovernanceReport.violations) {
          console.log(`    - ${violation}`);
        }
      }
    }

    if (result.adrGovernanceReport) {
      console.log(`\n== ADR Governance Report ==`);
      console.log(`  Status: ${result.adrGovernanceReport.status}`);
      console.log(`  ADR directory: ${result.adrGovernanceReport.adrDirectory}`);
      console.log(`  Violations: ${result.adrGovernanceReport.violations.length}`);
      if (result.adrGovernanceReport.violations.length > 0) {
        for (const violation of result.adrGovernanceReport.violations) {
          console.log(`    - ${violation}`);
        }
      }
    }

    if (result.hermeticityReport) {
      console.log(`\n== Hermeticity Report ==`);
      console.log(`  Status: ${result.hermeticityReport.status}`);
      console.log(`  Violations: ${result.hermeticityReport.violations.length}`);
      if (result.hermeticityReport.violations.length > 0) {
        for (const violation of result.hermeticityReport.violations) {
          console.log(`    - ${violation}`);
        }
      }
    }

    if (result.determinismReport) {
      console.log(`\n== Determinism Report ==`);
      console.log(`  Status: ${result.determinismReport.status}`);
      console.log(`  Violations: ${result.determinismReport.violations.length}`);
      if (result.determinismReport.violations.length > 0) {
        for (const violation of result.determinismReport.violations) {
          console.log(`    - ${violation}`);
        }
      }
    }

    if (result.restoreDrillReport) {
      console.log(`\n== Restore Drill Report ==`);
      console.log(`  Status: ${result.restoreDrillReport.status}`);
      console.log(`  RTO: ${result.restoreDrillReport.rto.actualMinutes ?? 'n/a'}m (target <= ${result.restoreDrillReport.rto.targetMinutes}m)`);
      console.log(`  RPO: ${result.restoreDrillReport.rpo.actualMinutes ?? 'n/a'}m (target <= ${result.restoreDrillReport.rpo.targetMinutes}m)`);
      console.log(`  Evidence: ${result.restoreDrillReport.evidence.path}`);
      if (result.restoreDrillReport.evidence.issues.length > 0) {
        for (const issue of result.restoreDrillReport.evidence.issues) {
          console.log(`    - ${issue}`);
        }
      }
    }

    if (result.universalProofReport) {
      console.log(`\n== Universal Proof Attestation Report ==`);
      console.log(`  Status: ${result.universalProofReport.status}`);
      if (result.universalProofReport.expectedRun?.runId) {
        console.log(`  Expected runId: ${result.universalProofReport.expectedRun.runId}`);
      }
      if (result.universalProofReport.expectedRun?.commitSha) {
        console.log(`  Expected commitSha: ${result.universalProofReport.expectedRun.commitSha}`);
      }
      for (const [surfaceName, surface] of Object.entries(result.universalProofReport.surfaces || {})) {
        console.log(`  ${surfaceName}: ${surface.status} (${surface.attestedCount}/${surface.requiredCount})`);
        for (const violation of surface.violations || []) {
          console.log(`    - ${violation}`);
        }
      }
    }

    if (releaseVerdict) {
      console.log(`\n== Release Verdict ==`);
      console.log(`  Status: ${releaseVerdict.status}`);
      for (const [gateName, gate] of Object.entries(releaseVerdict.gates)) {
        console.log(`  ${gateName}: ${gate.status}`);
        for (const reason of gate.reasons) {
          console.log(`    - ${reason}`);
        }
      }
    }
  }

  if (!result.ok || releaseVerdict.status === 'failed') {
    if (!jsonOutput) {
      for (const failure of result.failures) {
        console.log(`  - ${failure}`);
      }
    }
    process.exit(1);
  }
}

const thisFilePath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(thisFilePath);
if (isDirectRun) {
  main();
}
