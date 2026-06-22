import { NextResponse } from 'next/server';
import { createPublicClient } from '@/lib/supabase/public';
import { mapEnvStatus, validateMapEnv } from '@/lib/maps/env';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Lightweight health probe. Reports app availability, a public (anon, RLS-bound)
// database read, presence of the core Explore view, and whether the cron secret
// is configured — WITHOUT exposing any secret values or infrastructure details.
// Safe to expose publicly: it returns only booleans + coarse status strings.

export async function GET() {
  const checks: Record<string, 'ok' | 'fail'> = {
    app: 'ok',
    db_public_read: 'fail',
    core_view: 'fail',
  };

  try {
    const sb = createPublicClient();
    // Public, cheap read against an RLS-protected public table (head/count only).
    const { error } = await sb.from('places').select('slug', { count: 'exact', head: true }).limit(1);
    if (!error) checks.db_public_read = 'ok';

    // Required view present + readable (returns 0 rows fine; only the call must succeed).
    const { error: vErr } = await sb
      .from('place_comments_with_author')
      .select('id', { head: true })
      .limit(1);
    if (!vErr) checks.core_view = 'ok';
  } catch {
    // leave failed checks as 'fail'
  }

  // Boolean only — never the value.
  const config = {
    cron_secret_configured: !!process.env.CRON_SECRET,
    supabase_configured:
      !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  };

  // Map stack: booleans + missing-var NAMES only — never any key value.
  const mapEnv = mapEnvStatus();
  const mapValidation = validateMapEnv();

  const healthy = Object.values(checks).every((v) => v === 'ok');
  return NextResponse.json(
    {
      status: healthy ? 'healthy' : 'degraded',
      checks,
      config,
      map: { ...mapEnv, config_ok: mapValidation.ok, missing: mapValidation.missing, warnings: mapValidation.warnings },
      ts: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
