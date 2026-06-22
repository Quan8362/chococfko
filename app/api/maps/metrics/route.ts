import { NextResponse } from 'next/server';
import { logMapMetric } from '@/lib/maps/metrics';

export const dynamic = 'force-dynamic';

/**
 * POST /api/maps/metrics — aggregated, privacy-safe map observability beacons.
 * The handler passes the body through `logMapMetric`, which whitelists the event
 * name + a closed set of low-cardinality dimensions and DROPS everything else
 * (no coordinates / addresses / keys / payloads can be recorded). Returns 204.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { event?: unknown; dims?: Record<string, unknown> };
    logMapMetric(body.event, body.dims ?? {});
  } catch {
    /* never fail a beacon */
  }
  return new NextResponse(null, { status: 204 });
}
