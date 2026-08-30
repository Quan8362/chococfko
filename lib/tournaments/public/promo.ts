// Pure selection logic for the home "activity promo" strip. No I/O.
//
// A tournament appears here ONLY when a Site Admin has explicitly opted it in (home_promo_enabled),
// NOT merely because it is live or starting soon. This is the single place that encodes that rule,
// so the component and the query stay dumb. Today the only promotable activity type is a tournament,
// but the shape stays intentionally narrow (public list items).

import type { PublicTournamentListItem } from './types'

// Ordering rank within the promo strip: ongoing first, then upcoming, then completed (a finished
// tournament stays promoted while its admin flag is on, just sorted to the end).
const PHASE_RANK: Record<PublicTournamentListItem['phase'], number> = {
  ongoing: 0,
  upcoming: 1,
  completed: 2,
}

function comparePromo(a: PublicTournamentListItem, b: PublicTournamentListItem): number {
  // 1) ongoing before upcoming.
  if (PHASE_RANK[a.phase] !== PHASE_RANK[b.phase]) return PHASE_RANK[a.phase] - PHASE_RANK[b.phase]
  // 2) within the same phase: soonest start first (missing start dates sink to the bottom).
  const at = a.startsAt ? Date.parse(a.startsAt) : NaN
  const bt = b.startsAt ? Date.parse(b.startsAt) : NaN
  const aValid = !Number.isNaN(at)
  const bValid = !Number.isNaN(bt)
  if (aValid && bValid && at !== bt) return at - bt
  if (aValid !== bValid) return aValid ? -1 : 1
  // 3) stable, deterministic tie-break by the public identifier (slug is unique + stable; the numeric
  //    id is intentionally not exposed on public list items).
  return a.slug.localeCompare(b.slug)
}

/**
 * Order the tournaments to promote on the home page.
 *
 * A tournament is promoted whenever BOTH hold:
 *   1. it is publicly visible (the caller already filters to published/completed via RLS; archived
 *      rows never reach a public read), AND
 *   2. a Site Admin has turned ON its home-promo flag (`homePromoEnabled`).
 *
 * The promo strip is driven purely by that admin toggle — a finished tournament KEEPS showing (with
 * its "Đã kết thúc" status) until the Admin turns the flag off; the phase only affects the label and
 * ordering, never whether it appears. The result is ordered ongoing → upcoming → completed, then
 * soonest start, then a stable slug tie-break, and can hold several tournaments (all the ones an
 * Admin opted in). An empty result → the strip renders nothing at all (no empty frame, no layout
 * shift).
 */
export function selectPromoActivities(items: PublicTournamentListItem[]): PublicTournamentListItem[] {
  return items.filter((i) => i.homePromoEnabled).sort(comparePromo)
}
