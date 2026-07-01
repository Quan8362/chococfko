// ── Poker client realtime reconciliation engine (Caro-grade) — PURE ─────────────────
//
// PURE module — no React, no Supabase, no DOM. Tested by realtime.test.ts. The React hook
// (app/games/poker/usePokerRealtime.ts) owns the socket + timers and drives THIS controller;
// keeping the reconciliation logic pure makes every concurrency rule a unit-testable fact.
//
// Authority model (realtime-model.md): Postgres is the only source of truth. Realtime
// `postgres_changes` events are NOTIFICATIONS, not state. Because Poker's authoritative state
// spans three tables (poker_hands public state + poker_seats stacks + the caller's private
// poker_hole_cards) plus the engine-computed legal-action set, an event NEVER carries enough to
// safely mutate local state. Instead, every *forward* event triggers a re-read of one
// recipient-aware authoritative SNAPSHOT (fetchPokerSnapshot), and the snapshot — guarded by the
// monotonic `state_version` — is what we apply. This makes gap recovery, duplicate suppression,
// out-of-order rejection, and "money-bearing correctness" trivial and identical on every path
// (initial load, refresh, reconnect, sequence gap, background-tab resume, mobile transition).
//
// 🔴 PRIVACY (SECURITY-HOLE-CARDS-001): the only card-bearing fields this module ever holds are
// (a) the caller's OWN hole cards, recipient-scoped, and (b) the public board / legal showdown
// reveal. `assertSnapshotPrivacy` is a defense-in-depth runtime check that a snapshot never
// carries a foreign hole card, a deck card, or another seat's private state.

import {
  reconcileDecision,
  isStaleVersion,
  isDuplicateVersion,
  shouldApplySnapshot,
  type StateVersion,
} from '../shared/sequence.ts'
import { EnvelopeDedupe } from '../shared/envelope.ts'
import type { ConnState } from '../shared/transport.ts'
import { assertSpectatorSafe } from './events.ts'
import type {
  PublicTableState,
  MyHoleCardsState,
  PokerActionType,
  Card,
} from './types.ts'
import type { LegalActionModel } from './hand.ts'

// ── The caller's private legal-action view ────────────────────────────────────────────
// Returned ONLY to the seat whose turn it is (the model is non-null only then). The client
// DISPLAYS these server-authoritative numbers; it must never substitute its own (security §4).
// This is the canonical shape; the server action (fetchLegalActions) re-exports it.
export interface PokerLegalView {
  readonly model: LegalActionModel | null
  readonly turnSeat: number | null
  readonly turnDeadline: number | null // epoch ms (server-authoritative)
  readonly timeBankSeconds: number
  readonly stateVersion: number
}

// ── Recipient-aware authoritative snapshot ──────────────────────────────────────────────
// The single shape returned by fetchPokerSnapshot, tailored to the viewer. A spectator gets
// `viewerSeatIndex=null, ownHole=null, legal=null` (public information only). A seated player
// additionally gets their OWN hole cards and — only on their turn — their legal-action model.
// This is what every reconcile path applies; it is recipient-aware by construction so the
// server never has to publish one shared payload and rely on the browser to filter (security §2).
export interface PokerSnapshot {
  readonly public: PublicTableState
  readonly viewerSeatIndex: number | null // null ⇒ spectator
  readonly ownHole: MyHoleCardsState | null // ONLY the viewer's own cards; null for spectator
  readonly legal: PokerLegalView | null // ONLY when it is the viewer's turn
  readonly serverTs: number // epoch ms the server assembled this snapshot
}

// Minimal metadata extracted from a raw realtime event (a postgres_changes row). The controller
// only needs the version (to order/dedupe) and an optional stable id (extra dedupe defense).
export interface IncomingEventMeta {
  readonly stateVersion: number
  readonly eventId?: string | null
}

// What the hook should do with an incoming realtime event.
export type IngestDecision =
  | 'reconcile' // a forward event — re-read the authoritative snapshot
  | 'drop' // stale, duplicate, or malformed — ignore (idempotent, D4/EC-I2)

export interface IngestResult {
  readonly decision: IngestDecision
  readonly reason: 'forward' | 'stale' | 'duplicate' | 'gap' | 'invalid'
}

