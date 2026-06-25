import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAuthorizedCron } from '@/lib/cronReminders';
import { enrichPlace, ENRICH_SELECT_COLUMNS, type EnrichRow, type SupabaseLike } from '@/lib/places/enrichPlace';
import { resolveApiKey } from '@/lib/places/googlePlacesClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

// Scheduled place enrichment (Vercel Cron — see vercel.json, weekly).
// Cadence to control cost: NEW places get a full enrich; ~monthly a full refresh;
// ~weekly an opening-hours-only refresh. Calls Google only here, never at render.
// Protected by CRON_SECRET. No Google key → graceful no-op. Best-effort, bounded.

const MAX_FULL_PER_RUN = 30;   // new + monthly-stale full enrichments per run
const MAX_HOURS_PER_RUN = 40;  // weekly hours-only refreshes per run
const WEEK_MS = 7 * 86_400_000;
const MONTH_MS = 30 * 86_400_000;
const RATE_LIMIT_MS = 200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function fetchedAt(row: EnrichRow): number | null {
  const ge = row.google_enrichment as { fetched_at?: string } | null | undefined;
  if (!ge || !ge.fetched_at) return null;
  const t = Date.parse(ge.fetched_at);
  return Number.isNaN(t) ? null : t;
}

export async function GET(req: Request) {
  if (!isAuthorizedCron(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const apiKey = resolveApiKey();
  if (!apiKey) return NextResponse.json({ ok: true, skipped: 'no_api_key' });

  const startedAt = Date.now();
  const admin = createAdminClient();
  // The orchestrator only needs a minimal client shape; the full supabase client
  // type is too deep for the structural assignability check (TS2589), so cast.
  const enrichDb = admin as unknown as SupabaseLike;

  // Bail cleanly if the enrichment migration hasn't been applied yet.
  const probe = await admin.from('places').select('google_enrichment').limit(1);
  if (probe.error) return NextResponse.json({ ok: true, skipped: 'migration_pending' });

  const { data, error } = await admin
    .from('places')
    .select(ENRICH_SELECT_COLUMNS)
    .order('slug', { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  const rows = (data ?? []) as unknown as EnrichRow[];

  const now = Date.now();
  const fullTargets: EnrichRow[] = [];   // never enriched OR older than a month
  const hoursTargets: EnrichRow[] = [];  // enriched within a month but older than a week
  for (const r of rows) {
    const at = fetchedAt(r);
    if (at === null || now - at > MONTH_MS) fullTargets.push(r);
    else if (now - at > WEEK_MS) hoursTargets.push(r);
  }

  const summary = { fullEnriched: 0, hoursRefreshed: 0, noChanges: 0, needsReview: 0, errors: 0 };

  for (const row of fullTargets.slice(0, MAX_FULL_PER_RUN)) {
    try {
      const res = await enrichPlace(enrichDb, row, { apiKey });
      if (res.status === 'enriched' || res.status === 'dup_place_id') summary.fullEnriched++;
      else if (res.status === 'no_changes') summary.noChanges++;
      else if (res.status === 'low_confidence' || res.status === 'needs_place_id' || res.status === 'not_found') summary.needsReview++;
      else if (res.status === 'error') summary.errors++;
    } catch { summary.errors++; }
    await sleep(RATE_LIMIT_MS);
  }
  for (const row of hoursTargets.slice(0, MAX_HOURS_PER_RUN)) {
    try {
      const res = await enrichPlace(enrichDb, row, { apiKey, refreshHoursOnly: true });
      if (res.status === 'enriched' || res.status === 'dup_place_id') summary.hoursRefreshed++;
      else if (res.status === 'no_changes') summary.noChanges++;
      else if (res.status === 'error') summary.errors++;
    } catch { summary.errors++; }
    await sleep(RATE_LIMIT_MS);
  }

  const durationMs = Date.now() - startedAt;
  console.log('[cron/enrich-places] summary', { durationMs, ...summary });
  return NextResponse.json({ ok: true, durationMs, ...summary });
}
