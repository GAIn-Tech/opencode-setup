import { NextResponse } from 'next/server';
import { getDataSource } from '@/lib/data-sources';
import { getSessionTokens } from '@/lib/provider-status-store';

export async function GET() {
  try {
    const dataSource = getDataSource();
    const runs = await dataSource.getRuns();
    
    // Join token data with runs
    const runsWithTokens = runs.map((run) => {
      const sessionTokens = getSessionTokens(run.id);
      return {
        ...run,
        session_tokens: sessionTokens,
      };
    });
    
    return NextResponse.json(runsWithTokens);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
