import { NextResponse } from 'next/server';
import path from 'path';
import os from 'os';
import fs from 'fs';

export const dynamic = 'force-dynamic';

function readJsonSafe(filePath: string): object | null {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {}
  return null;
}

export async function GET() {
  try {
    const projectRoot = process.cwd().replace('/packages/opencode-dashboard', '').replace('\\packages\\opencode-dashboard', '');
    
    const ocConfig = path.join(projectRoot, 'opencode-config');
    
    // Read configs from different locations
    const configs = {
      // Core configs
      projectConfig: {
        path: path.join(projectRoot, '.opencode.config.json'),
        data: readJsonSafe(path.join(projectRoot, '.opencode.config.json'))
      },
      userConfig: {
        path: path.join(os.homedir(), '.config', 'opencode', 'opencode.json'),
        data: readJsonSafe(path.join(os.homedir(), '.config', 'opencode', 'opencode.json'))
      },
      ohMyConfig: {
        path: path.join(ocConfig, 'oh-my-opencode.json'),
        data: readJsonSafe(path.join(ocConfig, 'oh-my-opencode.json'))
      },
      compoundConfig: {
        path: path.join(os.homedir(), '.config', 'opencode', 'compound-engineering.json'),
        data: readJsonSafe(path.join(os.homedir(), '.config', 'opencode', 'compound-engineering.json'))
      },
      // Model & routing configs
      rateLimitFallback: {
        path: path.join(ocConfig, 'rate-limit-fallback.json'),
        data: readJsonSafe(path.join(ocConfig, 'rate-limit-fallback.json'))
      },
      modelPolicies: {
        path: path.join(projectRoot, 'packages', 'opencode-model-router-x', 'src', 'policies.json'),
        data: readJsonSafe(path.join(projectRoot, 'packages', 'opencode-model-router-x', 'src', 'policies.json'))
      },
      // Infrastructure configs
      antigravity: {
        path: path.join(ocConfig, 'antigravity.json'),
        data: readJsonSafe(path.join(ocConfig, 'antigravity.json'))
      },
      supermemory: {
        path: path.join(ocConfig, 'supermemory.json'),
        data: readJsonSafe(path.join(ocConfig, 'supermemory.json'))
      },
      deploymentState: {
        path: path.join(ocConfig, 'deployment-state.json'),
        data: readJsonSafe(path.join(ocConfig, 'deployment-state.json'))
      },
      // Learning configs
      learningUpdatePolicy: {
        path: path.join(ocConfig, 'learning-update-policy.json'),
        data: readJsonSafe(path.join(ocConfig, 'learning-update-policy.json'))
      },
      // Session budgets
      sessionBudgets: {
        path: path.join(os.homedir(), '.opencode', 'session-budgets.json'),
        data: readJsonSafe(path.join(os.homedir(), '.opencode', 'session-budgets.json'))
      },
    };

    return NextResponse.json(configs);
  } catch (error) {
    console.error('[Config API] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { configKey, data } = body;

    if (!configKey || data === undefined) {
      return NextResponse.json({ error: 'Missing configKey or data' }, { status: 400 });
    }

    const projectRoot = process.cwd().replace('/packages/opencode-dashboard', '').replace('\\packages\\opencode-dashboard', '');
    const ocConfig = path.join(projectRoot, 'opencode-config');

    // Map config keys to file paths
    const configPaths: Record<string, string> = {
      projectConfig: path.join(projectRoot, '.opencode.config.json'),
      userConfig: path.join(os.homedir(), '.config', 'opencode', 'opencode.json'),
      ohMyConfig: path.join(ocConfig, 'oh-my-opencode.json'),
      compoundConfig: path.join(os.homedir(), '.config', 'opencode', 'compound-engineering.json'),
      rateLimitFallback: path.join(ocConfig, 'rate-limit-fallback.json'),
      modelPolicies: path.join(projectRoot, 'packages', 'opencode-model-router-x', 'src', 'policies.json'),
      antigravity: path.join(ocConfig, 'antigravity.json'),
      supermemory: path.join(ocConfig, 'supermemory.json'),
      deploymentState: path.join(ocConfig, 'deployment-state.json'),
      learningUpdatePolicy: path.join(ocConfig, 'learning-update-policy.json'),
      sessionBudgets: path.join(os.homedir(), '.opencode', 'session-budgets.json'),
    };

    const filePath = configPaths[configKey];
    if (!filePath) {
      return NextResponse.json({ error: `Unknown config key: ${configKey}` }, { status: 400 });
    }

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (mkdirError) {
        return NextResponse.json({ error: String(mkdirError) }, { status: 500 });
      }
    }

    // Write the data
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');

    return NextResponse.json({ success: true, path: filePath });
  } catch (error) {
    console.error('[Config API] Save error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
