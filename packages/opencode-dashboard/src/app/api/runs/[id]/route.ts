import { NextResponse } from 'next/server';
import { getDataSource } from '@/lib/data-sources';
import { notFound, internalError } from '../../_lib/api-response';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const dataSource = await getDataSource();
    const runId = params.id;

    const run = await dataSource.getRun(runId);
    if (!run) {
      return notFound('Run not found');
    }

    const steps = await dataSource.getSteps(runId);
    const events = await dataSource.getEvents(runId);

    return NextResponse.json({
      ...run,
      steps,
      events
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return internalError(message);
  }
}