// ── Presentation cues (animation-safe) ───────────────────────────────────────────────────
// Derived PURELY by diffing the previous vs next authoritative public state, and ONLY when a
// snapshot applied as the contiguous next version of the SAME hand. On any non-contiguous jump
// (a gap reconcile, a reconnect, a fresh hand, an initial load) cues are suppressed so the UI
// SNAPS to truth and never replays stale animations as if they were new (D3/EC-I5, the explicit
// "Do not replay old animations after snapshot recovery" rule). Animations never gate state.
export interface TransitionCues {
  readonly newBoardCards: readonly Card[] // cards revealed this step (e.g. the flop)
  readonly potIncreased: boolean
  readonly actingSeat: { readonly seatIndex: number; readonly action: PokerActionType } | null
  readonly streetChanged: boolean
  readonly enteredShowdown: boolean
  readonly settled: boolean
}

export interface SnapshotApplyResult {
  readonly applied: boolean
  readonly reason: 'applied' | 'stale' | 'rejected_privacy'
  readonly newHand: boolean // handId changed ⇒ own cards + any pending animation discarded
  readonly contiguous: boolean // exactly +1 version, same hand ⇒ safe to animate
  readonly cues: TransitionCues | null // non-null only when applied && contiguous
}

// Total pot (main + sides) — a pure helper used for the pot-increase cue and the UI.
export function totalPot(state: PublicTableState): number {
  let sum = state.pots.main.amount
  for (const s of state.pots.sides) sum += s.amount
  return sum
}

// ── Privacy guard — defense in depth on every applied snapshot ──────────────────────────
// Throws if a snapshot would expose a card it must not. Cheap, and it converts a catastrophic
// silent leak into a loud, test-catchable failure (SECURITY-HOLE-CARDS-001).
export function assertSnapshotPrivacy(snap: PokerSnapshot): void {
  // 1. The public projection must carry no foreign hole card / deck card (structural scrub).
  assertSpectatorSafe(snap.public, 'snapshot.public')
  // 2. A spectator (no seat) must never receive private state.
  if (snap.viewerSeatIndex === null) {
    if (snap.ownHole !== null) throw new Error('poker snapshot: spectator received own hole cards')
    if (snap.legal !== null) throw new Error('poker snapshot: spectator received a legal-action model')
    return
  }
  // 3. Own cards, if present, must belong to the viewer's own seat — never another seat's.
  if (snap.ownHole && snap.ownHole.seatIndex !== snap.viewerSeatIndex) {
    throw new Error('poker snapshot: ownHole seat does not match the viewer seat')
  }
  // 4. A legal-action model, if present, must target the viewer's own seat.
  if (snap.legal?.model && snap.legal.model.seatIndex !== snap.viewerSeatIndex) {
    throw new Error('poker snapshot: legal-action model targets a foreign seat')
  }
}

// ── Connection-state UX derivation (realtime-model §4) ───────────────────────────────────
export type PokerConnUx = 'connecting' | 'connected' | 'reconnecting' | 'degraded' | 'offline'

export interface ConnInputs {
  readonly online: boolean // navigator.onLine
  readonly transport: ConnState // raw channel status
  readonly syncFailing: boolean // last reconcile fetch failed
  readonly reconciledOnce: boolean // have we applied at least one authoritative snapshot?
}

export function deriveConnUx(i: ConnInputs): PokerConnUx {
  if (!i.online) return 'offline'
  if (i.transport === 'connecting' || !i.reconciledOnce) return 'connecting'
  if (i.transport === 'reconnecting' || i.transport === 'error' || i.transport === 'closed') return 'reconnecting'
  if (i.syncFailing) return 'degraded'
  return 'connected'
}

// The player may submit an action ONLY when we hold confirmed, current authoritative state.
// While connecting/reconnecting/offline the client reconciles first and the action bar is
// disabled — disconnection never lets a player act on a possibly-stale snapshot (realtime §4).
// (Server still re-validates every action via the expected-seq CAS, so this is belt-and-braces.)
export function canSubmitAction(ux: PokerConnUx): boolean {
  return ux === 'connected'
}

// ── Turn clock (presentation only) — the server owns the real deadline ──────────────────
// Seconds remaining for the countdown ring. The browser NEVER enforces expiry; it only nudges
// the server (tickActionTimer), which re-validates against its own clock. Background-tab
// throttling cannot extend the deadline because the deadline is a fixed server instant.
export function turnSecondsLeft(deadlineMs: number | null, nowMs: number, capSeconds: number): number {
  if (deadlineMs === null) return capSeconds
  const remainMs = deadlineMs - nowMs
  if (remainMs <= 0) return 0
  return Math.min(capSeconds, Math.ceil(remainMs / 1000))
}

