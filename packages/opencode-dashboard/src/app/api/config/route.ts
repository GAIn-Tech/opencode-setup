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

// Lazy-load config-loader modules (CommonJS)
let configLoaderCache: any = null;
let configStateCache: any = null;

function getConfigLoader() {
  if (!configLoaderCache) {
    try {
      configLoaderCache = require('../../../../../opencode-config-loader/src/central-config.js');
    } catch (err) {
      console.warn('[Config API] Failed to load central-config module:', err);
      configLoaderCache = null;
    }
  }
  return configLoaderCache;
}

function getConfigState() {
  if (!configStateCache) {
    try {
      configStateCache = require('../../../../../opencode-config-loader/src/central-config-state.js');
    } catch (err) {
      console.warn('[Config API] Failed to load central-config-state module:', err);
      configStateCache = null;
    }
  }
  return configStateCache;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const view = searchParams.get('view');
    
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
      // Central config (raw)
      centralConfig: {
        path: path.join(ocConfig, 'central-config.json'),
        data: readJsonSafe(path.join(ocConfig, 'central-config.json'))
      },
      // Central config effective (merged with RL state)
      centralConfigEffective: {
        data: null
      }
    };

    // Compute effective config if view=effective or if centralConfig exists
    if (view === 'effective' || configs.centralConfig.data) {
      const configLoader = getConfigLoader();
      const configState = getConfigState();
      
      if (configLoader && configState && configs.centralConfig.data) {
        try {
          const centralConfigPath = path.join(ocConfig, 'central-config.json');
          const loadedConfig = configLoader.loadCentralConfig(centralConfigPath);
          const rlState = configState.loadRlState();
          const globalConfidence = loadedConfig.rl?.override_min_confidence || 0.85;
          
          const effectiveConfig = configLoader.mergeCentralConfig({
            central: loadedConfig,
            rlState,
            globalConfidence
          });
          
          configs.centralConfigEffective.data = effectiveConfig;
        } catch (err) {
          console.warn('[Config API] Failed to compute effective config:', err);
          configs.centralConfigEffective.data = null;
        }
      }
    }

    // If view=effective, return only effective config
    if (view === 'effective') {
      return NextResponse.json({
        centralConfigEffective: configs.centralConfigEffective
      });
    }

    return NextResponse.json(configs);
  } catch (error) {
    console.error('[Config API] Error:', error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { configKey, data, config_version } = body;

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
      centralConfig: path.join(ocConfig, 'central-config.json'),
    };

    const filePath = configPaths[configKey];
    if (!filePath) {
      return NextResponse.json({ error: `Unknown config key: ${configKey}` }, { status: 400 });
    }

    // Special handling for centralConfig: validate schema and handle concurrency
    if (configKey === 'centralConfig') {
      const configLoader = getConfigLoader();
      const configState = getConfigState();
      
      if (configLoader && configState) {
        try {
          // Validate against schema
          const schemaPath = path.join(ocConfig, 'central-config.schema.json');
          let schema;
          try {
            schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
          } catch (err) {
            return NextResponse.json({ error: `Failed to load schema: ${err}` }, { status: 500 });
          }
          
          const validationErrors = configLoader.validateSchema(data, schema);
          if (validationErrors.length > 0) {
            return NextResponse.json({ 
              error: 'Schema validation failed',
              details: validationErrors 
            }, { status: 400 });
          }
          
          // Check optimistic concurrency control
          if (config_version !== undefined) {
            const currentData = readJsonSafe(filePath);
            const currentVersion = (currentData as any)?.config_version || 0;
            if (config_version !== currentVersion) {
              return NextResponse.json({ 
                error: 'Stale config version',
                expected: config_version,
                current: currentVersion
              }, { status: 409 });
            }
          }
          
          // Increment config_version
          const newData = {
            ...data,
            config_version: ((data as any)?.config_version || 0) + 1
          };
          
          // Append audit log entry
          const auditEntry = {
            timestamp: new Date().toISOString(),
            action: 'update',
            section: 'centralConfig',
            param: 'full',
            oldValue: readJsonSafe(filePath),
            newValue: newData,
            source: 'dashboard',
            user: 'system'
          };
          configState.appendAuditEntry(auditEntry);
          
          // Write the data
          const dir = path.dirname(filePath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(filePath, JSON.stringify(newData, null, 2), 'utf-8');
          
          return NextResponse.json({ 
            success: true, 
            path: filePath,
            config_version: newData.config_version
          });
        } catch (err) {
          console.error('[Config API] centralConfig error:', err);
          return NextResponse.json({ error: String(err) }, { status: 500 });
        }
      }
    }

    // Standard handling for other configs
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
