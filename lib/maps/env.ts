// ============================================================
// Runtime environment validation for the map stack (Map UX Phase 10). PURE.
//
// Reports the PRESENCE of required vars (booleans / missing NAMES) and NEVER the
// values — safe to surface in a health probe or a startup warning. Validates the
// flag↔key invariants (e.g. external search enabled requires a browser key;
// route preview requires the server-only Routes key) so a misconfiguration is
// caught explicitly instead of silently degrading.
// ============================================================

type EnvLike = Record<string, string | undefined>;

const present = (v: string | undefined): boolean => !!(v && v.trim());
const flag = (v: string | undefined): boolean => {
  const s = (v ?? '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'on';
};

/** Booleans only — safe to expose (e.g. /api/health). Never the values. */
export function mapEnvStatus(env: EnvLike = process.env): Record<string, boolean> {
  return {
    google_maps_enabled: flag(env.NEXT_PUBLIC_GOOGLE_MAPS_ENABLED),
    browser_key_configured: present(env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY),
    map_id_configured: present(env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID),
    server_routes_key_configured: present(env.GOOGLE_MAPS_SERVER_KEY),
    external_poi_flag: flag(env.NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED),
    route_preview_flag: flag(env.NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED),
    admin_place_search_flag: flag(env.NEXT_PUBLIC_ADMIN_PLACE_SEARCH_ENABLED),
    map_v2_enabled: flag(env.NEXT_PUBLIC_MAP_V2_ENABLED),
  };
}

export interface EnvValidation {
  ok: boolean;
  /** NAMES of env vars that a turned-on feature requires but are missing. */
  missing: string[];
  /** NAMES of non-fatal recommendations (e.g. Map ID for Advanced Markers). */
  warnings: string[];
}

/**
 * Validate flag↔credential invariants. Returns missing/recommended NAMES only.
 * Default (all flags off) → ok, nothing missing. Never reads or returns values.
 */
export function validateMapEnv(env: EnvLike = process.env): EnvValidation {
  const missing: string[] = [];
  const warnings: string[] = [];

  const googleEnabled = flag(env.NEXT_PUBLIC_GOOGLE_MAPS_ENABLED);
  const providerGoogle = (env.NEXT_PUBLIC_MAP_PROVIDER ?? '').trim().toLowerCase() === 'google';
  const externalPoi = flag(env.NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED);
  const routePreview = flag(env.NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED);
  const adminSearch = flag(env.NEXT_PUBLIC_ADMIN_PLACE_SEARCH_ENABLED);

  // Any client Google capability needs a browser key + (for Advanced Markers) a Map ID.
  const wantsClientGoogle = googleEnabled && (providerGoogle || externalPoi || adminSearch);
  if (wantsClientGoogle && !present(env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY)) {
    missing.push('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY');
  }
  if (providerGoogle && googleEnabled && !present(env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID)) {
    warnings.push('NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID'); // DEMO_MAP_ID fallback only suits dev
  }
  // In-site route preview requires the SERVER-ONLY Routes key.
  if (googleEnabled && routePreview && !present(env.GOOGLE_MAPS_SERVER_KEY)) {
    missing.push('GOOGLE_MAPS_SERVER_KEY');
  }

  return { ok: missing.length === 0, missing, warnings };
}
