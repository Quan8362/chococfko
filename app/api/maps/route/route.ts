import { NextResponse } from 'next/server';
import { getMapConfig, routePreviewAvailable } from '@/lib/maps/config';
import {
  validateRouteRequest, buildComputeRoutesBody, parseComputeRoutesResponse,
  statusFromResponse, ROUTES_FIELD_MASK, COMPUTE_ROUTES_ENDPOINT,
  type RouteRequestInput,
} from '@/lib/maps/routeRequest';
import { isTravelMode } from '@/lib/maps/directions';
import { logMapMetric } from '@/lib/maps/metrics';

export const dynamic = 'force-dynamic';

/**
 * POST /api/maps/route — in-site route preview via the Google Routes API
 * (Compute Routes). Called ONLY on explicit user action (never per marker / pan /
 * search / card open). Uses the SERVER-ONLY Routes key; the browser never sees it.
 *
 * Privacy: coordinates are used to compute the route but are NEVER logged — only
 * aggregated, coordinate-free events (event + mode + coarse status) are emitted.
 */
export async function POST(req: Request) {
  const config = getMapConfig();
  // Client gate (master switch + flag). The server key is the real capability.
  if (!routePreviewAvailable(config)) {
    return NextResponse.json({ status: 'unavailable' }, { status: 200 });
  }
  const serverKey = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!serverKey) {
    logMapMetric('route_preview_failed', { status: 'no_server_key' });
    return NextResponse.json({ status: 'unavailable' }, { status: 200 });
  }

  let parsedBody: Partial<RouteRequestInput>;
  try {
    parsedBody = (await req.json()) as Partial<RouteRequestInput>;
  } catch {
    return NextResponse.json({ status: 'invalid' }, { status: 400 });
  }
  const mode = parsedBody.mode;

  const validationError = validateRouteRequest(parsedBody);
  if (validationError) {
    logMapMetric('route_preview_failed', { mode: isTravelMode(mode) ? mode : undefined, status: validationError });
    return NextResponse.json({ status: validationError === 'origin_equals_destination' ? 'invalid' : validationError === 'unsupported_mode' ? 'unsupported_mode' : 'invalid', error: validationError }, { status: 200 });
  }

  const request = parsedBody as RouteRequestInput;
  logMapMetric('route_preview_requested', { mode: request.mode });

  try {
    const res = await fetch(COMPUTE_ROUTES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': serverKey,
        'X-Goog-FieldMask': ROUTES_FIELD_MASK,
      },
      body: JSON.stringify(buildComputeRoutesBody(request)),
      cache: 'no-store',
    });
    const json = await res.json().catch(() => null);
    const routes = parseComputeRoutesResponse(json);
    const status = statusFromResponse(res.status, routes);
    if (status === 'ok') {
      logMapMetric('route_preview_succeeded', { mode: request.mode, ok: true });
      return NextResponse.json({ status, routes });
    }
    logMapMetric('route_preview_failed', { mode: request.mode, status });
    return NextResponse.json({ status }, { status: 200 });
  } catch {
    logMapMetric('route_preview_failed', { mode: request.mode, status: 'fetch_error' });
    return NextResponse.json({ status: 'unavailable' }, { status: 200 });
  }
}
