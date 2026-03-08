import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const dynamic = 'force-dynamic';

interface MetaKBSummary {
  status: 'healthy' | 'stale' | 'missing';
  generated_at: string | null;
  age_hours: number | null;
  total_records: number;
  source_files: { learning_updates: number; agents_md: number };
  by_risk_level: Record<string, number>;
  category_count: number;
  path_group_count: number;
  anti_pattern_count: number;
  convention_count: number;
  command_count: number;
  drift: { total_drift: number; total_ok: number; files_checked: number } | null;
}

function computeAgeHours(generatedAt: string): number {
  const now = Date.now();
  const generated = new Date(generatedAt).getTime();
  if (isNaN(generated)) return -1;
  return Math.round((now - generated) / (1000 * 60 * 60) * 10) / 10;
}

function countArrayEntries(obj: Record<string, unknown[]>): number {
  return Object.values(obj).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0);
}

export async function GET() {
  try {
    const projectRoot = process.cwd()
      .replace('/packages/opencode-dashboard', '')
      .replace('\\packages\\opencode-dashboard', '');

    const indexPath = path.join(projectRoot, 'opencode-config', 'meta-knowledge-index.json');

    if (!fs.existsSync(indexPath)) {
      return NextResponse.json({
        status: 'missing',
        generated_at: null,
        age_hours: null,
        total_records: 0,
        source_files: { learning_updates: 0, agents_md: 0 },
        by_risk_level: {},
        category_count: 0,
        path_group_count: 0,
        anti_pattern_count: 0,
        convention_count: 0,
        command_count: 0,
        drift: null,
      } satisfies MetaKBSummary);
    }

    const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
    const ageHours = index.generated_at ? computeAgeHours(index.generated_at) : null;
    const isStale = ageHours !== null && ageHours > 24;

    const riskCounts: Record<string, number> = {};
    for (const [level, entries] of Object.entries(index.by_risk_level || {})) {
      riskCounts[level] = Array.isArray(entries) ? entries.length : 0;
    }

    // Run drift check inline (lightweight — reads AGENTS.md files only)
    let drift: MetaKBSummary['drift'] = null;
    try {
      const driftScript = path.join(projectRoot, 'scripts', 'check-agents-drift.mjs');
      if (fs.existsSync(driftScript)) {
        const { execSync } = await import('child_process');
        const driftOutput = execSync(`node "${driftScript}" --json`, {
          cwd: projectRoot,
          encoding: 'utf-8',
          timeout: 10_000,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        const driftReport = JSON.parse(driftOutput);
        drift = {
          total_drift: driftReport.total_drift ?? 0,
          total_ok: driftReport.total_ok ?? 0,
          files_checked: driftReport.files?.length ?? 0,
        };
      }
    } catch {
      // Drift check is best-effort — don't fail the endpoint
    }

    const summary: MetaKBSummary = {
      status: isStale ? 'stale' : 'healthy',
      generated_at: index.generated_at ?? null,
      age_hours: ageHours,
      total_records: index.total_records ?? 0,
      source_files: index.source_files ?? { learning_updates: 0, agents_md: 0 },
      by_risk_level: riskCounts,
      category_count: Object.keys(index.by_category || {}).length,
      path_group_count: Object.keys(index.by_affected_path || {}).length,
      anti_pattern_count: Array.isArray(index.anti_patterns) ? index.anti_patterns.length : 0,
      convention_count: Array.isArray(index.conventions) ? index.conventions.length : 0,
      command_count: Array.isArray(index.commands) ? index.commands.length : 0,
      drift,
    };

    return NextResponse.json(summary);
  } catch (error) {
    console.error('[Meta-KB API] Error:', error);
    return NextResponse.json(
      {
        status: 'missing',
        generated_at: null,
        age_hours: null,
        total_records: 0,
        source_files: { learning_updates: 0, agents_md: 0 },
        by_risk_level: {},
        category_count: 0,
        path_group_count: 0,
        anti_pattern_count: 0,
        convention_count: 0,
        command_count: 0,
        drift: null,
        error: String(error),
      },
      { status: 500 }
    );
  }
}
