import { NextResponse } from 'next/server';
import path from 'path';
import os from 'os';
import fs from 'fs';

export const dynamic = 'force-dynamic';

interface PackageInfo {
  name: string;
  version?: string;
  hasPackageJson: boolean;
  description?: string;
}

interface HealthLogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export async function GET() {
  try {
    const projectRoot = process.cwd().replace('/packages/opencode-dashboard', '').replace('\\packages\\opencode-dashboard', '');
    const opencodePath = path.join(os.homedir(), '.opencode');
    
    // Get packages info
    const packagesDir = path.join(projectRoot, 'packages');
    const packages: PackageInfo[] = [];
    
    if (fs.existsSync(packagesDir)) {
      const dirs = fs.readdirSync(packagesDir).filter(d => 
        fs.statSync(path.join(packagesDir, d)).isDirectory() && d.startsWith('opencode-')
      );
      
      for (const dir of dirs) {
        const pkgJsonPath = path.join(packagesDir, dir, 'package.json');
        const hasPackageJson = fs.existsSync(pkgJsonPath);
        let version: string | undefined;
        let description: string | undefined;
        
        if (hasPackageJson) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'));
            version = pkg.version;
            description = pkg.description;
          } catch (e) {
            console.warn('[health] Skipping malformed package.json:', e instanceof Error ? e.message : e);
          }
        }
        
        packages.push({ name: dir, version, hasPackageJson, description });
      }
    }
    
    // Read health log
    const healthLogPath = path.join(opencodePath, 'healthd.log');
    const healthLog: HealthLogEntry[] = [];
    
    if (fs.existsSync(healthLogPath)) {
      try {
        const content = fs.readFileSync(healthLogPath, 'utf-8');
        const lines = content.split('\n').filter(Boolean).slice(-20); // Last 20 entries
        
        for (const line of lines) {
          // Parse log format: [timestamp] level: message
          const match = line.match(/\[([^\]]+)\]\s*(\w+):\s*(.+)/);
          if (match) {
            healthLog.push({
              timestamp: match[1],
              level: match[2],
              message: match[3]
            });
          } else {
            healthLog.push({
              timestamp: new Date().toISOString(),
              level: 'info',
              message: line
            });
          }
        }
      } catch {}
    }
    
    // Read session budgets
    const budgetsPath = path.join(opencodePath, 'session-budgets.json');
    let budgets: Record<string, { used: number; limit: number }> = {};
    
    if (fs.existsSync(budgetsPath)) {
      try {
        budgets = JSON.parse(fs.readFileSync(budgetsPath, 'utf-8'));
      } catch {}
    }
    
    // Calculate overall health
    const errorCount = healthLog.filter(e => e.level.toLowerCase() === 'error').length;
    const warnCount = healthLog.filter(e => e.level.toLowerCase() === 'warn' || e.level.toLowerCase() === 'warning').length;
    
    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (errorCount > 5) status = 'critical';
    else if (errorCount > 0 || warnCount > 5) status = 'degraded';
    
    return NextResponse.json({
      status,
      packages,
      healthLog: healthLog.reverse(), // Most recent first
      budgets,
      stats: {
        totalPackages: packages.length,
        packagesWithJson: packages.filter(p => p.hasPackageJson).length,
        errorCount,
        warnCount
      }
    });
  } catch (error) {
    console.error('[Health API] Error:', error);
    return NextResponse.json({
      status: 'critical',
      packages: [],
      healthLog: [],
      budgets: {},
      stats: { totalPackages: 0, packagesWithJson: 0, errorCount: 0, warnCount: 0 },
      error: String(error)
    });
  }
}
