import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';

type CheckStatus = 'pass' | 'fail' | 'unknown';

function readJsonSafe(filePath: string): any | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function deriveFrontierStatus(report: any): { status: CheckStatus; summary: any } {
  if (!report) {
    return {
      status: 'unknown',
      summary: { reason: 'frontier_report_missing' },
    };
  }

  const failed = Number(report.failed || 0);
  const total = Number(report.total || 0);
  const passed = Number(report.passed || 0);

  return {
    status: failed === 0 && total > 0 ? 'pass' : 'fail',
    summary: {
      total,
      passed,
      failed,
    },
  };
}

function deriveSecurityStatus(report: any): { status: CheckStatus; summary: any } {
  if (!report) {
    return {
      status: 'unknown',
      summary: { reason: 'security_report_missing' },
    };
  }

  const ok = report?.summary?.ok === true;
  const semgrepHigh = Number(report?.summary?.semgrep?.high || 0);
  const secretFindings = Number(report?.summary?.secrets?.findings || 0);

  return {
    status: ok && semgrepHigh === 0 && secretFindings === 0 ? 'pass' : 'fail',
    summary: {
      ok,
      semgrep_high: semgrepHigh,
      secret_findings: secretFindings,
      advisory: Boolean(report?.advisory),
      report_id: report?.report_id || null,
      signature: report?.signature?.value ? 'present' : 'missing',
    },
  };
}

export async function GET() {
  const root = process.cwd().replace(/[\\/]packages[\\/]opencode-dashboard$/, '');
  const frontierReportPath = path.join(root, 'reports', 'frontier', 'frontier-verify-all.json');
  const securityReportPath = path.join(root, 'reports', 'security', 'security-audit-free.json');

  const frontier = readJsonSafe(frontierReportPath);
  const security = readJsonSafe(securityReportPath);

  const frontierStatus = deriveFrontierStatus(frontier);
  const securityStatus = deriveSecurityStatus(security);

  const overall: CheckStatus =
    frontierStatus.status === 'pass' && securityStatus.status === 'pass'
      ? 'pass'
      : frontierStatus.status === 'unknown' && securityStatus.status === 'unknown'
        ? 'unknown'
        : 'fail';

  return NextResponse.json({
    generated_at: new Date().toISOString(),
    overall,
    frontier: {
      status: frontierStatus.status,
      summary: frontierStatus.summary,
      source: frontierReportPath,
      generated_at: frontier?.generated_at || null,
    },
    security: {
      status: securityStatus.status,
      summary: securityStatus.summary,
      source: securityReportPath,
      generated_at: security?.generated_at || null,
    },
  });
}
