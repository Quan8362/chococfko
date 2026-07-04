// Poker push-notification CATALOG — PURE, no I/O, no server imports.
//
// The exhaustive list of notification categories the Poker feature is EVER
// allowed to emit (Prompt 29C §2), plus safe URL/tag construction for each. This
// module never touches copy language (the caller passes already-localized
// `title`/`body` via next-intl) — its job is to (a) constrain the set of kinds,
// (b) build a same-origin, secret-free destination URL that re-authorizes
// server-side, (c) keep tournament reminders INERT while tournaments are OFF,
// and (d) route every result through the redaction guard before returning.
//
// What is deliberately IMPOSSIBLE here by construction: there is no input field
// for a card, a snapshot, a password, a token, or a seed. A caller physically
// cannot pass private state in — and even if forbidden words sneak into the
// localized copy, `assertSafeNotification` rejects the whole notification.

import {
  assertSafeNotification,
  type SafePokerNotification,
} from './redaction.ts'

// The complete allowlist. Adding a member here is the ONLY way to introduce a
// new poker notification, and every member must map to a safe URL below.
export type PokerNotificationKind =
  | 'friend_table_invite'   // a friend invites you to sit at their cash table
  | 'private_table_invite'  // you were invited to a password-protected table
  | 'beta_invite'           // you have been admitted to the Poker closed beta
  | 'maintenance_complete'  // poker maintenance finished; tables are open again
  | 'tournament_reminder'   // a scheduled tournament is about to start (INERT until tournaments exist)

// Localized copy resolved by the caller (server-side, per recipient locale).
export type LocalizedCopy = { title: string; body: string }

// Per-kind inputs. Note every field is an ID or a plain display string — never
// a secret, card, or snapshot. The private-table invite carries the table ID
// ONLY; it never carries the password (the destination gate collects that).
export type PokerNotificationInput =
  | ({ kind: 'friend_table_invite'; tableId: string } & LocalizedCopy)
  | ({ kind: 'private_table_invite'; tableId: string } & LocalizedCopy)
  | ({ kind: 'beta_invite' } & LocalizedCopy)
  | ({ kind: 'maintenance_complete' } & LocalizedCopy)
  | ({
      kind: 'tournament_reminder'
      tournamentId: string
      // Reminders exist in code but must NOT be produced while tournaments are a
      // hard-off feature (Prompt 29C §2). The caller passes the resolved flag;
      // when false the builder returns null so nothing is ever dispatched.
      tournamentsEnabled: boolean
    } & LocalizedCopy)

// Landing route for the poker feature — the safe fallback that the access layer
// (flags + Alpha/Beta allowlists) fully governs on the server.
const POKER_HOME = '/games/poker'

// Build a same-origin table path. The ID is percent-encoded so an odd ID can
// never break out of the path or inject a query. NO password/token is ever
// appended — the private-table gate at the destination collects the password
// from the user and validates access server-side (§5).
function tablePath(tableId: string): string {
  return `${POKER_HOME}/${encodeURIComponent(tableId)}`
}

// Turn a validated input into a redaction-checked notification, or null when the
// category is currently inert (tournaments OFF). Throws only if the localized
// copy smuggled a forbidden token in — a programming error we want loud in tests.
export function buildPokerNotification(input: PokerNotificationInput): SafePokerNotification | null {
  let url: string
  let tag: string

  switch (input.kind) {
    case 'friend_table_invite':
    case 'private_table_invite':
      // Both collapse to one invite-per-table tag so repeated invites replace
      // rather than stack, and both land on the table route whose server-side
      // access gate (public seat / PrivateTableGate) is the real authority.
      url = tablePath(input.tableId)
      tag = `poker-invite-${input.tableId}`
      break
    case 'beta_invite':
      url = POKER_HOME
      tag = 'poker-beta-invite'
      break
    case 'maintenance_complete':
      url = POKER_HOME
      tag = 'poker-maintenance'
      break
    case 'tournament_reminder':
      // INERT while tournaments are hard-off. Present in code, produces nothing.
      if (!input.tournamentsEnabled) return null
      url = `${POKER_HOME}/tournaments/${encodeURIComponent(input.tournamentId)}`
      tag = `poker-tournament-${input.tournamentId}`
      break
    default: {
      // Exhaustiveness guard — a new kind without a URL is a compile error.
      const _never: never = input
      void _never
      return null
    }
  }

  return assertSafeNotification({
    kind: input.kind,
    title: input.title,
    body: input.body,
    url,
    tag,
  })
}

// The i18n key prefix each kind's copy is expected to live under, so the dispatch
// site and tests share one source of truth. Copy itself lives in messages/*.json
// under `games.poker.notif.*`.
export const POKER_NOTIFICATION_I18N: Record<PokerNotificationKind, { title: string; body: string }> = {
  friend_table_invite: { title: 'games.poker.notif.friend_invite.title', body: 'games.poker.notif.friend_invite.body' },
  private_table_invite: { title: 'games.poker.notif.private_invite.title', body: 'games.poker.notif.private_invite.body' },
  beta_invite: { title: 'games.poker.notif.beta_invite.title', body: 'games.poker.notif.beta_invite.body' },
  maintenance_complete: { title: 'games.poker.notif.maintenance.title', body: 'games.poker.notif.maintenance.body' },
  tournament_reminder: { title: 'games.poker.notif.tournament.title', body: 'games.poker.notif.tournament.body' },
}
