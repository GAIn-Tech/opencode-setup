import { NextResponse } from 'next/server';
import { getDataSource } from '@/lib/data-sources';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const dataSource = getDataSource();
    const runId = params.id;

    const run = await dataSource.getRun(runId);
    if (!run) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    const steps = await dataSource.getSteps(runId);
    const events = await dataSource.getEvents(runId);

    return NextResponse.json({
      ...run,
      steps,
      events
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