// True once the displayed deadline (+ a small client grace beyond the server's own grace) has
// passed, so an open client should nudge authoritative timeout resolution. The server still
// only honours it if ITS clock agrees, so a skewed/slow client can never force an early timeout.
export function shouldNudgeTimeout(deadlineMs: number | null, nowMs: number, graceMs: number): boolean {
  if (deadlineMs === null) return false
  return nowMs - deadlineMs >= graceMs
}

// ── Pure cue diff — only ever called for a contiguous, same-hand apply ──────────────────
function diffCues(prev: PublicTableState, next: PublicTableState): TransitionCues {
  // Board cards added since the previous state (the freshly revealed street).
  const newBoardCards = next.board.slice(prev.board.length)

  // Which seat just acted (lastAction changed, or committed more this street).
  let actingSeat: TransitionCues['actingSeat'] = null
  const prevBySeat = new Map(prev.seats.map((s) => [s.seatIndex, s]))
  for (const s of next.seats) {
    const before = prevBySeat.get(s.seatIndex)
    if (!before) continue
    const actionChanged = s.lastAction !== null && s.lastAction !== before.lastAction
    const committedMore = s.committedThisStreet > before.committedThisStreet
    if (actionChanged || committedMore) {
      actingSeat = { seatIndex: s.seatIndex, action: s.lastAction ?? 'call' }
      break
    }
  }

  return {
    newBoardCards,
    potIncreased: totalPot(next) > totalPot(prev),
    actingSeat,
    streetChanged: next.street !== prev.street,
    enteredShowdown: prev.phase !== 'SETTLEMENT' && next.phase === 'SETTLEMENT' && (next.reveal?.length ?? 0) > 0,
    settled: prev.phase !== 'COMPLETED' && next.phase === 'COMPLETED',
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════
// PokerSyncController — the stateful client reconciliation engine
// ════════════════════════════════════════════════════════════════════════════════════════
// Mirrors the established idiom of EnvelopeDedupe / SubscriptionRegistry (a small, well-tested,
// stateful helper). The hook constructs one per table and feeds it (a) raw realtime events via
// `ingestEvent` and (b) freshly fetched authoritative snapshots via `applySnapshot`, plus the
// out-of-band own-hole-card fetch via `setOwnHole`. It then reads the derived view for render.
//
// Idempotent on `state_version` (applying the same version twice is a no-op). Never derives an
// authoritative fact locally — pots, winners, legal actions, turn order all come from the
// server-assembled snapshot.
export class PokerSyncController {
  private _public: PublicTableState | null = null
  private _ownHole: MyHoleCardsState | null = null
  private _legal: PokerLegalView | null = null
  private _viewerSeatIndex: number | null = null
  private _lastVersion: StateVersion = -1 // -1 ⇒ nothing applied yet (version 0 is valid)
  private _handId: string | null = null
  private readonly _dedupe: EnvelopeDedupe

  constructor(dedupeCapacity = 512) {
    this._dedupe = new EnvelopeDedupe(dedupeCapacity)
  }

  // ── Read accessors (the render view) ──────────────────────────────────────────────────
  get publicState(): PublicTableState | null { return this._public }
  get ownHole(): MyHoleCardsState | null { return this._ownHole }
  get legal(): PokerLegalView | null { return this._legal }
  get viewerSeatIndex(): number | null { return this._viewerSeatIndex }
  get version(): StateVersion { return this._lastVersion }
  get handId(): string | null { return this._handId }
  get hasState(): boolean { return this._public !== null }

  // ── ingestEvent — classify a raw realtime event ───────────────────────────────────────
  // Returns whether the hook should reconcile (re-read the snapshot) or drop the event. We do
  // NOT mutate authoritative state from an event payload — events only ever trigger a snapshot
  // re-read. This makes every ordering case (stale / duplicate / out-of-order / gap) a one-line
  // decision and is identical for money-bearing transitions and benign ones.
  ingestEvent(meta: IncomingEventMeta): IngestResult {
    const v = meta.stateVersion
    if (!Number.isInteger(v) || v < 0) return { decision: 'drop', reason: 'invalid' }

    // Stable-id dedupe (defense in depth): a doubled realtime delivery or a reconnect replay of
    // the same event id is ignored even before the version check.
    if (meta.eventId) {
      if (!this._dedupe.accept(meta.eventId)) return { decision: 'drop', reason: 'duplicate' }
    }

    // Nothing applied yet → always reconcile (initial load).
    if (this._lastVersion < 0) return { decision: 'reconcile', reason: 'forward' }

    if (isDuplicateVersion(v, this._lastVersion)) return { decision: 'drop', reason: 'duplicate' }
    if (isStaleVersion(v, this._lastVersion)) return { decision: 'drop', reason: 'stale' }

    // Forward event. A single-step advance and a multi-step gap BOTH reconcile (we always pull
    // truth), but we label a gap so callers/metrics can see a missed event was detected.
    const decision = reconcileDecision(v, this._lastVersion)
    return { decision: 'reconcile', reason: decision === 'reconcile' ? 'gap' : 'forward' }
  }

  // ── applySnapshot — adopt a trusted, recipient-aware authoritative snapshot ────────────
  // The single mutation point for authoritative state. Guarded by `shouldApplySnapshot` so a
  // late/duplicate snapshot can never regress newer state. Computes whether the transition is a
  // contiguous same-hand step (⇒ emit presentation cues to animate) or a jump (⇒ snap silently).
  applySnapshot(snap: PokerSnapshot): SnapshotApplyResult {
    // Privacy is non-negotiable: a snapshot that would leak is rejected outright, never applied.
    try {
      assertSnapshotPrivacy(snap)
    } catch {
      return { applied: false, reason: 'rejected_privacy', newHand: false, contiguous: false, cues: null }
    }

    const incoming = snap.public.stateVersion
    if (!Number.isInteger(incoming) || incoming < 0) {
      return { applied: false, reason: 'stale', newHand: false, contiguous: false, cues: null }
    }

    // Only adopt newer-or-equal (equal is allowed — a reconcile fetch is trusted truth, not a
    // delta to dedupe; it repairs a possibly-corrupt local copy). Older ⇒ ignore.
    if (this._lastVersion >= 0 && !shouldApplySnapshot(incoming, this._lastVersion)) {
      return { applied: false, reason: 'stale', newHand: false, contiguous: false, cues: null }
    }

    const prevPublic = this._public
    const prevHandId = this._handId
    const nextHandId = snap.public.handId
    const newHand = prevHandId !== nextHandId

    // Contiguous = exactly the next version of the SAME hand AND we had prior state to diff.
    const contiguous = !newHand && prevPublic !== null && this._lastVersion >= 0 && incoming === this._lastVersion + 1
    const cues = contiguous && prevPublic ? diffCues(prevPublic, snap.public) : null

    // Adopt authoritative state.
    this._public = snap.public
    this._viewerSeatIndex = snap.viewerSeatIndex
    this._legal = snap.legal
    this._lastVersion = incoming
    this._handId = nextHandId

    // Own hole cards are recipient-scoped and keyed to the hand. On a new hand the previous
    // hand's cards are discarded; the snapshot carries the current hand's cards (or null until
    // the out-of-band RLS fetch lands).
    if (newHand) {
      this._ownHole = snap.ownHole && snap.ownHole.handId === nextHandId ? snap.ownHole : null
    } else if (snap.ownHole && snap.ownHole.handId === nextHandId) {
      this._ownHole = snap.ownHole
    } else if (snap.ownHole === null && this._ownHole && this._ownHole.handId !== nextHandId) {
      // Defensive: stale own cards from a finished hand never linger.
      this._ownHole = null
    }

    return { applied: true, reason: 'applied', newHand, contiguous, cues }
  }

  // ── setOwnHole — merge the out-of-band RLS own-card fetch (never broadcast) ─────────────
  // The hook re-fetches the caller's own cards via fetchMyHoleCards after each new hand and
  // accepts the result here. Keyed to the CURRENT hand: a result for a different (e.g. just
  // finished) hand is ignored so cards never bleed across hands.
  setOwnHole(hole: MyHoleCardsState | null): boolean {
    if (hole === null) {
      this._ownHole = null
      return true
    }
    if (this._viewerSeatIndex !== null && hole.seatIndex !== this._viewerSeatIndex) {
      return false // never accept cards for a seat that is not ours
    }
    if (this._handId !== null && hole.handId !== this._handId) {
      return false // a different hand's cards — ignore
    }
    this._ownHole = hole
    return true
  }

  // Test/diagnostic helper: a structural snapshot of the controller's current view.
  view(): {
    publicState: PublicTableState | null
    ownHole: MyHoleCardsState | null
    legal: PokerLegalView | null
    viewerSeatIndex: number | null
    version: StateVersion
    handId: string | null
  } {
    return {
      publicState: this._public,
      ownHole: this._ownHole,
      legal: this._legal,
      viewerSeatIndex: this._viewerSeatIndex,
      version: this._lastVersion,
      handId: this._handId,
    }
  }
}
