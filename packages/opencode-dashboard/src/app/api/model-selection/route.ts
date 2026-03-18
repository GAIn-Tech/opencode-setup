import { readdirSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { NextResponse } from 'next/server';
import { errorResponse } from '../_lib/error-response';

export const dynamic = 'force-dynamic';

function resolveHome() {
  return process.env.USERPROFILE || process.env.HOME || homedir();
}

function readModelSelectionMetrics() {
  const sessionsDir = join(resolveHome(), '.opencode', 'tool-usage', 'sessions');
  if (!existsSync(sessionsDir)) return { sessions: [], uniqueModels: [], avgTokensPerSession: 0, totalSessions: 0, delegationEvents: [] };

  // Primary source: dedicated model-selection tracking file
  const modelSelFile = join(sessionsDir, '~-model-selection.json');
  const delegationEvents = [];
  if (existsSync(modelSelFile)) {
    try {
      const raw = JSON.parse(readFileSync(modelSelFile, 'utf8'));
      const events = Array.isArray(raw) ? raw : (raw.events || []);
      for (const e of events) {
        delegationEvents.push({
          sessionId: e.sessionId || 'unknown',
          model: e.modelId || 'unknown',
          provider: e.provider || 'unknown',
          taskType: e.taskType || 'general',
          success: e.success !== false,
          estimatedCost: e.estimatedCost || 0,
          timestamp: e.timestamp ? new Date(e.timestamp).toISOString() : null,
        });
      }
    } catch { /* skip */ }
  }

  // Fallback: extract model info from budget files
  const files = readdirSync(sessionsDir).filter((file) => file.endsWith('-budget.json'));
  const sessions = [];
  const modelCounts: Record<string, number> = {};
  let totalTokens = 0;

  for (const file of files) {
    try {
      const raw = JSON.parse(readFileSync(join(sessionsDir, file), 'utf8'));
      const model = raw.model_id || 'unknown';
      const tokens = Number(raw.estimated_tokens) || 0;
      sessions.push({
        sessionId: file.replace(/-budget\.json$/, ''),
        model,
        tokens,
        provider: raw.provider || 'unknown',
        cost: raw.cumulative_cost || 0,
        updatedAt: raw.last_updated || null,
      });
      modelCounts[model] = (modelCounts[model] || 0) + 1;
      totalTokens += tokens;
    } catch {
      // skip malformed files
    }
  }

  const uniqueModels = Object.entries(modelCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([model, count]) => ({ model, count }));

  return {
    totalSessions: sessions.length,
    sessions,
    uniqueModels,
    avgTokensPerSession: sessions.length > 0 ? Math.round(totalTokens / sessions.length) : 0,
    modelDiversity: Object.keys(modelCounts).length,
    delegationEvents,
  };
}

export async function GET() {
  try {
    const data = readModelSelectionMetrics();
    return NextResponse.json(data);
  } catch (error: unknown) {
    return errorResponse('Failed to fetch model selection metrics', 500, error instanceof Error ? error.message : String(error));
  }
}
