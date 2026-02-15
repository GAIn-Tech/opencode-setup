import { NextResponse } from 'next/server';
import { getDataSource } from '@/lib/data-sources';

export async function GET() {
  try {
    const dataSource = getDataSource();
    const runs = await dataSource.getRuns();
    return NextResponse.json(runs);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
