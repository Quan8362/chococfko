// ============================================================
// Map provider feature flags — pure, testable resolution with SAFE fallback.
//
// Contract:
//   • Default (no env / invalid values) → Leaflet (today's production map).
//   • Google becomes the EFFECTIVE provider only when ALL hold:
//        NEXT_PUBLIC_MAP_PROVIDER === 'google'
//        AND NEXT_PUBLIC_GOOGLE_MAPS_ENABLED is truthy
//        AND a browser key (NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY) is present.
//     Any missing piece silently falls back to Leaflet — never a broken map.
//   • Dependent capabilities (external POI, route preview) are only ever "on"
//     when Google is actually the effective provider.
//
// NOTE: `process.env.NEXT_PUBLIC_*` must be referenced as STATIC literals so
// Next.js inlines them into the client bundle (webpack DefinePlugin). That's why
// getMapConfig() lists each var explicitly rather than reading a dynamic key.
// ============================================================

import type { MapProviderId } from './types.ts';

export interface MapConfig {
  /** Effective provider after safe resolution — what the UI should render. */
  provider: MapProviderId;
  /** What the env asked for (may differ from `provider` if Google was unsafe). */
  requestedProvider: MapProviderId;
  /** Gate for the Google foundation route (/map/lab). */
  v2Enabled: boolean;
  /** Master switch: is Google Maps JS allowed to load at all? */
  googleMapsEnabled: boolean;
  /** External Google POI previews on the Google BASE MAP (requires provider=google). */
  externalPoiEnabled: boolean;
  /** Raw external-POI flag (ungated) — drives external SEARCH, independent of the base-map provider. */
  externalPoiFlag: boolean;
  /** In-app Routes preview on the Google BASE MAP (requires provider=google). */
  routePreviewEnabled: boolean;
  /** Raw route-preview flag (ungated) — drives in-site route preview over any base map. */
  routePreviewFlag: boolean;
  /** Restrict V2 / Google surfaces to internal (admin) users during rollout. */
  internalOnly: boolean;
  /** Enable the Google-powered Admin place picker (search/map/marker). */
  adminPlaceSearchEnabled: boolean;
  /** Browser-restricted Maps JS key (NEXT_PUBLIC — safe to expose). null if unset. */
  browserKey: string | null;
  /** Map ID required by Advanced Markers. null if unset (DEMO_MAP_ID used as a dev fallback). */
  mapId: string | null;
}

type EnvLike = Record<string, string | undefined>;

/** Truthy env parsing: 'true' | '1' | 'yes' | 'on' (case-insensitive). */
export function parseFlag(v: string | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'yes' || s === 'on';
}

function str(v: string | undefined): string | null {
  const s = (v ?? '').trim();
  return s ? s : null;
}

/** Pure resolver — pass an env-like object. The single source of flag truth. */
export function resolveMapConfig(env: EnvLike): MapConfig {
  const requestedProvider: MapProviderId =
    env.NEXT_PUBLIC_MAP_PROVIDER?.trim().toLowerCase() === 'google' ? 'google' : 'leaflet';

  const googleMapsEnabled = parseFlag(env.NEXT_PUBLIC_GOOGLE_MAPS_ENABLED);
  const browserKey = str(env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY);
  const mapId = str(env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID);

  // Google is only SAFE to use when explicitly requested, enabled, AND keyed.
  const googleActive = requestedProvider === 'google' && googleMapsEnabled && !!browserKey;

  // internalOnly defaults to TRUE (safer): undefined → restrict to admins.
  const internalOnly =
    env.NEXT_PUBLIC_MAP_INTERNAL_ONLY === undefined ? true : parseFlag(env.NEXT_PUBLIC_MAP_INTERNAL_ONLY);

  return {
    provider: googleActive ? 'google' : 'leaflet',
    requestedProvider,
    v2Enabled: parseFlag(env.NEXT_PUBLIC_MAP_V2_ENABLED),
    googleMapsEnabled,
    externalPoiEnabled: googleActive && parseFlag(env.NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED),
    externalPoiFlag: parseFlag(env.NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED),
    routePreviewEnabled: googleActive && parseFlag(env.NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED),
    routePreviewFlag: parseFlag(env.NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED),
    internalOnly,
    adminPlaceSearchEnabled: parseFlag(env.NEXT_PUBLIC_ADMIN_PLACE_SEARCH_ENABLED),
    browserKey,
    mapId,
  };
}

