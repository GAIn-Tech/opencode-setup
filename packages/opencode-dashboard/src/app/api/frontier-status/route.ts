import { NextResponse } from 'next/server';
import * as fsPromises from 'fs/promises';
import * as path from 'path';

export const dynamic = 'force-dynamic';

type CheckStatus = 'pass' | 'fail' | 'unknown';

async function readJsonSafe(filePath: string): Promise<Record<string, unknown> | null> {
  try {
    const content = await fsPromises.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function deriveFrontierStatus(report: Record<string, unknown> | null): { status: CheckStatus; summary: Record<string, unknown> } {
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

function deriveSecurityStatus(report: Record<string, unknown> | null): { status: CheckStatus; summary: Record<string, unknown> } {
  if (!report) {
    return {
      status: 'unknown',
      summary: { reason: 'security_report_missing' },
    };
  }

  const summary = report?.summary as Record<string, unknown> | undefined;
  const ok = summary?.ok === true;
  const semgrep = summary?.semgrep as Record<string, unknown> | undefined;
  const secrets = summary?.secrets as Record<string, unknown> | undefined;
  const semgrepHigh = Number(semgrep?.high || 0);
  const secretFindings = Number(secrets?.findings || 0);
  const signature = report?.signature as Record<string, unknown> | undefined;

  return {
    status: ok && semgrepHigh === 0 && secretFindings === 0 ? 'pass' : 'fail',
    summary: {
      ok,
      semgrep_high: semgrepHigh,
      secret_findings: secretFindings,
      advisory: Boolean(report?.advisory),
      report_id: report?.report_id || null,
      signature: signature?.value ? 'present' : 'missing',
    },
  };
}

export async function GET() {
  const root = process.cwd().replace(/[\\/]packages[\\/]opencode-dashboard$/, '');
  const frontierReportPath = path.join(root, 'reports', 'frontier', 'frontier-verify-all.json');
  const securityReportPath = path.join(root, 'reports', 'security', 'security-audit-free.json');

  const frontier = await readJsonSafe(frontierReportPath);
  const security = await readJsonSafe(securityReportPath);

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
