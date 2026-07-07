// PURE accessible-name builder for tournament ring seats (27G-H1A).
//
// A ring seat is a visual pod (avatar, markers, name/stack plate). To a screen-reader it was
// previously an unlabeled cluster. This composes a single, concise accessible NAME from ONLY the
// public / viewer-visible facts a sighted player can already read off the felt — seat position,
// display name, stack, and public status (dealer / blinds / folded / all-in / winner / on-turn).
//
// It is STRUCTURALLY safe: `SeatA11yFacts` has no field for cards, seed, email, or UUID, so a leak
// is impossible. `stackLabel` is the already-formatted short figure (e.g. "12.3K"); the raw number
// never enters. Pure + translator-injected ⇒ unit-tested (seatA11y.test.ts) across the fact matrix.

export interface SeatA11yFacts {
  readonly seatIndex: number // 0-based; the label shows seatIndex + 1
  readonly displayName: string | null
  readonly isSelf: boolean
  readonly stackLabel: string // pre-formatted (formatCoinsShort) — never the raw number
  readonly isButton?: boolean
  readonly isSmallBlind?: boolean
  readonly isBigBlind?: boolean
  readonly isCurrentActor?: boolean
  readonly folded?: boolean
  readonly allIn?: boolean
  readonly isWinner?: boolean
  readonly sittingOut?: boolean
}

// A minimal translator: the next-intl `t` scoped to `games.poker.a11y` satisfies this.
export type A11yTranslate = (key: string, values?: Record<string, string | number>) => string

// Build the seat's accessible name, e.g. "Seat 3, Alice, 12.3K chips, dealer, to act".
// Fragments are localized and comma-joined so a screen reader reads them as a short list.
export function seatAccessibleName(f: SeatA11yFacts, t: A11yTranslate): string {
  const name = (f.displayName && f.displayName.trim()) || t(f.isSelf ? 'you' : 'player')
  const parts: string[] = [
    t('seat', { pos: f.seatIndex + 1 }),
    name,
    t('seat_stack', { stack: f.stackLabel }),
  ]
  if (f.isButton) parts.push(t('dealer'))
  if (f.isSmallBlind) parts.push(t('small_blind'))
  if (f.isBigBlind) parts.push(t('big_blind'))
  // Exactly one contention status, most-significant first.
  if (f.isWinner) parts.push(t('winner'))
  else if (f.allIn) parts.push(t('all_in'))
  else if (f.folded) parts.push(t('folded'))
  else if (f.sittingOut) parts.push(t('sitting_out'))
  if (f.isCurrentActor && !f.folded && !f.isWinner) parts.push(t('turn'))
  return parts.join(', ')
}

// Accessible name for an empty ring seat, e.g. "Empty seat 3".
export function emptySeatAccessibleName(seatIndex: number, t: A11yTranslate): string {
  return t('empty_seat', { pos: seatIndex + 1 })
}
