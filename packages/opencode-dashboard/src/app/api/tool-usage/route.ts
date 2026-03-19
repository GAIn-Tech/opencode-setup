import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { NextResponse } from 'next/server';
import { errorResponse } from '../_lib/error-response';

export const dynamic = 'force-dynamic';

/**
 * Total available tools in the system catalog.
 * Sourced from AVAILABLE_TOOLS in opencode-learning-engine/src/tool-usage-tracker.js (59 entries).
 * T25: Replaced hardcoded 60 with this constant. Update when tools are added/removed.
 */
const TOOL_CATALOG_COUNT = 59;

interface ToolInvocation {
  timestamp: string;
  tool: string;
  category: string;
  priority: string;
  success: boolean;
  errorClass?: string;
  errorCode?: string;
  context: {
    session?: string;
    task?: string;
    messageCount?: number;
  };
}

interface InvocationsData {
  invocations: ToolInvocation[];
}

function resolveHome() {
  return process.env.USERPROFILE || process.env.HOME || homedir();
}

function readInvocations(): InvocationsData {
  const file = join(resolveHome(), '.opencode', 'tool-usage', 'invocations.json');
  if (!existsSync(file)) return { invocations: [] };

  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return { invocations: [] };
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const windowMs = parseInt(searchParams.get('window') || String(86400000), 10);
    const cutoff = Date.now() - windowMs;
    const data = readInvocations();

    const recent = data.invocations.filter((inv) => {
      try {
        return new Date(inv.timestamp).getTime() >= cutoff;
      } catch {
        return false;
      }
    });

    const toolCounts: Record<string, number> = {};
    const categoryCounts: Record<string, number> = {};
    const priorityCounts: Record<string, number> = {};
    const sessionCounts: Record<string, number> = {};
    let successCount = 0;
    let failureCount = 0;
    const errorClasses: Record<string, number> = {};
    const recentByTool: Record<string, { lastUsed: string; count: number }> = {};

    for (const inv of recent) {
      toolCounts[inv.tool] = (toolCounts[inv.tool] || 0) + 1;
      categoryCounts[inv.category] = (categoryCounts[inv.category] || 0) + 1;
      priorityCounts[inv.priority] = (priorityCounts[inv.priority] || 0) + 1;
      if (inv.context?.session) {
        sessionCounts[inv.context.session] = (sessionCounts[inv.context.session] || 0) + 1;
      }
      if (inv.success) successCount++;
      else failureCount++;
      if (inv.errorClass) {
        errorClasses[inv.errorClass] = (errorClasses[inv.errorClass] || 0) + 1;
      }
      const existing = recentByTool[inv.tool];
      if (!existing || inv.timestamp > existing.lastUsed) {
        recentByTool[inv.tool] = { lastUsed: inv.timestamp, count: toolCounts[inv.tool] };
      }
    }

    const total = recent.length;
    const sortedTools = Object.entries(toolCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tool, count]) => ({ tool, count, lastUsed: recentByTool[tool].lastUsed }));

    const sortedCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([category, count]) => ({ category, count }));

    const successRate = total > 0 ? successCount / total : 0;
    const uniqueTools = Object.keys(toolCounts).length;
    const breadth = TOOL_CATALOG_COUNT;
    const breadthScore = Math.round((uniqueTools / breadth) * 100);

    return NextResponse.json({
      total,
      windowMs,
      successRate: Number(successRate.toFixed(4)),
      successCount,
      failureCount,
      uniqueTools,
      breadthScore,
      topTools: sortedTools,
      byCategory: sortedCategories,
      byPriority: priorityCounts,
      bySession: Object.entries(sessionCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([session, count]) => ({ session, count })),
      errorClasses,
      oldestEntry: recent.length > 0 ? recent[0].timestamp : null,
      newestEntry: recent.length > 0 ? recent[recent.length - 1].timestamp : null,
    });
  } catch (error: unknown) {
    return errorResponse('Failed to fetch tool usage metrics', 500, error instanceof Error ? error.message : String(error));
  }
}
