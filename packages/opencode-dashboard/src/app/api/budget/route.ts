import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

type BudgetStatus = 'ok' | 'warn' | 'error' | 'exceeded';

function resolveHome() {
  return process.env.USERPROFILE || process.env.HOME || homedir();
}

function toStatus(pct: number): BudgetStatus {
  if (pct >= 1) return 'exceeded';
  if (pct >= 0.8) return 'error';
  if (pct >= 0.75) return 'warn';
  return 'ok';
}

function readBudgetSummaries() {
  const sessionsDir = join(resolveHome(), '.opencode', 'tool-usage', 'sessions');
  if (!existsSync(sessionsDir)) return [];

  const files = readdirSync(sessionsDir).filter((file) => file.endsWith('-budget.json'));

  return files.map((file) => {
    const raw = JSON.parse(readFileSync(join(sessionsDir, file), 'utf8'));
    const used = Number(raw.estimated_tokens) || 0;
    const max = Number(raw.model_limit) || 0;
    const pct = max > 0 ? used / max : 0;
    return {
      sessionId: raw.session_id || file.replace(/-budget\.json$/, ''),
      model: raw.model_id || 'unknown',
      used,
      max,
      pct: Number(pct.toFixed(4)),
      status: toStatus(pct),
      updatedAt: raw.last_updated || null,
    };
  }).sort((a, b) => b.used - a.used);
}

export async function GET() {
  try {
    return NextResponse.json(readBudgetSummaries());
  } catch (error: unknown) {
    return NextResponse.json(
      { error: 'Failed to fetch budget summaries', message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
