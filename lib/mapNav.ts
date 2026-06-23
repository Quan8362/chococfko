import { trackEvent } from '@/lib/analytics'

/** Canonical route for the Map feature. Locale is cookie-based (no URL prefix),
 *  so a plain link already preserves the active locale. */
export const MAP_ROUTE = '/map'

/** Where a Map entry point was clicked (kept in sync with the analytics docs). */
export type MapOpenSource =
  | 'header_dropdown'
  | 'mobile_navigation'
  | 'homepage_cta'
  | 'explore_view_switch'
  | 'footer'

/** Single source of truth for the Map-open analytics event so every entry point
 *  fires the same event with a consistent `source`. */
export function trackMapOpen(source: MapOpenSource): void {
  void trackEvent('explore_map_opened', { metadata: { source } })
}
