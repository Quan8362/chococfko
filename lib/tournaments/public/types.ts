// Public (Guest) view types for the tournament module. These are the ONLY shapes sent to Guest
// browsers — they deliberately omit admin-only fields (optimistic-concurrency `version`, internal
// override reason text, audit metadata). Pure data shapes, no I/O.

import type { EventFormat } from '@/lib/tournaments/eventValidation'
import type { PublicEventRuleSummary } from '@/lib/tournaments/rules'
import type {
  CompetitorRow,
  KnockoutMatchView,
  KnockoutRoundView,
  PodiumRowView,
} from '@/lib/tournaments/admin/types'

// Guests may only ever see these two tournament statuses (RLS enforces it too).
export type PublicTournamentStatus = 'published' | 'completed'

// Where a tournament sits on the calendar — drives list ordering & the status pill.
export type TournamentPhase = 'ongoing' | 'upcoming' | 'completed'

export interface PublicTournamentListItem {
  slug: string
  name: string
  status: PublicTournamentStatus
  startsAt: string | null
  endsAt: string | null
  location: string | null
  eventCount: number
  phase: TournamentPhase
  // Row creation time — used ONLY to power the client-side "newest created" sort on /giai-dau.
  // Additive projection over rows already visible under RLS; it does NOT widen visibility.
  createdAt: string | null
  // Site-Admin opt-in for the home-page activity-promo strip. A tournament appears there ONLY when
  // this is true (and it is otherwise public + ongoing/upcoming) — never automatically. Additive
  // projection over the same RLS-visible rows; it does NOT widen visibility.
  homePromoEnabled: boolean
}

export interface PublicEventSummary {
  id: string
  name: string
  format: EventFormat
  status: string
  groupCount: number
  winnerQualifiersPerGroup: number
  consolationQualifiersPerGroup: number
  thirdPlaceEnabled: boolean
  displayOrder: number
  competitorCount: number
  matchCount: number
  completedMatchCount: number
}

export interface PublicTournamentSummary {
  id: string // used to scope the realtime subscription (public row id — not admin-only)
  slug: string
  name: string
  status: PublicTournamentStatus
  startsAt: string | null
  endsAt: string | null
  location: string | null
  rulesUrl: string | null
  events: PublicEventSummary[]
}

export interface PublicCompetitor {
  id: string
  name: string
  shortName: string | null
  seed: number | null
  groupId: string | null
  groupName: string | null
}

export interface PublicScheduleGame {
  gameNumber: number
  scoreA: number
  scoreB: number
}

export interface PublicScheduleMatch {
  id: string
  stage: 'group' | 'knockout'
  bracket: 'championship' | 'consolation' | null
  groupId: string | null
  groupName: string | null
  roundNumber: number
  matchNumber: number
  roundLabel: string | null
  competitorAId: string | null
  competitorBId: string | null
  status: string
  winnerId: string | null
  games: PublicScheduleGame[]
  gamesWonA: number
  gamesWonB: number
  isBye: boolean
}

export type PublicQualification = 'championship' | 'consolation' | 'none' | 'undetermined'

export interface PublicStandingRow {
  competitorId: string
  position: number
  rank: number
  played: number
  wins: number
  losses: number
  tablePoints: number
  pointsFor: number
  pointsAgainst: number
  pointDifference: number
  tied: boolean
  qualification: PublicQualification
}

export interface PublicGroupStandings {
  groupId: string
  groupName: string
  rows: PublicStandingRow[]
  // The organiser manually resolved a tie in this group ("BTC phân định"). The free-text reason is
  // intentionally NOT exposed to Guests — only the fact that a resolution exists.
  resolvedByOrganizer: boolean
  // The group's qualification cut is not yet decided (a blocking tie is still unresolved).
  hasUndetermined: boolean
}

// A knockout branch as rendered by the reused BracketView. Uses the admin view types so the same
// read-only component renders it; `version` inside is a placeholder (0) — Guests never mutate.
export interface PublicBracket {
  bracket: 'championship' | 'consolation'
  rounds: KnockoutRoundView[]
  thirdPlaceMatch: KnockoutMatchView | null
  podium: PodiumRowView[]
  hasBracket: boolean
  isComplete: boolean
}

export interface PublicEventWorkspace {
  event: PublicEventSummary
  competitors: PublicCompetitor[]
  groups: { id: string; name: string }[]
  schedule: PublicScheduleMatch[]
  standings: PublicGroupStandings[]
  brackets: PublicBracket[]
  hasGroups: boolean
  hasKnockout: boolean
  // The minimal, public-safe scoring rules for this event (via the SECURITY DEFINER summary RPC).
  // null when the event still runs on the system default rules (no snapshot) → the UI shows a
  // "default rules" notice rather than a half-empty card.
  ruleSummary: PublicEventRuleSummary | null
}

// Small adapter: the reused BracketView takes admin CompetitorRow[]. Build minimal rows (no real
// updatedAt / version leaks) from public competitors.
export function toBracketCompetitors(competitors: PublicCompetitor[]): CompetitorRow[] {
  return competitors.map((c) => ({
    id: c.id,
    name: c.name,
    shortName: c.shortName,
    seed: c.seed,
    displayOrder: 0,
    updatedAt: '',
    // Public bracket rows never carry gender composition (handicap is not a public-privacy concern of
    // the BracketView); the adapter fills the required field as null.
    composition: null,
  }))
}
