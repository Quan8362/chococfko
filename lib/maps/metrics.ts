// ============================================================
// Map observability (Map UX Phase 10). PURE + privacy-first. Supersedes the
// Phase-8 routeAnalytics module with the full metric set.
//
// HARD PRIVACY CONTRACT: a metric carries ONLY a known event name + a CLOSED set
// of low-cardinality, non-sensitive dimensions. `buildMapMetric` DROPS every key
// outside the allow-list, so raw coordinates / typed addresses / API keys /
// provider payloads can never enter a payload, log line, or beacon — even if a
// caller passes them. `containsNoSensitiveData` + unit tests enforce this.
// ============================================================

export const MAP_METRICS = [
  'map_loaded',
  'map_load_failed',
  'map_provider',
  'search_succeeded',
  'search_failed',
  'autocomplete_failed',
  'result_selected',
  'route_preview_requested',
  'route_preview_succeeded',
  'route_preview_failed',
  'open_in_google_maps_clicked',
  'geolocation',
  'viewport_query',
  'map_api_unavailable',
] as const;
export type MapMetric = (typeof MAP_METRICS)[number];

/** CLOSED allow-list of dimension keys. Nothing else is ever recorded. */
export const ALLOWED_DIMS = ['provider', 'mode', 'source', 'status', 'permission', 'ok', 'count', 'latency_ms', 'latency_bucket'] as const;
export type AllowedDim = (typeof ALLOWED_DIMS)[number];

export interface MapMetricDims {
  provider?: 'leaflet' | 'google';
  /** Travel-mode CATEGORY (walking/driving/…), never coordinates. */
  mode?: string;
  /** Which result kind was chosen. */
  source?: 'internal' | 'external' | 'station' | 'topic';
  /** Coarse outcome/status code we control (truncated; redaction-safe). */
  status?: string;
  permission?: 'granted' | 'denied' | 'unsupported' | 'insecure' | 'timeout' | 'error';
  ok?: boolean;
  /** Small aggregate count (e.g. number of results). */
  count?: number;
  /** Latency in ms — not personal data; bucketed companion below. */
  latency_ms?: number;
  latency_bucket?: string;
}

export interface MapMetricPayload {
  event: MapMetric;
  dims: MapMetricDims;
  ts: number;
}

const ENDPOINT = '/api/maps/metrics';
const STATUS_MAX = 48;

export function isMapMetric(v: unknown): v is MapMetric {
  return typeof v === 'string' && (MAP_METRICS as readonly string[]).includes(v);
}

/** Coarse latency bucket (privacy-safe, aggregate-friendly). */
export function latencyBucket(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return 'na';
  if (ms < 100) return '<100';
  if (ms < 300) return '100-300';
  if (ms < 1000) return '300-1000';
  if (ms < 3000) return '1000-3000';
  return '>3000';
}

const ALLOWED = new Set<string>(ALLOWED_DIMS);

/**
 * Build a metric payload, keeping ONLY allow-listed dimensions (unknown keys —
 * including any lat/lng/address/key — are dropped). Returns null for unknown events.
 */
export function buildMapMetric(event: unknown, dims: Record<string, unknown> = {}): MapMetricPayload | null {
  if (!isMapMetric(event)) return null;
  const out: MapMetricDims = {};
  for (const [k, v] of Object.entries(dims ?? {})) {
    if (!ALLOWED.has(k)) continue; // drop anything not explicitly allowed
    if (k === 'ok') out.ok = !!v;
    else if (k === 'count' || k === 'latency_ms') { if (typeof v === 'number' && Number.isFinite(v)) (out as Record<string, unknown>)[k] = v; }
    else if (typeof v === 'string') (out as Record<string, unknown>)[k] = v.slice(0, STATUS_MAX);
  }
  return { event, dims: out, ts: Date.now() };
}

/** Defensive guard (tests + endpoint): payload carries no precise/PII keys. */
export function containsNoSensitiveData(payload: unknown): boolean {
  const banned = /(^|_)(lat|lng|latitude|longitude|coord|coords|address|addr|key|secret|token|email|phone|query)$/i;
  const walk = (v: unknown): boolean => {
    if (!v || typeof v !== 'object') return true;
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (banned.test(k)) return false;
      if (val && typeof val === 'object' && !walk(val)) return false;
    }
    return true;
  };
  return walk(payload);
}

/**
 * Emit a metric server-side. Aggregated, coordinate-free, key-free. Safe to call
 * from any route handler; swallows its own errors so metrics never break a request.
 */
export function logMapMetric(event: unknown, dims: Record<string, unknown> = {}): void {
  const payload = buildMapMetric(event, dims);
  if (!payload) return;
  try {
    console.info('[map-metric]', JSON.stringify(payload));
  } catch {
    /* metrics must never throw */
  }
}

/**
 * Emit a metric from the browser via a fire-and-forget beacon. SSR-safe. The
 * server endpoint re-validates with buildMapMetric (defense in depth).
 */
export function emitMapMetric(event: MapMetric, dims: MapMetricDims = {}): void {
  if (typeof navigator === 'undefined') return;
  const payload = buildMapMetric(event, dims as Record<string, unknown>);
  if (!payload) return;
  try {
    const blob = new Blob([JSON.stringify({ event: payload.event, dims: payload.dims })], { type: 'application/json' });
    if (navigator.sendBeacon) navigator.sendBeacon(ENDPOINT, blob);
  } catch {
    /* analytics must never break UX */
  }
}
