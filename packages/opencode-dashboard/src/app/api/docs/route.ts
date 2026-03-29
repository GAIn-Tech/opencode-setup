import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { requireReadAccess } from '../_lib/write-access';
import { rateLimited } from '../_lib/api-response';

export const dynamic = 'force-dynamic';

const OPENCODE_DIRNAME = '.opencode';

function resolveDataHome(): string {
  if (process.env.OPENCODE_DATA_HOME) return process.env.OPENCODE_DATA_HOME;
  if (process.env.XDG_DATA_HOME) return path.join(process.env.XDG_DATA_HOME, 'opencode');
  const homeDir = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(homeDir, OPENCODE_DIRNAME);
}

interface DocEntry {
  name: string;
  path: string;
  category: string;
}

interface DocLocation {
  dir: string;
  files?: string[];
  category: string;
  scanSubdirs?: boolean;
}

function getProjectRoot(): string {
  // During build, __dirname is not defined in ESM modules
  // Try multiple fallback strategies
  const possibleRoots = [
    process.cwd(),
    // Try to get __dirname equivalent
    typeof __dirname !== 'undefined' ? __dirname : '',
    // Fallback: use current file path if available
    typeof __filename !== 'undefined' ? path.dirname(__filename) : '',
  ].filter(Boolean);

  for (const root of possibleRoots) {
    const normalized = root.replace(/[/\\]packages[/\\]opencode-dashboard$/, '');
    try {
      // Check if this looks like a valid project root
      if (normalized.includes('opencode-setup') || normalized.includes('opencode')) {
        return normalized;
      }
    } catch { /* skip */ }
  }

  // Ultimate fallback
  return process.cwd().replace(/[/\\]packages[/\\]opencode-dashboard$/, '');
}

async function findDocs(): Promise<DocEntry[]> {
  const docs: DocEntry[] = [];
  const projectRoot = getProjectRoot();

  const locations: DocLocation[] = [
    { dir: projectRoot, category: 'Root' },
    { dir: path.join(projectRoot, 'docs'), category: 'Docs' },
    { dir: path.join(projectRoot, '.sisyphus', 'plans'), category: 'Plans' },
    { dir: path.join(projectRoot, '.sisyphus', 'docs'), category: 'Architecture' },
    { dir: path.join(projectRoot, 'packages'), category: 'Packages', scanSubdirs: true },
    { dir: path.join(projectRoot, 'plugins'), category: 'Plugins', scanSubdirs: true },
    { dir: path.join(projectRoot, 'mcp-servers'), category: 'MCP Servers' },
    { dir: path.join(projectRoot, 'project-templates'), category: 'Templates' },
    { dir: resolveDataHome(), files: ['PLUGINS-LOCAL.md'], category: 'User' },
  ];

  for (const loc of locations) {
    try {
      if (loc.files) {
        for (const file of loc.files) {
          const fullPath = path.join(loc.dir, file);
          try {
            await fs.access(fullPath);
            docs.push({ name: file, path: fullPath, category: loc.category });
          } catch (e) {
            console.warn('[docs] Skipping inaccessible file:', e instanceof Error ? e.message : e);
          }
        }
      } else if (loc.scanSubdirs) {
        try {
          const subdirs = await fs.readdir(loc.dir, { withFileTypes: true });
          for (const subdir of subdirs) {
            if (subdir.isDirectory()) {
              try {
                const subPath = path.join(loc.dir, subdir.name);
                const subEntries = await fs.readdir(subPath, { withFileTypes: true });
                for (const entry of subEntries) {
                  if (entry.isFile() && entry.name.endsWith('.md')) {
                    docs.push({
                      name: `${subdir.name}/${entry.name}`,
                      path: path.join(subPath, entry.name),
                      category: loc.category,
                    });
                  }
                }
              } catch { /* skip */ }
            }
          }
        } catch (e) {
          console.warn('[docs] Skipping unreadable directory:', e instanceof Error ? e.message : e);
        }
      } else {
        try {
          const entries = await fs.readdir(loc.dir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.md')) {
              docs.push({
                name: entry.name,
                path: path.join(loc.dir, entry.name),
                category: loc.category,
              });
            }
          }
        } catch { /* skip */ }
      }
    } catch (err) {
      console.error('Error scanning docs:', err);
    }
  }

  return docs;
}

export async function GET(request: NextRequest) {
  // Rate limiting
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? request.headers.get('x-real-ip') ?? 'unknown';
  const { rateLimit } = await import('../_lib/rate-limit');
  const rateLimitResult = rateLimit(`read:${ip}`, 50, 60000);
  if (!rateLimitResult.allowed) {
    return rateLimited('Too many requests', {
      limit: rateLimitResult.limit,
      remaining: rateLimitResult.remaining,
      resetAt: rateLimitResult.resetAt
    });
  }

  const { searchParams } = new URL(request.url);
  const file = searchParams.get('file');

  if (file) {
    try {
      const content = await fs.readFile(file, 'utf-8');
      return NextResponse.json({ content });
    } catch (error) {
      console.error('[docs] Failed to read file:', file, error);
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
  }

  const docs = await findDocs();
  return NextResponse.json({ docs });
}
