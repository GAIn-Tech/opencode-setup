import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';
import { NextResponse } from 'next/server';
import { errorResponse } from '../_lib/api-response';

export const dynamic = 'force-dynamic';

/**
 * Tool quality metrics from eval harness
 * Stored in ~/.opencode/tool-quality/*.json
 */
interface ToolEvalResult {
  tool_name: string;
  success_rate: number;
  avg_tokens: number;
  avg_latency_ms: number;
  latency_p50_ms: number;
  latency_p95_ms: number;
  error_rate: number;
  confusion_rate: number;
  tests_total: number;
  tests_passed: number;
  timestamp: string;
  details?: unknown[];
}

/**
 * Quality threshold configuration
 * Tools below these thresholds are flagged for review
 */
const QUALITY_THRESHOLDS = {
  success_rate: 0.7,       // Below 70% success = flag
  confusion_rate: 0.2,     // Above 20% confusion = flag  
  avg_tokens: 25000,       // Above 25k tokens = flag (truncation indicator)
  avg_latency_ms: 10000,   // Above 10s latency = flag
};

function resolveHome() {
  return process.env.USERPROFILE || process.env.HOME || homedir();
}

/**
 * Read all tool eval results from tool-quality directory
 */
function readToolEvals(): ToolEvalResult[] {
  const dir = join(resolveHome(), '.opencode', 'tool-quality');
  if (!existsSync(dir)) return [];

  try {
    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    const results: ToolEvalResult[] = [];

    for (const file of files) {
      try {
        const data = JSON.parse(readFileSync(join(dir, file), 'utf8'));
        // Handle both single result and array of results
        if (Array.isArray(data)) {
          results.push(...data);
        } else if (data.tool_name) {
          results.push(data);
        }
      } catch {
        // Skip invalid files
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Get latest eval result for each tool (most recent timestamp)
 */
function getLatestByTool(evals: ToolEvalResult[]): Map<string, ToolEvalResult> {
  const latest = new Map<string, ToolEvalResult>();
  
  for (const evalResult of evals) {
    const existing = latest.get(evalResult.tool_name);
    if (!existing || new Date(evalResult.timestamp) > new Date(existing.timestamp)) {
      latest.set(evalResult.tool_name, evalResult);
    }
  }

  return latest;
}

/**
 * Check if tool is below quality thresholds
 */
function checkQualityFlags(result: ToolEvalResult): string[] {
  const flags: string[] = [];

  if (result.success_rate < QUALITY_THRESHOLDS.success_rate) {
    flags.push(`success_rate_low`);
  }
  if (result.confusion_rate > QUALITY_THRESHOLDS.confusion_rate) {
    flags.push(`confusion_rate_high`);
  }
  if (result.avg_tokens > QUALITY_THRESHOLDS.avg_tokens) {
    flags.push(`token_usage_high`);
  }
  if (result.avg_latency_ms > QUALITY_THRESHOLDS.avg_latency_ms) {
    flags.push(`latency_high`);
  }

  return flags;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tool = searchParams.get('tool');
    const includeDetails = searchParams.get('details') === 'true';

    const evals = readToolEvals();
    const latestByTool = getLatestByTool(evals);

    // Filter by tool if specified
    let results = Array.from(latestByTool.values());
    if (tool) {
      results = results.filter(e => e.tool_name.toLowerCase().includes(tool.toLowerCase()));
    }

    // Add quality flags and sort by health score
    const resultsWithFlags = results.map(result => ({
      ...result,
      qualityFlags: checkQualityFlags(result),
      healthScore: calculateHealthScore(result),
    }));

    // Sort by health score (lowest first = most problematic)
    resultsWithFlags.sort((a, b) => a.healthScore - b.healthScore);

    // Summary statistics
    const totalTools = resultsWithFlags.length;
    const flaggedTools = resultsWithFlags.filter(r => r.qualityFlags.length > 0);
    const avgSuccessRate = totalTools > 0
      ? resultsWithFlags.reduce((sum, r) => sum + r.success_rate, 0) / totalTools
      : 0;
    const avgConfusionRate = totalTools > 0
      ? resultsWithFlags.reduce((sum, r) => sum + r.confusion_rate, 0) / totalTools
      : 0;

    const response: Record<string, unknown> = {
      totalTools,
      flaggedToolsCount: flaggedTools.length,
      flaggedTools: flaggedTools.map(t => ({
        tool: t.tool_name,
        flags: t.qualityFlags,
        healthScore: t.healthScore,
      })),
      summary: {
        avgSuccessRate: Math.round(avgSuccessRate * 10000) / 10000,
        avgConfusionRate: Math.round(avgConfusionRate * 10000) / 10000,
        totalTestsRun: resultsWithFlags.reduce((sum, r) => sum + r.tests_total, 0),
        totalTestsPassed: resultsWithFlags.reduce((sum, r) => sum + r.tests_passed, 0),
      },
      thresholds: QUALITY_THRESHOLDS,
      tools: includeDetails 
        ? resultsWithFlags 
        : resultsWithFlags.map(({ details, ...rest }) => rest),
    };

    return NextResponse.json(response);
  } catch (error: unknown) {
    return errorResponse('Failed to fetch tool quality metrics', 500, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Calculate health score (0-100, higher is better)
 */
function calculateHealthScore(result: ToolEvalResult): number {
  let score = 100;

  // Deduct for low success rate
  score -= Math.max(0, (QUALITY_THRESHOLDS.success_rate - result.success_rate) * 100);

  // Deduct for high confusion rate
  score -= result.confusion_rate * 50;

  // Deduct for high latency
  if (result.avg_latency_ms > QUALITY_THRESHOLDS.avg_latency_ms) {
    score -= 20;
  }

  // Deduct for high token usage (truncation indicator)
  if (result.avg_tokens > QUALITY_THRESHOLDS.avg_tokens * 0.8) {
    score -= 10;
  }

  return Math.max(0, Math.round(score));
}
