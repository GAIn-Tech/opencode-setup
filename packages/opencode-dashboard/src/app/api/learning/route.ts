import { NextResponse } from 'next/server';
import path from 'path';
import os from 'os';
import fsPromises from 'fs/promises';

export const dynamic = 'force-dynamic';

interface AntiPattern {
  type: string;
  count: number;
  severity: 'high' | 'medium' | 'low';
  last_seen: string;
  context?: string;
}

interface PositivePattern {
  type: string;
  count: number;
  success_rate: number;
  last_seen: string;
}

function normalizeLearningReportShape(report: Record<string, unknown>) {
  const anti = (report?.anti_patterns || {}) as Record<string, unknown>;
  const positive = (report?.positive_patterns || {}) as Record<string, unknown>;

  const antiItems = Array.isArray(anti.items)
    ? anti.items
    : Array.isArray(anti.top_severe)
      ? anti.top_severe.map((item: Record<string, unknown>) => ({
          type: item.type || 'unknown',
          count: Number(item.weight || item.count || 0),
          severity: item.severity || 'medium',
          last_seen: item.last_seen || item.updated_at || new Date(0).toISOString(),
          context: item.context || item.description,
        }))
      : [];

  const positiveItems = Array.isArray(positive.items)
    ? positive.items
    : Array.isArray(positive.top_strategies)
      ? positive.top_strategies.map((item: Record<string, unknown>) => ({
          type: item.type || 'unknown',
          count: Number(item.count || item.weight || 0),
          success_rate: Number(item.success_rate || 0),
          last_seen: item.last_seen || item.updated_at || new Date(0).toISOString(),
        }))
      : [];

  return {
    ...report,
    anti_patterns: {
      ...anti,
      items: antiItems,
    },
    positive_patterns: {
      ...positive,
      items: positiveItems,
    },
  };
}

