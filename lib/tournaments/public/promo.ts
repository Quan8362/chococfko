// Pure selection logic for the home "activity promo" strip. No I/O.
//
// Picks the single most relevant activity to spotlight below the header. Today the only public
// activity type is a tournament, but the shape is intentionally narrow (a picked list item + a count)
// so this stays the one place to evolve the rule — e.g. honour an explicit `featured` flag first, or
// merge in other activity kinds — without touching the component.

import type { PublicTournamentListItem } from './types'

export interface PromoPick {
  // The activity to feature, or null when nothing is live/upcoming (banner then renders nothing).
  featured: PublicTournamentListItem | null
  // How many activities are currently live or upcoming (drives the "view all" affordance).
  activeCount: number
}

function bySoonestStart(a: PublicTournamentListItem, b: PublicTournamentListItem): number {
  const at = a.startsAt ? Date.parse(a.startsAt) : NaN
  const bt = b.startsAt ? Date.parse(b.startsAt) : NaN
  if (Number.isNaN(at) && Number.isNaN(bt)) return a.name.localeCompare(b.name)
  if (Number.isNaN(at)) return 1
  if (Number.isNaN(bt)) return -1
  return at - bt
}

/**
 * Choose the promo activity: an ongoing activity always wins over an upcoming one; within a phase the
 * soonest start is preferred. Completed activities are never promoted. `activeCount` counts every
 * ongoing/upcoming activity so the caller can show "all tournaments" only when it adds value.
 *
 * Extension point: to support editorially "featured" activities later, resolve any item flagged
 * featured (ongoing/upcoming) here before falling back to the ongoing→upcoming rule below.
 */
export function pickPromoActivity(items: PublicTournamentListItem[]): PromoPick {
  const ongoing = items.filter((i) => i.phase === 'ongoing')
  const upcoming = items.filter((i) => i.phase === 'upcoming')
  const pool = ongoing.length > 0 ? ongoing : upcoming
  const featured = pool.length > 0 ? [...pool].sort(bySoonestStart)[0] : null
  return { featured, activeCount: ongoing.length + upcoming.length }
}
