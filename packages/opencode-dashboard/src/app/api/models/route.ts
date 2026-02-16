import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Extract real model usage from message files
function getRealModelUsage(): Record<string, any> | null {
  const homeDir = os.homedir();
  const messagesDir = path.join(homeDir, '.opencode', 'messages');
  
  if (!fs.existsSync(messagesDir)) {
    return null;
  }
  
  try {
    const sessionDirs = fs.readdirSync(messagesDir);
    const modelStats: Record<string, { selections: number; successes: number; failures: number; totalLatency: number }> = {};
    
    for (const sessionId of sessionDirs) {
      const sessionPath = path.join(messagesDir, sessionId);
      if (!fs.statSync(sessionPath).isDirectory()) continue;
      
      const files = fs.readdirSync(sessionPath).filter(f => f.endsWith('.json'));
      
      for (const f of files) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(sessionPath, f), 'utf-8'));
          const modelId = content?.model?.modelID;
          
          if (!modelId) continue;
          
          if (!modelStats[modelId]) {
            modelStats[modelId] = { selections: 0, successes: 0, failures: 0, totalLatency: 0 };
          }
          
          modelStats[modelId].selections++;
          
          // Estimate success/failure from outcome if available
          if (content.outcome?.success !== undefined) {
            if (content.outcome.success) {
              modelStats[modelId].successes++;
            } else {
              modelStats[modelId].failures++;
            }
          }
          
          // Track latency if available
          if (content.time?.latency_ms) {
            modelStats[modelId].totalLatency += content.time.latency_ms;
          }
        } catch {
          continue;
        }
      }
    }
    
    return Object.entries(modelStats).length > 0 ? modelStats : null;
  } catch {
    return null;
  }
}

// POST: Save model policies (for UI editing)
export async function POST(request: Request) {
  try {
    const projectRoot = process.cwd().replace(/[\/\\]packages[\/\\]opencode-dashboard$/, '');
    const policiesPath = path.join(projectRoot, 'packages', 'opencode-model-router-x', 'src', 'policies.json');
    
    const body = await request.json();
    const { policies } = body;
    
    if (!policies) {
      return NextResponse.json({ error: 'No policies provided' }, { status: 400 });
    }
    
    // Read existing policies to preserve keys not sent by frontend (e.g. tuning, cost_tiers)
    let existingPolicies = {};
    if (fs.existsSync(policiesPath)) {
      try {
        existingPolicies = JSON.parse(fs.readFileSync(policiesPath, 'utf-8'));
      } catch (e) {
        console.error('Failed to parse existing policies:', e);
      }
    }

    // Merge new policies into existing ones
    // This ensures that if the frontend only sends a subset (e.g. models, intentRouting),
    // we don't lose other configuration sections.
    const mergedPolicies = {
      ...existingPolicies,
      ...policies,
      // Ensure specific sections are merged if needed, but top-level spread is usually sufficient
      // if the frontend sends complete sections.
    };
    
    fs.writeFileSync(policiesPath, JSON.stringify(mergedPolicies, null, 2));
    
    return NextResponse.json({ success: true, message: 'Policies saved' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const projectRoot = process.cwd().replace(/[\/\\]packages[\/\\]opencode-dashboard$/, '');
    
    // 1. Model policies (strength/weakness matrix)
    let policies = null;
    const policiesPath = path.join(projectRoot, 'packages', 'opencode-model-router-x', 'src', 'policies.json');
    try {
      if (fs.existsSync(policiesPath)) {
        policies = JSON.parse(fs.readFileSync(policiesPath, 'utf-8'));
      }
    } catch {}

    // 2. Model router live state (real data only - no mock)
    let routerState: Record<string, unknown> | null = null;
    const routerStatePath = path.join(os.homedir(), '.opencode', 'model-router-state.json');
    try {
      if (fs.existsSync(routerStatePath)) {
        routerState = JSON.parse(fs.readFileSync(routerStatePath, 'utf-8'));
      }
    } catch {}

    // 3. RL manager state
    let rlState = null;
    const rlStatePath = path.join(os.homedir(), '.opencode', 'skill-rl-state.json');
    try {
      if (fs.existsSync(rlStatePath)) {
        rlState = JSON.parse(fs.readFileSync(rlStatePath, 'utf-8'));
      }
    } catch {}

    // 4. Rate-limit fallback config
    let fallbackConfig = null;
    const fallbackPath = path.join(projectRoot, 'opencode-config', 'rate-limit-fallback.json');
    try {
      if (fs.existsSync(fallbackPath)) {
        fallbackConfig = JSON.parse(fs.readFileSync(fallbackPath, 'utf-8'));
      }
    } catch {}

    // 5. Real model usage from messages (computed from actual sessions)
    const realModelUsage = getRealModelUsage();

    return NextResponse.json({
      policies,
      routerState,
      rlState,
      fallbackConfig,
      realModelUsage
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
