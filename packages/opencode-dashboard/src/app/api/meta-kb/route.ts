import fs from 'node:fs';
import path from 'node:path';
import { NextResponse } from 'next/server';

const DRIFT_REPORT_FILE_RE = /^agents-drift-report-\d{4}-\d{2}-\d{2}(?:-[^.]+)?\.md$/;

type DriftStatus = {
  has_drift: boolean;
  report_path: string | null;
};

type MetaKBHealth = {
  generated_at: string | null;
  age_hours: number | null;
  is_stale: boolean;
  staleness_warning: string | null;
  total_records: number;
  by_category: Record<string, number>;
  by_risk_level: Record<string, number>;
  drift_status: DriftStatus;
};

export const dynamic = 'force-dynamic';

function getProjectRoot(): string {
  return process.cwd()
    .replace('/packages/opencode-dashboard', '')
    .replace('\\packages\\opencode-dashboard', '');
}

function computeAgeHours(generatedAt: string | null): number | null {
  if (!generatedAt) {
    return null;
  }

  const generatedMs = new Date(generatedAt).getTime();
  if (Number.isNaN(generatedMs)) {
    return null;
  }

  const ageMs = Date.now() - generatedMs;
  return Math.round((ageMs / (1000 * 60 * 60)) * 10) / 10;
}

function countBuckets(input: unknown): Record<string, number> {
  const output: Record<string, number> = {};

  if (!input || typeof input !== 'object') {
    return output;
  }

  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      output[key] = value.length;
      continue;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      output[key] = value;
      continue;
    }

    output[key] = 0;
  }

  return output;
}

async function readLatestDriftReport(projectRoot: string): Promise<DriftStatus> {
  const proposalsDir = path.join(projectRoot, '.sisyphus', 'proposals');
  if (!fs.existsSync(proposalsDir)) {
    return { has_drift: false, report_path: null };
  }

  const reportFiles = fs
    .readdirSync(proposalsDir)
    .filter((name) => DRIFT_REPORT_FILE_RE.test(name))
    .sort((a, b) => {
      const aMtime = fs.statSync(path.join(proposalsDir, a)).mtimeMs;
      const bMtime = fs.statSync(path.join(proposalsDir, b)).mtimeMs;
      return bMtime - aMtime;
    });

  if (reportFiles.length === 0) {
    return { has_drift: false, report_path: null };
  }

  const latest = reportFiles[0];
  return {
    has_drift: true,
    report_path: path.posix.join('.sisyphus', 'proposals', latest),
  };
}

export async function GET() {
  const projectRoot = getProjectRoot();
  const indexPath = path.join(projectRoot, 'opencode-config', 'meta-knowledge-index.json');

  if (!fs.existsSync(indexPath)) {
    return NextResponse.json({
      generated_at: null,
      age_hours: null,
      is_stale: false,
      staleness_warning: null,
      total_records: 0,
      by_category: {},
      by_risk_level: {},
      drift_status: await readLatestDriftReport(projectRoot),
    } satisfies MetaKBHealth);
  }

  const indexRaw = fs.readFileSync(indexPath, 'utf-8');
  const index = JSON.parse(indexRaw) as {
    generated_at?: string;
    total_records?: number;
    by_category?: Record<string, unknown>;
    by_risk_level?: Record<string, unknown>;
  };

  const generatedAt = index.generated_at ?? null;
  const ageHours = computeAgeHours(generatedAt);
  const isStale = ageHours !== null && ageHours > 24;

  return NextResponse.json({
    generated_at: generatedAt,
    age_hours: ageHours,
    is_stale: isStale,
    staleness_warning: isStale ? 'Meta-KB index is older than 24 hours.' : null,
    total_records: typeof index.total_records === 'number' ? index.total_records : 0,
    by_category: countBuckets(index.by_category),
    by_risk_level: countBuckets(index.by_risk_level),
    drift_status: await readLatestDriftReport(projectRoot),
  } satisfies MetaKBHealth);
}
