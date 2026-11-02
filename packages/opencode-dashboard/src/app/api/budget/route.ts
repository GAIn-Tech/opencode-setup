import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { NextResponse } from 'next/server';
import { errorResponse } from '../_lib/api-response';

export const dynamic = 'force-dynamic';

type BudgetStatus = 'ok' | 'warn' | 'error' | 'exceeded';

type BudgetRemediation = {
  action: 'PROACTIVE_COMPRESSION' | 'CRITICAL_WARNING' | 'MANDATORY_COMPRESSION' | 'BLOCK' | 'EMERGENCY_RECOVERY' | 'NONE';
  description: string;
  steps: string[];
  must_compress: boolean;
  must_block: boolean;
  grace_period_ms: number;
  next_step: string;
};

function resolveHome() {
  return process.env.USERPROFILE || process.env.HOME || homedir();
}

function toStatus(pct: number): BudgetStatus {
  if (pct >= 1) return 'exceeded';
  if (pct >= 0.8) return 'error';
  if (pct >= 0.75) return 'warn';
  return 'ok';
}

function getRemediation(pct: number): BudgetRemediation {
  if (pct >= 0.95) {
    return {
      action: 'EMERGENCY_RECOVERY',
      description: 'Budget nearly exhausted. Immediate action required.',
      steps: [
        'Enable emergency context compression',
        'Switch to a cheaper model if possible',
        'Complete or save the current task immediately',
        'Start a new session for follow-up work if needed'
      ],
      must_compress: true,
      must_block: true,
      grace_period_ms: 0,
      next_step: 'Execute emergency compression or complete task'
    };
  }
  if (pct >= 0.85) {
    return {
      action: 'BLOCK',
      description: 'Budget exhausted enough that new operations should be blocked until compression occurs.',
      steps: [
        'Run urgent context compression',
        'Save or finish the current unit of work',
        'Review token-heavy reads and prune them',
        'Consider resuming in a fresh session'
      ],
      must_compress: true,
      must_block: true,
      grace_period_ms: 0,
      next_step: 'Compress immediately before continuing'
    };
  }
  if (pct >= 0.8) {
    return {
      action: 'MANDATORY_COMPRESSION',
      description: 'Budget is at the critical threshold. Compression is mandatory.',
      steps: [
        'Enable context compression',
        'Prune non-essential context',
        'Prefer more efficient lookups over full-file reads',
        'Downgrade model tier if appropriate'
      ],
      must_compress: true,
      must_block: false,
      grace_period_ms: 30000,
      next_step: 'Compress context within 30 seconds'
    };
  }
  if (pct >= 0.75) {
    return {
      action: 'CRITICAL_WARNING',
      description: 'Budget is trending critical. Compression should happen soon.',
      steps: [
        'Enable compression now',
        'Review session growth',
        'Avoid unnecessary large reads'
      ],
      must_compress: false,
      must_block: false,
      grace_period_ms: 30000,
      next_step: 'Compress or finish the current task within 30 seconds'
    };
  }
  if (pct >= 0.65) {
    return {
      action: 'PROACTIVE_COMPRESSION',
      description: 'Budget is approaching critical thresholds. Proactive compression is recommended.',
      steps: [
        'Consider enabling compression',
        'Prune stale context',
        'Prefer targeted search tools over broad reads'
      ],
      must_compress: false,
      must_block: false,
      grace_period_ms: 60000,
      next_step: 'Enable compression if budget continues to rise'
    };
  }
  return {
    action: 'NONE',
    description: 'Budget is healthy.',
    steps: [],
    must_compress: false,
    must_block: false,
    grace_period_ms: 0,
    next_step: 'No action required'
  };
}

function readGovernorBudgets() {
  const budgetPath = join(resolveHome(), '.opencode', 'session-budgets.json');
  if (!existsSync(budgetPath)) return [];

  const raw = JSON.parse(readFileSync(budgetPath, 'utf8'));
  const sessions = raw.sessions || {};
  const summaries: Array<Record<string, unknown>> = [];

  for (const [sessionId, models] of Object.entries(sessions as Record<string, Record<string, number>>)) {
    for (const [model, used] of Object.entries(models || {})) {
      const max = 100000;
      const pct = max > 0 ? Number(used) / max : 0;
      summaries.push({
        sessionId,
        model,
        provider: String(model).split('/')[0] || 'unknown',
        used: Number(used) || 0,
        actual_tokens: Number(used) || 0,
        remaining: Math.max(0, max - (Number(used) || 0)),
        max,
        pct: Number(pct.toFixed(4)),
        pct_formatted: `${Math.round(pct * 100)}%`,
        cost: 0,
        status: toStatus(pct),
        warnings: [],
        distill_event_count: 0,
        remediation: getRemediation(pct),
        updatedAt: raw.savedAt || null,
      });
    }
  }

  return summaries;
}

function readBudgetSummaries() {
  const governorSummaries = readGovernorBudgets();
  if (governorSummaries.length > 0) {
    return governorSummaries.sort((a, b) => Number(b.used) - Number(a.used));
  }

  const sessionsDir = join(resolveHome(), '.opencode', 'tool-usage', 'sessions');
  if (!existsSync(sessionsDir)) return [];

  const files = readdirSync(sessionsDir).filter((file) => file.endsWith('-budget.json'));

  return files.map((file) => {
    const raw = JSON.parse(readFileSync(join(sessionsDir, file), 'utf8'));
    const used = Number(raw.estimated_tokens) || 0;
    const actual = Number(raw.actual_tokens) || used;
    const max = Number(raw.model_limit) || 0;
    const pct = max > 0 ? used / max : 0;
    return {
      sessionId: raw.session_id || file.replace(/-budget\.json$/, ''),
      model: raw.model_id || 'unknown',
      provider: raw.provider || 'unknown',
      used,
      actual_tokens: actual,
      remaining: Math.max(0, max - used),
      max,
      pct: Number(pct.toFixed(4)),
      pct_formatted: `${Math.round(pct * 100)}%`,
      cost: raw.cumulative_cost || 0,
      status: toStatus(pct),
      warnings: raw.warnings_emitted || [],
      distill_event_count: (raw.distill_events || []).length,
      remediation: getRemediation(pct),
      updatedAt: raw.last_updated || null,
    };
  }).sort((a, b) => b.used - a.used);
}

export async function GET() {
  try {
    return NextResponse.json(readBudgetSummaries());
  } catch (error: unknown) {
    return errorResponse('Failed to fetch budget summaries', 500, error instanceof Error ? error.message : String(error));
  }
}
