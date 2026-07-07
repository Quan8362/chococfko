// PURE screen-reader announcement deriver for the internal-alpha tournament LIVE table (27G-H1A).
//
// Screen-reader users cannot perceive the felt. This module decides — from two viewer-safe table
// snapshots — the MEANINGFUL, concise announcements to make, and nothing else. It is deliberately
// built so that leaking private state is STRUCTURALLY impossible:
//
//   • its only input is `AnnounceSnapshot`, which carries NO cards, NO seed, NO deck order, and
//     NO serialized engine state — just public / viewer-owned scalars already on the table view;
//   • it emits locale-agnostic EVENT descriptors (never copy), which the client hook localizes;
//   • it emits an event ONLY on a real transition (level up, new hand, new street, turn gained,
//     hand complete, connection change), so identical / duplicated realtime snapshots produce
//     nothing — the dedup requirement (no noisy per-render narration) holds by construction.
//
// No React, no I/O — unit-tested (announce.test.ts) to prove the isolation and the transition rules.

// The viewer-safe scalars an announcement may be derived from. NOTHING private can appear here:
// there is no field for a card, a seed, a deck, or an opponent's hidden state.
export interface AnnounceSnapshot {
  readonly handId: string | null
  readonly handNo: number
  readonly complete: boolean
  // Current betting street (PREFLOP/FLOP/TURN/RIVER) or null between hands.
  readonly street: string | null
  // 0-based blind level index (level up ⇒ higher).
  readonly levelIndex: number
  // Whether it is the authenticated viewer's turn to act.
  readonly isMyTurn: boolean
  // Whether the completed hand credited the viewer's own seat (derived from PUBLIC stacks).
  readonly viewerIsWinner: boolean
  // Connection UX state: 'connecting' | 'connected' | 'reconnecting' | 'offline'.
  readonly connUx: string
}

// Locale-agnostic announcement descriptors. The client hook maps each to localized copy. `priority`
// drives which aria-live region carries it: 'assertive' interrupts (turn / lost connection),
// 'polite' waits (everything else).
export type AnnounceEvent =
  | { readonly type: 'blind_level'; readonly level: number; readonly priority: 'polite' }
  | { readonly type: 'hand_start'; readonly handNo: number; readonly priority: 'polite' }
  | { readonly type: 'street'; readonly street: string; readonly priority: 'polite' }
  | { readonly type: 'hand_complete'; readonly won: boolean; readonly priority: 'polite' }
  | { readonly type: 'your_turn'; readonly priority: 'assertive' }
  | { readonly type: 'conn'; readonly state: 'offline' | 'reconnecting' | 'reconnected'; readonly priority: 'polite' | 'assertive' }

// True when two snapshots are announcement-equivalent (no transition worth narrating). Lets the
// client hook skip identical / duplicated realtime snapshots without re-deriving copy.
export function announceSnapshotsEqual(a: AnnounceSnapshot | null, b: AnnounceSnapshot | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.handId === b.handId &&
    a.handNo === b.handNo &&
    a.complete === b.complete &&
    a.street === b.street &&
    a.levelIndex === b.levelIndex &&
    a.isMyTurn === b.isMyTurn &&
    a.viewerIsWinner === b.viewerIsWinner &&
    a.connUx === b.connUx
  )
}

// Derive the announcements for the transition prev → next. Empty when nothing meaningful changed.
// On the FIRST snapshot (prev === null) only the viewer's own turn is announced (so a screen-reader
// user who lands mid-turn is told to act) — table-history events are not replayed on load, keeping
// the initial experience quiet.
export function deriveAnnouncements(prev: AnnounceSnapshot | null, next: AnnounceSnapshot): AnnounceEvent[] {
  const events: AnnounceEvent[] = []

  // ── Connection first: a lost/regained socket is the most urgent context. ──
  if (next.connUx === 'offline' && prev?.connUx !== 'offline') {
    events.push({ type: 'conn', state: 'offline', priority: 'assertive' })
  } else if (next.connUx === 'reconnecting' && prev && prev.connUx !== 'reconnecting' && prev.connUx !== 'offline') {
    events.push({ type: 'conn', state: 'reconnecting', priority: 'polite' })
  } else if (
    next.connUx === 'connected' &&
    prev &&
    prev.connUx !== 'connected' &&
    // Only announce recovery after a real drop, not the ordinary first connecting→connected.
    prev.connUx !== 'connecting'
  ) {
    events.push({ type: 'conn', state: 'reconnected', priority: 'polite' })
  }

  // ── Blind level up. ──
  if (prev && next.levelIndex > prev.levelIndex) {
    events.push({ type: 'blind_level', level: next.levelIndex + 1, priority: 'polite' })
  }

  // ── New hand started (a different, live handId). Not replayed on initial load. ──
  const newHand = !!next.handId && (!prev || next.handId !== prev.handId)
  if (prev && newHand && !next.complete) {
    events.push({ type: 'hand_start', handNo: next.handNo, priority: 'polite' })
  }

  // ── New street within the SAME live hand (community cards advanced). ──
  if (
    prev &&
    next.handId &&
    next.handId === prev.handId &&
    !next.complete &&
    next.street &&
    next.street !== prev.street
  ) {
    events.push({ type: 'street', street: next.street, priority: 'polite' })
  }

  // ── Hand completed. ──
  if (next.handId && next.complete && (!prev || !prev.complete || prev.handId !== next.handId)) {
    events.push({ type: 'hand_complete', won: next.viewerIsWinner, priority: 'polite' })
  }

  // ── The viewer just gained the turn (assertive — action required). ──
  if (next.isMyTurn && (!prev || !prev.isMyTurn)) {
    events.push({ type: 'your_turn', priority: 'assertive' })
  }

  return events
}
