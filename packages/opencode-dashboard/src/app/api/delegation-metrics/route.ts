import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { NextResponse } from 'next/server';
import { errorResponse } from '../_lib/api-response';

export const dynamic = 'force-dynamic';

interface DelegationEvent {
  timestamp: string;
  session_id: string;
  category: string;
  task_type: string;
  description: string;
  load_skills: string[];
  background: boolean;
  continued_session: string | null;
  success: boolean;
  processed: boolean;
}

interface DelegationLog {
  events: DelegationEvent[];
}

function resolveHome() {
  return process.env.USERPROFILE || process.env.HOME || homedir();
}

function readDelegationLog(): DelegationLog {
  const file = join(resolveHome(), '.opencode', 'delegation-log.json');
  if (!existsSync(file)) return { events: [] };

  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { events: [] };
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const windowMs = parseInt(searchParams.get('window') || String(86400000), 10);
    const cutoff = Date.now() - windowMs;
    const data = readDelegationLog();

    const recent = data.events.filter((ev) => {
      try {
        return new Date(ev.timestamp).getTime() >= cutoff;
      } catch {
        return false;
      }
    });

    const byTaskType: Record<string, { total: number; success: number; failure: number }> = {};
    const byCategory: Record<string, { total: number; success: number; failure: number }> = {};
    const bySession: Record<string, number> = {};
    const skillUsage: Record<string, number> = {};
    let backgroundCount = 0;
    let continuedCount = 0;
    let successCount = 0;
    let failureCount = 0;
    const recentEvents = recent
      .slice(-50)
      .map((ev) => ({
        timestamp: ev.timestamp,
        session_id: ev.session_id,
        task_type: ev.task_type,
        category: ev.category,
        description: ev.description,
        success: ev.success,
        background: ev.background,
        load_skills: ev.load_skills,
      }));

    for (const ev of recent) {
      if (!byTaskType[ev.task_type]) {
        byTaskType[ev.task_type] = { total: 0, success: 0, failure: 0 };
      }
      byTaskType[ev.task_type].total++;
      if (ev.success) {
        byTaskType[ev.task_type].success++;
        successCount++;
      } else {
        byTaskType[ev.task_type].failure++;
        failureCount++;
      }

      if (!byCategory[ev.category]) {
        byCategory[ev.category] = { total: 0, success: 0, failure: 0 };
      }
      byCategory[ev.category].total++;
      if (ev.success) byCategory[ev.category].success++;
      else byCategory[ev.category].failure++;

      if (ev.session_id) {
        bySession[ev.session_id] = (bySession[ev.session_id] || 0) + 1;
      }
      if (ev.background) backgroundCount++;
      if (ev.continued_session) continuedCount++;

      for (const skill of ev.load_skills) {
        skillUsage[skill] = (skillUsage[skill] || 0) + 1;
      }
    }

    const total = recent.length;
    const successRate = total > 0 ? successCount / total : 0;
    const taskTypes = Object.entries(byTaskType)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([task_type, stats]) => ({
        task_type,
        total: stats.total,
        successRate: stats.total > 0 ? Number((stats.success / stats.total).toFixed(4)) : 0,
      }));

    const categories = Object.entries(byCategory)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([category, stats]) => ({
        category,
        total: stats.total,
        successRate: stats.total > 0 ? Number((stats.success / stats.total).toFixed(4)) : 0,
      }));

    return NextResponse.json({
      total,
      windowMs,
      successRate: Number(successRate.toFixed(4)),
      successCount,
      failureCount,
      backgroundCount,
      continuedCount,
      byTaskType: taskTypes,
      byCategory: categories,
      bySession: Object.entries(bySession)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([session_id, count]) => ({ session_id, count })),
      topSkills: Object.entries(skillUsage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([skill, count]) => ({ skill, count })),
      recentEvents,
      oldestEntry: recent.length > 0 ? recent[0].timestamp : null,
      newestEntry: recent.length > 0 ? recent[recent.length - 1].timestamp : null,
    });
  } catch (error: unknown) {
    return errorResponse('Failed to fetch delegation metrics', 500, error instanceof Error ? error.message : String(error));
  }
}
