import { NextResponse } from 'next/server';
import { getDataSource } from '@/lib/data-sources';

export async function GET() {
  try {
    const dataSource = getDataSource();
    const runs = await dataSource.getRuns();
    return NextResponse.json(runs);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
