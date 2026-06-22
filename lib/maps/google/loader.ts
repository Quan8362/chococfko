// ============================================================
// Safe client-side Google Maps JS loader (Phase 3 foundation).
//
// Uses the OFFICIAL inline bootstrap loader (the recommended, non-legacy way to
// load the Maps JavaScript API) so callers can `await maps.importLibrary(...)`
// with Promise-based error handling — no global callbacks, no legacy
// `<script ...&callback=>` pattern.
//
// Guarantees:
//   • Never runs at import time — only when loadGoogleMaps() is called.
//   • Loads at most once (singleton promise); safe to call from many components.
//   • Rejects cleanly with a typed Error on: missing key, no window (SSR), or a
//     script-load failure — and allows a later retry after a failure.
//   • Reads only the browser-restricted NEXT_PUBLIC key passed in by the caller;
//     never touches a server-only secret.
//
// This module is imported ONLY by the Google map components, which themselves
// render only when the Google provider is the effective provider. So with the
// default flags, this code path is never reached and no Google script loads.
// ============================================================

/** Minimal shape we rely on from `window.google.maps`. */
export interface GoogleMapsNamespace {
  importLibrary: (name: string) => Promise<Record<string, unknown>>;
}

export interface LoadGoogleMapsOptions {
  /** Browser-restricted Maps JS API key (NEXT_PUBLIC). */
  apiKey: string | null;
  /** API version channel; defaults to Google's recommended 'weekly'. */
  version?: string;
}

let loadPromise: Promise<GoogleMapsNamespace> | null = null;

/** Test-only: clear the singleton so each test starts clean. */
export function _resetGoogleMapsLoader(): void {
  loadPromise = null;
}

/**
 * Inject the official inline bootstrap. This is Google's documented loader code
 * (readable form), parameterized by key + version. It defines
 * `google.maps.importLibrary` and rejects the internal promise on script error.
 */
function injectBootstrap(key: string, version: string): void {
  // Mirrors https://developers.google.com/maps/documentation/javascript/load-maps-js-api
  ((g: Record<string, unknown>) => {
    const w = window as unknown as Record<string, unknown>;
    const c = 'google';
    const l = 'importLibrary';
    const q = '__ib__';
    const m = document;
    const b = (w[c] as Record<string, unknown>) || (w[c] = {});
    const d = (b.maps as Record<string, unknown>) || (b.maps = {});
    const r = new Set<string>();
    const e = new URLSearchParams();
    let h: Promise<unknown> | undefined;
    const u = () =>
      h ||
      (h = new Promise<void>((resolve, reject) => {
        const a = m.createElement('script');
        e.set('libraries', Array.from(r).join(','));
        for (const k in g) {
          e.set(k.replace(/[A-Z]/g, (t) => '_' + t[0].toLowerCase()), String(g[k]));
        }
        e.set('callback', c + '.maps.' + q);
        a.src = `https://maps.${c}apis.com/maps/api/js?` + e;
        (d as Record<string, unknown>)[q] = resolve;
        a.onerror = () => {
          h = undefined;
          reject(new Error('google_maps_script_failed'));
        };
        a.nonce = (m.querySelector('script[nonce]') as HTMLScriptElement | null)?.nonce || '';
        m.head.append(a);
      }));
    if ((d as Record<string, unknown>)[l]) {
      // Already defined — leave the first configuration in place.
      return;
    }
    (d as Record<string, unknown>)[l] = (f: string, ...n: unknown[]) =>
      r.add(f) && u().then(() => (d as Record<string, (...a: unknown[]) => unknown>)[l](f, ...n));
  })({ key, v: version });
}

/**
 * Resolve the Google Maps namespace, loading the API on first call. Subsequent
 * calls reuse the in-flight / resolved promise.
 */
export async function loadGoogleMaps(opts: LoadGoogleMapsOptions): Promise<GoogleMapsNamespace> {
  // Ordered so the most basic misconfigurations reject FIRST (and work in Node
  // tests where there is no window): missing key → no DOM → load failure.
  if (!opts.apiKey) throw new Error('google_maps_key_missing');
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    throw new Error('google_maps_no_window');
  }
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const w = window as unknown as { google?: { maps?: GoogleMapsNamespace } };
    if (!w.google?.maps?.importLibrary) {
      injectBootstrap(opts.apiKey as string, opts.version ?? 'weekly');
    }
    const maps = (window as unknown as { google: { maps: GoogleMapsNamespace } }).google.maps;
    // Force the core library to resolve now so a load failure surfaces here.
    await maps.importLibrary('maps');
    return maps;
  })();

  // On failure, clear the singleton so a later attempt can retry.
  loadPromise.catch(() => {
    loadPromise = null;
  });

  return loadPromise;
}