export async function GET() {
  try {
    const learningPath = path.join(os.homedir(), '.opencode', 'learning');
    
    // Demo data for when real data doesn't exist or is empty
    const demoData = {
      engine_version: '1.0.0',
      anti_patterns: {
        total: 12,
        by_type: { shotgun_debug: 5, type_suppression: 3, broken_state: 2, inefficient_solution: 2 },
        by_severity: { high: 7, medium: 3, low: 2 },
        items: [
          { type: 'shotgun_debug', count: 5, severity: 'high' as const, last_seen: '2026-02-13T10:30:00Z', context: 'src/api/*.ts - random edits without diagnosis' },
          { type: 'type_suppression', count: 3, severity: 'high' as const, last_seen: '2026-02-12T15:20:00Z', context: 'Used @ts-ignore in 3 files' },
          { type: 'broken_state', count: 2, severity: 'high' as const, last_seen: '2026-02-11T09:00:00Z', context: 'Committed while tests failing' },
          { type: 'inefficient_solution', count: 2, severity: 'medium' as const, last_seen: '2026-02-10T14:45:00Z', context: 'Used grep+read instead of LSP' },
        ]
      },
      positive_patterns: {
        total: 8,
        by_type: { efficient_debug: 4, creative_solution: 2, good_delegation: 2 },
        avg_success_rate: 0.73,
        items: [
          { type: 'efficient_debug', count: 4, success_rate: 0.85, last_seen: '2026-02-13T11:00:00Z' },
          { type: 'creative_solution', count: 2, success_rate: 0.78, last_seen: '2026-02-12T16:30:00Z' },
          { type: 'good_delegation', count: 2, success_rate: 0.65, last_seen: '2026-02-11T10:15:00Z' },
        ]
      },
      insights: [
        'shotgun_debug appears 40% of failed debugging sessions',
        'type_suppression leads to 3x more follow-up errors',
        'Teams using LSP save 45% more tokens on average'
      ],
      recommendations: [
        'Run systematic-debugging skill before making changes',
        'Use AST tools for refactoring instead of regex',
        'Consider using test-driven-development for bug fixes'
      ],
      fallback: true,
      data_fidelity: 'demo',
      status_reason: 'missing_state',
      demo: true,
      _note: 'Demo data - run OpenCode to generate real learning data'
    };

    // Check if learning directory exists
    const learningPathExists = await fsPromises.access(learningPath).then(() => true).catch(() => false);
    if (!learningPathExists) {
      return NextResponse.json(demoData);
    }

    // Try to load from learning engine package (optional)
    const enginePath = path.resolve(process.cwd(), '../opencode-learning-engine/src/index.js');
    let engine: { getReport: () => Promise<Record<string, unknown>> } | null = null;
    let engineWarning: string | null = null;

    const enginePathExists = await fsPromises.access(enginePath).then(() => true).catch(() => false);
    if (!enginePathExists) {
      engineWarning = 'Learning engine package not found, using file fallback';
    } else {
      let LearningEngineCtor: (new (opts: Record<string, unknown>) => { getReport: () => Promise<Record<string, unknown>> }) | null = null;
      try {
        const loaded = require('../../../../../opencode-learning-engine/src/index.js');
        LearningEngineCtor = loaded?.LearningEngine;
        if (!LearningEngineCtor) {
          engineWarning = 'Learning engine export missing, using file fallback';
        }
      } catch (requireError) {
        engineWarning = `Learning engine unavailable, using file fallback: ${requireError instanceof Error ? requireError.message : String(requireError)}`;
      }

      if (LearningEngineCtor) {
        try {
          engine = new LearningEngineCtor({ autoLoad: true });
        } catch (initError) {
          engineWarning = `Learning engine initialization failed, using file fallback: ${initError instanceof Error ? initError.message : String(initError)}`;
        }
      }
    }

    if (engine) {
      try {
        const report = normalizeLearningReportShape(await engine.getReport());
        if (engineWarning) {
          return NextResponse.json({
            ...report,
            fallback: true,
            data_fidelity: 'degraded',
            status_reason: 'engine_warning',
            warning: engineWarning,
          });
        }
        return NextResponse.json({
          ...report,
          fallback: false,
          data_fidelity: 'live',
          status_reason: 'ok',
        });
      } catch (pkgError) {
        engineWarning = `Learning engine report failed, using file fallback: ${pkgError instanceof Error ? pkgError.message : String(pkgError)}`;
      }
    }

    // Fallback: read files directly
      const antiPatternsFile = path.join(learningPath, 'anti-patterns.json');
      const positivePatternsFile = path.join(learningPath, 'positive-patterns.json');
      
      let antiPatterns: AntiPattern[] = [];
      let positivePatterns: PositivePattern[] = [];
      
        if (await fsPromises.access(antiPatternsFile).then(() => true).catch(() => false)) {
          try {
            const raw = JSON.parse(await fsPromises.readFile(antiPatternsFile, 'utf-8'));
            antiPatterns = Array.isArray(raw)
              ? raw
              : (raw.patterns || raw.items || []);
          } catch { /* empty or malformed file */ }
        }
      
        if (await fsPromises.access(positivePatternsFile).then(() => true).catch(() => false)) {
          try {
            const raw = JSON.parse(await fsPromises.readFile(positivePatternsFile, 'utf-8'));
            positivePatterns = Array.isArray(raw)
              ? raw
              : (raw.patterns || raw.items || []);
          } catch { /* empty or malformed file */ }
        }
      
      // If both files are empty/invalid, return demo data
      if (antiPatterns.length === 0 && positivePatterns.length === 0) {
        return NextResponse.json(
          {
            ...demoData,
            data_fidelity: 'degraded',
            status_reason: 'empty_state',
            warning: engineWarning || 'Using fallback data - engine unavailable'
          },
          { status: 503 }
        );
      }
      
      // Build report from real data
      const byType: Record<string, number> = {};
      const bySeverity: Record<string, number> = { high: 0, medium: 0, low: 0 };
      
      antiPatterns.forEach(p => {
        byType[p.type] = (byType[p.type] || 0) + p.count;
        bySeverity[p.severity] = (bySeverity[p.severity] || 0) + p.count;
      });
      
      const positiveByType: Record<string, number> = {};
      let totalSuccessRate = 0;
      
      positivePatterns.forEach(p => {
        positiveByType[p.type] = (positiveByType[p.type] || 0) + p.count;
        totalSuccessRate += p.success_rate;
      });
      
      return NextResponse.json({
        engine_version: '1.0.0',
        anti_patterns: {
          total: antiPatterns.reduce((sum, p) => sum + p.count, 0),
          by_type: byType,
          by_severity: bySeverity,
          items: antiPatterns.slice(0, 50)
        },
        positive_patterns: {
          total: positivePatterns.reduce((sum, p) => sum + p.count, 0),
          by_type: positiveByType,
          avg_success_rate: positivePatterns.length ? totalSuccessRate / positivePatterns.length : 0,
          items: positivePatterns.slice(0, 50)
        },
        insights: [],
        recommendations: antiPatterns.length > 0 
          ? ['Review anti-patterns to improve workflow efficiency.']
          : ['No anti-patterns detected. Keep up the good work!'],
        fallback: true,
        data_fidelity: 'degraded',
        status_reason: 'file_fallback',
        ...(engineWarning ? { warning: engineWarning } : {})
      });
  } catch (error) {
    console.error('[Learning API] Error:', error);
    return NextResponse.json(
      {
        engine_version: '1.0.0',
        anti_patterns: { total: 0, by_type: {}, by_severity: {}, items: [] },
        positive_patterns: { total: 0, by_type: {}, avg_success_rate: 0, items: [] },
        insights: [],
        recommendations: [],
        fallback: true,
        data_fidelity: 'degraded',
        status_reason: 'unexpected_error',
        warning: 'Using fallback data - engine unavailable',
        error: String(error)
      },
      { status: 503 }
    );
  }
}
