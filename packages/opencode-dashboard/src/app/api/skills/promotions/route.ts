import { NextResponse } from 'next/server';
import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'node:crypto';
import { requireWriteAccess } from '../../_lib/write-access';
import { rateLimited } from '../../_lib/api-response';

export const dynamic = 'force-dynamic';

type PromotionEntry = {
  id: string;
  skill: string;
  action: 'promote' | 'demote';
  reason?: string;
  createdAt: string;
};

const PROMOTIONS_PATH = path.join(os.homedir(), '.opencode', 'skill-promotions.json');

async function readPromotions(): Promise<PromotionEntry[]> {
  try {
    const raw = await fs.readFile(PROMOTIONS_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const entries = await readPromotions();
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const { rateLimit } = await import('../../_lib/rate-limit');
  if (!rateLimit(`write:${ip}`, 10, 60000)) {
    return rateLimited();
  }

  const accessError = requireWriteAccess(request);
  if (accessError) {
    return accessError;
  }

  try {
    const body = await request.json();
    const skill = String(body?.skill || '').trim();
    const action = body?.action === 'demote' ? 'demote' : 'promote';
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : undefined;

    if (!skill) {
      return NextResponse.json({ error: 'Missing skill name' }, { status: 400 });
    }

    const entry: PromotionEntry = {
      id: randomUUID(),
      skill,
      action,
      reason,
      createdAt: new Date().toISOString(),
    };

    const existing = await readPromotions();
    const next = [entry, ...existing].slice(0, 200);
    await fs.mkdir(path.dirname(PROMOTIONS_PATH), { recursive: true });
    await fs.writeFile(PROMOTIONS_PATH, JSON.stringify(next, null, 2), 'utf-8');

    return NextResponse.json({ entry });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to record promotion', details: String(error) }, { status: 500 });
  }
}