/** Should the Google Maps JS bootstrap ever run? (Used to keep it off everywhere by default.) */
export function shouldLoadGoogleMaps(config: MapConfig): boolean {
  return config.provider === 'google' && config.googleMapsEnabled && !!config.browserKey;
}

/** Viewer access subset needed to gate the internal-only Map V2 surface. */
export interface MapViewerAccess {
  isAdmin: boolean;
  isInternal: boolean;
}

/**
 * Should THIS viewer be served Map V2 (vs the legacy Leaflet map)? PURE and
 * server-evaluable so authorization happens on the server, not via client hiding.
 *
 *   • V2 disabled                      → legacy (false)
 *   • V2 enabled, internalOnly = false  → Map V2 for everyone (true)
 *   • V2 enabled, internalOnly = true   → Map V2 only for authenticated Admin /
 *                                         internal members; all others
 *                                         (anonymous, normal users) → legacy
 */
export function canSeeMapV2(config: MapConfig, access: MapViewerAccess): boolean {
  if (!config.v2Enabled) return false;
  if (!config.internalOnly) return true;
  return access.isAdmin || access.isInternal;
}

/**
 * Is the Google-powered Admin place picker usable? Independent of the PUBLIC map
 * provider (the picker is an internal tool): needs Google enabled, a browser key,
 * AND the admin-search flag. Missing any → the picker falls back to manual coords.
 */
export function adminGoogleAvailable(config: MapConfig): boolean {
  return config.googleMapsEnabled && !!config.browserKey && config.adminPlaceSearchEnabled;
}

/**
 * May the PUBLIC unified search OFFER external Google results? Independent of the
 * base-map provider (the search box works over our Leaflet map too): needs the
 * master Google switch, a browser key, AND the external-POI flag. Missing any →
 * internal-only search (today's default). External Google POI is OFF by default.
 */
export function externalSearchAvailable(config: MapConfig): boolean {
  return config.googleMapsEnabled && !!config.browserKey && config.externalPoiFlag;
}

/**
 * May the PUBLIC in-site route preview be OFFERED? Independent of the base-map
 * provider (the directions panel works over our Leaflet map): needs the master
 * Google switch AND the route-preview flag. (The server route additionally
 * requires the server-only Routes key — see /api/maps/route.) Default OFF, so
 * "Open in Google Maps" is the only directions action by default.
 */
export function routePreviewAvailable(config: MapConfig): boolean {
  return config.googleMapsEnabled && config.routePreviewFlag;
}

/**
 * Runtime config from `process.env`. Each NEXT_PUBLIC_* var is referenced as a
 * static literal so it is inlined client-side. Server-only secrets are NEVER read
 * here (this object is safe to pass to client components).
 */
export function getMapConfig(): MapConfig {
  return resolveMapConfig({
    NEXT_PUBLIC_MAP_PROVIDER: process.env.NEXT_PUBLIC_MAP_PROVIDER,
    NEXT_PUBLIC_MAP_V2_ENABLED: process.env.NEXT_PUBLIC_MAP_V2_ENABLED,
    NEXT_PUBLIC_GOOGLE_MAPS_ENABLED: process.env.NEXT_PUBLIC_GOOGLE_MAPS_ENABLED,
    NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED: process.env.NEXT_PUBLIC_GOOGLE_EXTERNAL_POI_ENABLED,
    NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED: process.env.NEXT_PUBLIC_GOOGLE_ROUTE_PREVIEW_ENABLED,
    NEXT_PUBLIC_MAP_INTERNAL_ONLY: process.env.NEXT_PUBLIC_MAP_INTERNAL_ONLY,
    NEXT_PUBLIC_ADMIN_PLACE_SEARCH_ENABLED: process.env.NEXT_PUBLIC_ADMIN_PLACE_SEARCH_ENABLED,
    NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY,
    NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID,
  });
}
