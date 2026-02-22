import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const dynamic = 'force-dynamic';

type RetrievalQuality = {
  generated_at: string;
  map_at_k: number;
  grounded_recall: number;
  hit_rate_at_k: number;
  k: number;
  sample_size: number;
  status: 'pass' | 'warning' | 'fail';
  source?: string;
};

function classifyStatus(mapAtK: number, groundedRecall: number): RetrievalQuality['status'] {
  if (mapAtK >= 0.7 && groundedRecall >= 0.75) return 'pass';
  if (mapAtK >= 0.5 && groundedRecall >= 0.6) return 'warning';
  return 'fail';
}

export async function GET() {
  try {
    const reportPath = path.join(os.homedir(), '.opencode', 'retrieval-quality.json');
    if (!fs.existsSync(reportPath)) {
      return NextResponse.json(
        {
          message: 'No retrieval quality report available',
          status: 'fail',
          source: reportPath,
        },
        { status: 200 }
      );
    }

    const raw = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    const mapAtK = Number(raw?.map_at_k || 0);
    const groundedRecall = Number(raw?.grounded_recall || 0);
    const payload: RetrievalQuality = {
      generated_at: String(raw?.generated_at || new Date().toISOString()),
      map_at_k: mapAtK,
      grounded_recall: groundedRecall,
      hit_rate_at_k: Number(raw?.hit_rate_at_k || 0),
      k: Number(raw?.k || 5),
      sample_size: Number(raw?.sample_size || 0),
      status: classifyStatus(mapAtK, groundedRecall),
      source: reportPath,
    };

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        message: 'Failed to load retrieval quality report',
        error: String(error),
      },
      { status: 500 }
    );
  }
}
