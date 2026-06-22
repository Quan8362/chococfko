// Single source of truth for the homepage "quick needs" shortcuts (Layer 3).
// These are SITUATIONAL filters only — never place categories. Categories
// (Layer 4) come from the existing taxonomy in lib/places (`categories`); they
// must never be duplicated here. The split is enforced by validateShortcuts().
//
// Each intent maps to structured ExploreFilters (the same engine /places uses),
// so a chip seeds a real, deep-linkable filter — not a text match.

import { encodeFilters, type ExploreFilters } from './exploreParams.ts';

export interface DiscoveryShortcut {
  id: string;
  kind: 'intent';
  /** i18n key under the `explore_home` namespace. */
  labelKey: string;
  emoji: string;
  /** Structured criteria — must NOT set `category` (that's the category layer). */
  filters: ExploreFilters;
  priority: 'primary' | 'secondary';
  /** Stable analytics id (never a translated label). */
  analyticsKey: string;
}

export const QUICK_INTENTS: DiscoveryShortcut[] = [
  { id: 'near_me',    kind: 'intent', labelKey: 'intent_near_me',    emoji: '📍', filters: { nearby: true },                 priority: 'primary',   analyticsKey: 'near_me' },
  { id: 'open_now',   kind: 'intent', labelKey: 'intent_open_now',   emoji: '🕒', filters: { openNow: true },                priority: 'primary',   analyticsKey: 'open_now' },
  { id: 'eat_cheap',  kind: 'intent', labelKey: 'intent_eat_cheap',  emoji: '💴', filters: { priceMax: 3000 },               priority: 'primary',   analyticsKey: 'under_3000' },
  { id: 'free',       kind: 'intent', labelKey: 'intent_free',       emoji: '🎟️', filters: { fee: 'free' },                  priority: 'primary',   analyticsKey: 'free' },
  { id: 'rainy',      kind: 'intent', labelKey: 'intent_rainy',      emoji: '🌧️', filters: { rainy: true, indoor: true },    priority: 'primary',   analyticsKey: 'rainy' },
  { id: 'family',     kind: 'intent', labelKey: 'intent_family',     emoji: '👨‍👩‍👧', filters: { children: true },          priority: 'primary',   analyticsKey: 'family' },
  { id: 'reservable', kind: 'intent', labelKey: 'intent_reservable', emoji: '📅', filters: { reservationAvailable: true },   priority: 'secondary', analyticsKey: 'reservable' },
  { id: 'parking',    kind: 'intent', labelKey: 'intent_parking',    emoji: '🅿️', filters: { parking: true },                priority: 'secondary', analyticsKey: 'parking' },
];

export const PRIMARY_INTENTS = QUICK_INTENTS.filter((s) => s.priority === 'primary');
export const SECONDARY_INTENTS = QUICK_INTENTS.filter((s) => s.priority === 'secondary');

/** Deep-link href for an intent (seeds /places with its structured filters). */
export function intentHref(s: DiscoveryShortcut): string {
  const qs = encodeFilters(s.filters).toString();
  return qs ? `/places?${qs}` : '/places';
}

/**
 * Validate taxonomy integrity. Returns a list of human-readable errors (empty =
 * OK). Enforced by the unit test so a future edit can't reintroduce the
 * intent/category duplication bug.
 */
export function validateShortcuts(categoryCodes: string[] = []): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const analytics = new Set<string>();
  const dests = new Set<string>();
  const cats = new Set(categoryCodes);

  for (const s of QUICK_INTENTS) {
    if (ids.has(s.id)) errors.push(`duplicate id: ${s.id}`);
    ids.add(s.id);
    if (analytics.has(s.analyticsKey)) errors.push(`duplicate analyticsKey: ${s.analyticsKey}`);
    analytics.add(s.analyticsKey);
    if (!s.labelKey) errors.push(`missing labelKey: ${s.id}`);
    if (!s.emoji) errors.push(`missing emoji: ${s.id}`);
    // An intent must be situational — never a place category.
    if ('category' in s.filters && s.filters.category) errors.push(`intent ${s.id} sets a category (${s.filters.category}) — categories belong to the category layer`);
    if (s.filters.category && cats.has(s.filters.category)) errors.push(`intent ${s.id} duplicates category ${s.filters.category}`);
    // No two intents may resolve to the same destination.
    const dest = encodeFilters(s.filters).toString();
    if (!dest) errors.push(`intent ${s.id} has empty criteria`);
    if (dests.has(dest)) errors.push(`duplicate destination for ${s.id}: ?${dest}`);
    dests.add(dest);
  }
  if (PRIMARY_INTENTS.length !== 6) errors.push(`expected 6 primary intents, got ${PRIMARY_INTENTS.length}`);
  return errors;
}
