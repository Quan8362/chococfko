// Pure view-helpers for the public podium (Serie A / Serie B). No React / no JSX so the ordering and
// joint-third rules can be unit-tested directly. The DATA and its ranks come from the domain podium
// calculator — this only decides top→bottom order and how the rank-3 rows are labelled.

import type { PodiumRowView } from '@/lib/tournaments/admin/types'

// Order a bracket's podium rows for the vertical column: gold on top, then silver, then bronze(s).
// A stable sort keeps two joint-third rows in their source order so neither reads as "higher". Pure.
export function orderPodiumRows(rows: readonly PodiumRowView[]): PodiumRowView[] {
  return [...rows].sort((a, b) => a.rank - b.rank)
}

// True when the rank-3 places are JOINT (both semifinal losers, no third-place match): same rank,
// same visual weight, never numbered. A single, decided third place returns false.
export function isJointThird(rows: readonly PodiumRowView[]): boolean {
  const thirds = rows.filter((r) => r.rank === 3)
  return thirds.length > 1 || thirds.some((r) => r.isJoint)
}
