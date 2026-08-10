// Pure selection logic for the home "activity promo" strip. No I/O.
//
// Returns the ordered list of activities worth promoting below the header. Today the only public
// activity type is a tournament, but the shape stays intentionally narrow (public list items) so
// this remains the one place to evolve the rule — e.g. honour an explicit `featured` flag first, or
// merge in other activity kinds — without touching the component.

import type { PublicTournamentListItem } from './types'

function bySoonestStart(a: PublicTournamentListItem, b: PublicTournamentListItem): number {
  const at = a.startsAt ? Date.parse(a.startsAt) : NaN
  const bt = b.startsAt ? Date.parse(b.startsAt) : NaN
  if (Number.isNaN(at) && Number.isNaN(bt)) return a.name.localeCompare(b.name)
  if (Number.isNaN(at)) return 1
  if (Number.isNaN(bt)) return -1
  return at - bt
}

/**
 * Order the activities to promote: ongoing first, then upcoming; within each phase the soonest start
 * wins. Completed activities are never promoted. The caller renders a single-item card when the list
 * has one entry and an auto-scrolling ticker when it has several (empty list → banner hidden).
 *
 * Extension point: to support editorially "featured" activities later, hoist any item flagged
 * featured (ongoing/upcoming) to the front here before the ongoing→upcoming ordering below.
 */
export function selectPromoActivities(items: PublicTournamentListItem[]): PublicTournamentListItem[] {
  const ongoing = items.filter((i) => i.phase === 'ongoing').sort(bySoonestStart)
  const upcoming = items.filter((i) => i.phase === 'upcoming').sort(bySoonestStart)
  return [...ongoing, ...upcoming]
}
