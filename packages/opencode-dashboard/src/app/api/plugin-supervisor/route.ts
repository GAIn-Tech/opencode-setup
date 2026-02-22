import { NextResponse } from 'next/server';
import path from 'path';

export const dynamic = 'force-dynamic';

type PluginInput = {
  name: string;
  configured?: boolean;
  discovered?: boolean;
  heartbeat_ok?: boolean;
  dependency_ok?: boolean;
  policy_violation?: boolean;
  crash_count?: number;
  last_error?: string;
};

function loadSupervisor() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { PluginLifecycleSupervisor } = require('../../../../../opencode-plugin-lifecycle/src/index.js');
  return new PluginLifecycleSupervisor();
}

export async function GET() {
  try {
    const supervisor = loadSupervisor();
    const items = supervisor.list();
    const degraded = items.filter((item: any) => item.status === 'degraded').length;
    const healthy = items.filter((item: any) => item.status === 'healthy').length;
    const unknown = items.filter((item: any) => item.status === 'unknown').length;
    const quarantined = items.filter((item: any) => Boolean(item.quarantine)).length;

    return NextResponse.json({
      updated_at: new Date().toISOString(),
      source: path.join('~', '.opencode', 'plugin-runtime-state.json'),
      summary: {
        total: items.length,
        healthy,
        degraded,
        unknown,
        quarantined,
      },
      items,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to read plugin supervisor state',
        message: String(error),
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { plugins?: PluginInput[] };
    const plugins = Array.isArray(body?.plugins) ? body.plugins : [];
    if (plugins.length === 0) {
      return NextResponse.json({ error: 'No plugins provided' }, { status: 400 });
    }

    const supervisor = loadSupervisor();
    const result = supervisor.evaluateMany(plugins);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to evaluate plugin lifecycle',
        message: String(error),
      },
      { status: 500 }
    );
  }
}
