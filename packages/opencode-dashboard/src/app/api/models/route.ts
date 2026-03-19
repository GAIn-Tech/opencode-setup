import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getWriteActor, requireWriteAccess } from '../_lib/write-access';
import { writeJsonAtomic } from '../_lib/write-json-atomic';
import { appendWriteAuditEntry } from '../_lib/write-audit';
import { rateLimited, badRequest, internalError, successResponse } from '../_lib/api-response';
import { errorResponse } from '../_lib/api-response';

// Extract real model usage from message files
function getRealModelUsage(): Record<string, { selections: number; successes: number; failures: number; totalLatency: number }> | null {
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
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? request.headers.get('x-real-ip') ?? 'unknown';
  const { rateLimit } = await import('../_lib/rate-limit');
  const rateLimitResult = rateLimit(`write:${ip}`, 10, 60000);
  if (!rateLimitResult.allowed) {
    return rateLimited('Too many requests', {
      limit: rateLimitResult.limit,
      remaining: rateLimitResult.remaining,
      resetAt: rateLimitResult.resetAt
    });
  }

  const accessError = requireWriteAccess(request, 'models:write');
  if (accessError) {
    return accessError;
  }

  try {
    const projectRoot = process.cwd().replace(/[\/\\]packages[\/\\]opencode-dashboard$/, '');
    const policiesPath = path.join(projectRoot, 'packages', 'opencode-model-router-x', 'src', 'policies.json');
    
    const body = await request.json();
    const { policies } = body;
    const actor = getWriteActor(request);
    
     if (!policies) {
       return badRequest('No policies provided');
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
    
    await writeJsonAtomic(policiesPath, mergedPolicies);

    await appendWriteAuditEntry({
      route: '/api/models',
      actor,
      action: 'update-model-policies',
      metadata: {
        policiesPath,
        sectionCount: Object.keys(policies || {}).length
      }
    });
    
      return successResponse({ message: 'Policies saved' });
     } catch (error: unknown) {
       const message = error instanceof Error ? error.message : 'Unknown error';
       console.error('[Models API] POST error:', error);
       return errorResponse(message);
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
    } catch (err) {
      console.warn('[Models API] Failed to parse policies.json:', err);
    }

    // 2. Model router live state (real data only - no mock)
    let routerState: Record<string, unknown> | null = null;
    const routerStatePath = path.join(os.homedir(), '.opencode', 'model-router-state.json');
    try {
      if (fs.existsSync(routerStatePath)) {
        routerState = JSON.parse(fs.readFileSync(routerStatePath, 'utf-8'));
      }
    } catch (err) {
      console.warn('[Models API] Failed to parse model-router-state.json:', err);
    }

    // 3. RL manager state
    let rlState = null;
    const rlStatePath = path.join(os.homedir(), '.opencode', 'skill-rl.json');
    try {
      if (fs.existsSync(rlStatePath)) {
        rlState = JSON.parse(fs.readFileSync(rlStatePath, 'utf-8'));
      }
    } catch (err) {
      console.warn('[Models API] Failed to parse skill-rl.json:', err);
    }

    // 4. Rate-limit fallback config
    let fallbackConfig = null;
    const fallbackPath = path.join(projectRoot, 'opencode-config', 'rate-limit-fallback.json');
    try {
      if (fs.existsSync(fallbackPath)) {
        fallbackConfig = JSON.parse(fs.readFileSync(fallbackPath, 'utf-8'));
      }
    } catch (err) {
      console.warn('[Models API] Failed to parse rate-limit-fallback.json:', err);
    }

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
      console.error('[Models API] GET error:', error);
      return errorResponse(message);
    }
 }
 
 export async function PUT(request: Request) {
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? request.headers.get('x-real-ip') ?? 'unknown';
  const { rateLimit } = await import('../_lib/rate-limit');
  const rateLimitResult = rateLimit(`write:${ip}`, 10, 60000);
  if (!rateLimitResult.allowed) {
    return rateLimited('Too many requests', {
      limit: rateLimitResult.limit,
      remaining: rateLimitResult.remaining,
      resetAt: rateLimitResult.resetAt
    });
  }

  const accessError = requireWriteAccess(request, 'models:write');
  if (accessError) {
    return accessError;
  }

  try {
    const projectRoot = process.cwd().replace(/[\/\\]packages[\/\\]opencode-dashboard$/, '');
    const policiesPath = path.join(projectRoot, 'packages', 'opencode-model-router-x', 'src', 'policies.json');
    
    const body = await request.json();
    const { policies } = body;
    const actor = getWriteActor(request);
    
     if (!policies) {
       return badRequest('No policies provided');
     }
     
     let existingPolicies = {};
     if (fs.existsSync(policiesPath)) {
       try {
         existingPolicies = JSON.parse(fs.readFileSync(policiesPath, 'utf-8'));
       } catch (e) {
         console.error('Failed to parse existing policies:', e);
       }
     }

     const mergedPolicies = {
       ...existingPolicies,
       ...policies,
     };
     
     await writeJsonAtomic(policiesPath, mergedPolicies);

     await appendWriteAuditEntry({
       route: '/api/models',
       actor,
       action: 'update-model-policies',
       metadata: {
         policiesPath,
         sectionCount: Object.keys(policies || {}).length
       }
     });
     
     return NextResponse.json({ success: true, message: 'Policies updated' });
     } catch (error: unknown) {
       const message = error instanceof Error ? error.message : 'Unknown error';
       console.error('[Models API] PUT error:', error);
       return errorResponse(message);
     }
 }
 
 export async function PATCH(request: Request) {
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? request.headers.get('x-real-ip') ?? 'unknown';
  const { rateLimit } = await import('../_lib/rate-limit');
  const rateLimitResult = rateLimit(`write:${ip}`, 10, 60000);
  if (!rateLimitResult.allowed) {
    return rateLimited('Too many requests', {
      limit: rateLimitResult.limit,
      remaining: rateLimitResult.remaining,
      resetAt: rateLimitResult.resetAt
    });
  }

  const accessError = requireWriteAccess(request, 'models:write');
  if (accessError) {
    return accessError;
  }

  try {
    const projectRoot = process.cwd().replace(/[\/\\]packages[\/\\]opencode-dashboard$/, '');
    const policiesPath = path.join(projectRoot, 'packages', 'opencode-model-router-x', 'src', 'policies.json');
    
    const body = await request.json();
    const { policies } = body;
    const actor = getWriteActor(request);
    
     if (!policies) {
       return badRequest('No policies provided');
     }
     
     let existingPolicies = {};
     if (fs.existsSync(policiesPath)) {
       try {
         existingPolicies = JSON.parse(fs.readFileSync(policiesPath, 'utf-8'));
       } catch (e) {
         console.error('Failed to parse existing policies:', e);
       }
     }

     const mergedPolicies = {
       ...existingPolicies,
       ...policies,
     };
     
     await writeJsonAtomic(policiesPath, mergedPolicies);

     await appendWriteAuditEntry({
       route: '/api/models',
       actor,
       action: 'update-model-policies',
       metadata: {
         policiesPath,
         sectionCount: Object.keys(policies || {}).length
       }
     });
     
      return successResponse({ message: 'Policies patched' });
     } catch (error: unknown) {
       const message = error instanceof Error ? error.message : 'Unknown error';
       console.error('[Models API] PATCH error:', error);
       return errorResponse(message);
     }
 }
 
 export async function DELETE(request: Request) {
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? request.headers.get('x-real-ip') ?? 'unknown';
  const { rateLimit } = await import('../_lib/rate-limit');
  const rateLimitResult = rateLimit(`write:${ip}`, 10, 60000);
  if (!rateLimitResult.allowed) {
    return rateLimited('Too many requests', {
      limit: rateLimitResult.limit,
      remaining: rateLimitResult.remaining,
      resetAt: rateLimitResult.resetAt
    });
  }

  const accessError = requireWriteAccess(request, 'models:write');
  if (accessError) {
    return accessError;
  }

  try {
    const projectRoot = process.cwd().replace(/[\/\\]packages[\/\\]opencode-dashboard$/, '');
    const policiesPath = path.join(projectRoot, 'packages', 'opencode-model-router-x', 'src', 'policies.json');
    const actor = getWriteActor(request);
    
    if (fs.existsSync(policiesPath)) {
      fs.unlinkSync(policiesPath);
    }

    await appendWriteAuditEntry({
      route: '/api/models',
      actor,
      action: 'delete-model-policies',
      metadata: {
        policiesPath
      }
    });
    
     return NextResponse.json({ success: true, message: 'Policies deleted' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[Models API] DELETE error:', error);
      return errorResponse(message);
    }
 }
