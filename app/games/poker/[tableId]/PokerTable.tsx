'use client'

// ── PokerTable — the live gameplay surface ───────────────────────────────────────────────────
//
// Assembles the authoritative realtime state (usePokerRealtime) onto the approved visual design
// system (../_components) using the centralized seat geometry (lib/games/poker/seatLayout). It is
// a presentation orchestrator: it NEVER decides cards, winners, pots, legal actions, turn order,
// stack changes, or settlement — every such fact is read from the server-assembled snapshot. The
// browser only sends minimal intent through `act` (re-validated server-side via the expected-seq
// CAS). Animations + sound are driven by the hook's animation-safe transition cues, so they never
// gate state and are never replayed after a snapshot recovery / reconnect.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import '../_design/poker-theme.css'
import { useViewportClass, type PokerLayout } from '../_design/useViewportClass'
import { usePokerSound } from '../_design/usePokerSound'
import { useFullscreen } from '../_design/useFullscreen'
import { useWakeLock } from '../_design/useWakeLock'
import { usePokerAppUpdate } from '../_design/usePokerAppUpdate'
import { shouldPromptUpdate } from '@/lib/games/poker/pwa/version'
import { HAPTIC_PATTERN } from '@/lib/games/poker/mobileSession'
import { usePokerPrefs } from '../_eco/prefs'
import { usePokerRealtime } from '../usePokerRealtime'
import { tableGeometry, visualPosition, type PokerTableLayout } from '@/lib/games/poker/seatLayout'
import { assignBlinds, type RingSeat } from '@/lib/games/poker/order'
import { evaluateHand, HAND_CATEGORY_LABEL } from '@/lib/games/poker/evaluator'
import { totalPot } from '@/lib/games/poker/realtime'
import type { PublicSeat, PokerActionType } from '@/lib/games/poker/types'
import { formatCoinsShort, formatCoinsFull } from '@/lib/game/economy'
import {
  PlayerSeat,
  PlayerAvatarFrame,
  SeatPocketCards,
  CommunityCardSlot,
  PokerCard,
  PotDisplay,
  SidePotDisplay,
  StreetIndicator,
  ConnectionIndicator,
  WinnerHighlight,
  InlineGameMessage,
  RotateDeviceOverlay,
  UpdateAvailableBanner,
  TableBackground,
  ActionButton,
  type PokerSeatView,
  type StreetName,
} from '../_components'
import { ActionControls } from '../_components/ActionControls'
import { PokerReactionTrigger, PokerReactionBubbleLayer } from '../_components/PokerReactions'
import { usePokerReactions } from './usePokerReactions'
import ReportProblemButton from '../_components/ReportProblemButton'
import type { PokerBugContext } from '@/lib/games/poker/bugReport'
import { recordUxSignal } from '@/lib/games/poker/uxSignals'
import { sitDown, sitOut, returnFromSitOut, leaveTable, startHand } from '../actions'

export interface PokerTableConfig {
  readonly name: string
  readonly smallBlind: number
  readonly bigBlind: number
  readonly capacity: number
  readonly minBuyIn: number
  readonly maxBuyIn: number
  readonly actionTimeSeconds: number
  readonly timeBankSeconds: number
  readonly allowSpectators: boolean
}

export interface PokerTableProps {
  readonly tableId: string
  readonly userId: string | null
  readonly config: PokerTableConfig
}

const LIVE_PHASES = new Set(['BETTING', 'SHOWDOWN', 'SETTLEMENT', 'STARTING'])

function geomLayout(layout: PokerLayout): PokerTableLayout {
  return layout === 'portrait' ? 'mobile' : layout
}

interface DerivedBlinds {
  readonly sb: number | null
  readonly bb: number | null
}

// Best-effort SB/BB derivation from the AUTHORITATIVE button + the seats participating in the
// live hand (public state carries the dealer button but not the blind seats). Only computed
// during a live hand; falls back to "unknown" rather than guessing wrong.
function deriveBlinds(seats: readonly PublicSeat[], buttonSeat: number | null, live: boolean): DerivedBlinds {
  if (!live || buttonSeat === null) return { sb: null, bb: null }
  const ring: RingSeat[] = seats
    .filter((s) => s.userId && (s.status === 'sitting_in' || s.allIn || s.status === 'leaving' || s.lastAction === 'fold'))
    .map((s) => ({ seatIndex: s.seatIndex, eligible: true }))
    .sort((a, b) => a.seatIndex - b.seatIndex)
  if (ring.length < 2 || !ring.some((r) => r.seatIndex === buttonSeat)) return { sb: null, bb: null }
  try {
    const b = assignBlinds(ring, buttonSeat)
    return { sb: b.smallBlindSeat, bb: b.bigBlindSeat }
  } catch {
    return { sb: null, bb: null }
  }
}

export default function PokerTable({ tableId, userId, config }: PokerTableProps) {
  const t = useTranslations('games.poker')
  const vp = useViewportClass()
  const { play, muted, toggleMuted, vibrate } = usePokerSound()
  const prefs = usePokerPrefs()
  // Fullscreen targets the poker root so safe-area padding + all HUD survive the transition.
  const rootRef = useRef<HTMLDivElement>(null)
  const fs = useFullscreen(rootRef)
  // App-level reduced motion: honour the in-game toggles in addition to the OS setting (the CSS
  // layer neutralises animation for `[data-pk-reduce-motion="1"]`, mirroring the media query).
  const reduceMotion = prefs.reducedMotion || !prefs.animation
  const rt = usePokerRealtime(tableId)
  const {
    publicState,
    ownHole,
    legal,
    viewerSeatIndex,
    isSpectator,
    isMyTurn,
    connUx,
    canAct,
    cues,
  } = rt

  // Keep the screen awake ONLY while opted-in and actually seated in the hand (released on leave,
  // tab hide, or unmount). Never gates gameplay — silently inert where unsupported.
  useWakeLock(prefs.wakeLock, viewerSeatIndex !== null)

  // Quick reactions — transient FX channel (separate from the authoritative game channel). Only a
  // seated player can send; the seat on every bubble is server-authoritative.
  const reactions = usePokerReactions(tableId, viewerSeatIndex)

  const geom = tableGeometry(config.capacity, geomLayout(vp.layout))
  const seats = useMemo<readonly PublicSeat[]>(() => publicState?.seats ?? [], [publicState?.seats])
  const phase = publicState?.phase ?? 'COMPLETED'
  const live = !!publicState?.handId && LIVE_PHASES.has(phase)
  const street = (publicState?.street ?? 'PREFLOP') as StreetName
  const board = publicState?.board ?? []
  const buttonSeat = publicState?.buttonSeat ?? null
  const blinds = useMemo(() => deriveBlinds(seats, buttonSeat, live), [seats, buttonSeat, live])

  // App-update watcher: detect a newer deploy and surface a non-blocking reload ONLY between hands
  // (a seated player in a live hand is never interrupted). A protocol mismatch is urgent — it shows
  // even mid-hand and blocks new action submits (the client must reload before it can act again).
  const { updateAvailable, mustBlock: protocolMismatch, applyUpdate } = usePokerAppUpdate()
  const inHand = viewerSeatIndex !== null && live
  const showUpdateBanner = shouldPromptUpdate({ updateAvailable, protocolMismatch, inHand }) || protocolMismatch

  // ── Command plumbing: a single in-flight action (no double submit) + recoverable errors ──
  const [pending, setPending] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  // t0 for the current decision — set when it becomes the viewer's turn (see the effect below),
  // read to compute the decision time (`elapsedMs`) when the viewer submits.
  const turnStartRef = useRef<number | null>(null)
  const onAct = useCallback(
    async (action: PokerActionType, amount?: number) => {
      if (pending) return
      // UX signal: the viewer submitted an intent this turn. `elapsedMs` = decision time. This
      // records the SUBMIT (not the server's accept), so it captures the interaction regardless of
      // outcome. Fire-and-forget; never affects play.
      const started = turnStartRef.current
      recordUxSignal('action_submitted', started != null ? { elapsedMs: Date.now() - started } : undefined)
      turnStartRef.current = null
      setPending(true)
      setErrorCode(null)
      try {
        const res = await rt.act(action, amount)
        if (!res.ok) setErrorCode(res.error ?? 'generic')
        // Haptic confirmation the intent was accepted. A single fixed buzz for every action
        // (a stronger one only for the always-public all-in) — never encodes hand strength.
        else vibrate(action === 'all_in' ? HAPTIC_PATTERN.allIn : HAPTIC_PATTERN.actionAccepted)
      } finally {
        setPending(false)
      }
    },
    [pending, rt, vibrate],
  )
  // UX signal: mark the start of each fresh decision point where the viewer is the actor. Keyed on
  // the authoritative action-seq so it fires once per turn (not on every re-render), and only when
  // the server has actually handed this viewer a legal-action model.
  const myTurnSeq = isMyTurn && legal?.model ? legal.model.actionSeq : null
  useEffect(() => {
    if (myTurnSeq != null) {
      turnStartRef.current = Date.now()
      recordUxSignal('turn_started')
      // Haptic nudge that it's the viewer's turn (mobile players may not be looking at the screen).
      vibrate(HAPTIC_PATTERN.yourTurn)
    } else {
      turnStartRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurnSeq])

  // ── Time-pressure cue — sound + haptic, once per own turn, near the server deadline ──────────
  // Fires only on the VIEWER's own turn (never reveals opponents' timing) and only once per turn.
  // It is derived from the server-authoritative deadline; it never enforces the timeout.
  const turnDeadline = isMyTurn ? publicState?.turnDeadline ?? null : null
  const warnFiredRef = useRef<string | null>(null)
  useEffect(() => {
    if (myTurnSeq == null || turnDeadline == null) return
    const turnKey = `${publicState?.handId ?? ''}:${myTurnSeq}`
    const WARN_LEAD_MS = 5000
    const fire = () => {
      if (warnFiredRef.current === turnKey) return
      warnFiredRef.current = turnKey
      play('timerWarn')
      vibrate(HAPTIC_PATTERN.timerWarning)
    }
    const delay = turnDeadline - WARN_LEAD_MS - Date.now()
    if (delay <= 0) {
      // Already inside the warning window (e.g. reconnected mid-turn) — fire immediately, once.
      fire()
      return
    }
    const id = window.setTimeout(fire, delay)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurnSeq, turnDeadline, publicState?.handId])
  // A fresh decision point (new action-seq) clears any stale rejection message.
  const legalSeq = legal?.stateVersion
  useEffect(() => {
    setErrorCode(null)
  }, [legalSeq])

  // ── Sound + animation cues (animation-safe; suppressed on snapshot recovery) ──────────────
  useEffect(() => {
    if (!cues) return
    const d = cues.data
    if (d.actingSeat) {
      const a = d.actingSeat.action
      if (a === 'check') play('check')
      else if (a === 'call') play('call')
      else if (a === 'bet' || a === 'raise') play('raise')
      else if (a === 'all_in') play('allin')
    }
    if (d.newBoardCards.length > 0) play('flip')
    if (d.settled) play('potAward')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cues?.id])

  // New-hand chime + deal — only on a genuine hand→hand transition (never the initial load or a
  // reconnect into an already-running hand).
  const prevHandRef = useRef<string | null>(null)
  useEffect(() => {
    const h = publicState?.handId ?? null
    if (h && prevHandRef.current && h !== prevHandRef.current) {
      play('newHand')
      play('deal')
    }
    prevHandRef.current = h
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicState?.handId])

  // Freshly revealed board cards get the deal-in animation for a short beat.
  const [animBoardFrom, setAnimBoardFrom] = useState<number | null>(null)
  useEffect(() => {
    const n = cues?.data.newBoardCards.length ?? 0
    if (n > 0) {
      const total = publicState?.board.length ?? 0
      setAnimBoardFrom(total - n)
      const id = setTimeout(() => setAnimBoardFrom(null), 700)
      return () => clearTimeout(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cues?.id])

  // ── Showdown / winner — determined from AUTHORITATIVE stack deltas, never client evaluation ──
  // The server credits winners at settlement; the per-seat stack increase IS the amount won. A
  // non-contiguous load (reconnect) yields no cue, so no banner replays — we just snap to truth.
  const lastStacksRef = useRef<Map<number, number>>(new Map())
  const [settlement, setSettlement] = useState<{ winners: { seat: number; amount: number }[]; handKey?: string } | null>(null)
  useEffect(() => {
    if (!publicState) return
    const cur = new Map(publicState.seats.map((s) => [s.seatIndex, s.stack]))
    const prev = lastStacksRef.current
    if (cues?.data.settled && prev.size > 0) {
      const winners: { seat: number; amount: number }[] = []
      for (const s of publicState.seats) {
        const before = prev.get(s.seatIndex)
        if (before != null && s.stack > before) winners.push({ seat: s.seatIndex, amount: s.stack - before })
      }
      if (winners.length > 0) {
        winners.sort((a, b) => b.amount - a.amount)
        // Name the top winner's hand for the banner ONLY (presentation; the winner itself was
        // decided by the authoritative payout, not by this evaluation).
        let handKey: string | undefined
        const top = winners[0]
        const reveal = publicState.reveal?.find((r) => r.seatIndex === top.seat)
        if (reveal && publicState.board.length >= 3) {
          try {
            handKey = HAND_CATEGORY_LABEL[evaluateHand(reveal.cards, publicState.board).category]
          } catch {
            handKey = undefined
          }
        }
        setSettlement({ winners, handKey })
        // Celebratory haptic only when the VIEWER is among the winners.
        if (viewerSeatIndex != null && winners.some((w) => w.seat === viewerSeatIndex)) {
          vibrate(HAPTIC_PATTERN.potWon)
        }
      }
    }
    lastStacksRef.current = cur
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicState, cues?.id])

  // Clear the settlement banner when a new hand begins.
  useEffect(() => {
    setSettlement(null)
  }, [publicState?.handId])

  const winnerSeats = useMemo(() => new Set((settlement?.winners ?? []).map((w) => w.seat)), [settlement])

  // ── Seating / deal affordances ───────────────────────────────────────────────────────────
  const sittingInCount = seats.filter((s) => s.status === 'sitting_in').length
  const canDeal = viewerSeatIndex !== null && !live && sittingInCount >= 2
  const [busy, setBusy] = useState<string | null>(null)
  const [sitSeat, setSitSeat] = useState<number | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const doDeal = useCallback(async () => {
    setBusy('deal')
    setErrorCode(null)
    try {
      const res = await startHand(tableId)
      if (!res.ok) setErrorCode(res.error ?? 'generic')
      // Whether a fresh hand started OR the idempotent guard returned an already-live hand,
      // our local snapshot may be stale (a missed realtime hand-start leaves the dead "Chia ván
      // mới" button showing while a hand is actually in progress). Force an authoritative
      // reconcile so the live hand appears instead of the click silently doing nothing.
      rt.reconcileNow()
    } finally {
      setBusy(null)
    }
  }, [tableId, rt])

  const viewerSeat = viewerSeatIndex !== null ? seats.find((s) => s.seatIndex === viewerSeatIndex) ?? null : null
  const viewerSittingOut = viewerSeat?.status === 'sitting_out'

  const reveals = useMemo(() => {
    const m = new Map<number, readonly [import('@/lib/games/poker/types').Card, import('@/lib/games/poker/types').Card]>()
    for (const r of publicState?.reveal ?? []) m.set(r.seatIndex, r.cards)
    return m
  }, [publicState?.reveal])

  // Build a seat view from authoritative public state + presentation flags.
  const toSeatView = useCallback(
    (s: PublicSeat, isSelf: boolean): PokerSeatView => {
      const folded = s.lastAction === 'fold'
      const inHand = live && !!s.userId && s.status !== 'sitting_out' && s.status !== 'reserved' && s.status !== 'empty'
      const reveal = reveals.get(s.seatIndex) ?? null
      const ownCards = isSelf && ownHole && ownHole.seatIndex === s.seatIndex ? ownHole.cards : null
      return {
        seatIndex: s.seatIndex,
        status: s.status,
        displayName: s.displayName,
        avatarUrl: s.avatarUrl,
        stack: s.stack,
        committedThisStreet: s.committedThisStreet,
        lastAction: s.lastAction,
        allIn: s.allIn,
        folded,
        connected: s.connected,
        isButton: buttonSeat === s.seatIndex,
        isSmallBlind: blinds.sb === s.seatIndex,
        isBigBlind: blinds.bb === s.seatIndex,
        isCurrentActor: publicState?.turnSeat === s.seatIndex && phase === 'BETTING',
        isWinner: winnerSeats.has(s.seatIndex),
        winAmount: settlement?.winners.find((w) => w.seat === s.seatIndex)?.amount,
        cards: reveal ?? ownCards,
        inHand,
        deadline: publicState?.turnSeat === s.seatIndex ? publicState?.turnDeadline ?? null : null,
        turnTotalSeconds: config.actionTimeSeconds,
        isSelf,
      }
    },
    [live, reveals, ownHole, buttonSeat, blinds, publicState, phase, winnerSeats, settlement, config.actionTimeSeconds],
  )

  // ── Render ────────────────────────────────────────────────────────────────────────────────
  const pots = publicState?.pots ?? { main: { amount: 0, eligibleSeatIndexes: [] }, sides: [] }
  const grandTotal = publicState ? totalPot(publicState) : 0
  const compact = geom.compactSeats

  // Ring pods: every physical seat EXCEPT the seated viewer's own seat (the viewer owns the
  // bottom hero band). A spectator has no hero seat, so all seats render in the ring.
  const ringSeatIndexes = Array.from({ length: config.capacity }, (_, i) => i).filter(
    (i) => viewerSeatIndex === null || i !== viewerSeatIndex,
  )

  // ── Alpha bug-report context (non-sensitive; NEVER hole cards / deck) ──────────────────────
  // Count client-observed reconnect transitions so a report reflects connection churn.
  const reconnectCountRef = useRef(0)
  const prevConnRef = useRef(connUx)
  const reconnectStartRef = useRef<number | null>(null)
  useEffect(() => {
    if (connUx === 'reconnecting' && prevConnRef.current !== 'reconnecting') {
      reconnectCountRef.current += 1
      reconnectStartRef.current = Date.now()
    }
    // Recovery: leaving the reconnecting state — record how long recovery took (UX signal).
    if (prevConnRef.current === 'reconnecting' && connUx !== 'reconnecting') {
      const started = reconnectStartRef.current
      recordUxSignal('reconnect_recovered', started != null ? { elapsedMs: Date.now() - started } : undefined)
      reconnectStartRef.current = null
    }
    prevConnRef.current = connUx
  }, [connUx])
  // Record when the rotate-to-landscape prompt is shown (portrait on the table) — a UX-research
  // signal about how often small-phone players hit the orientation wall.
  const wasPortraitRef = useRef(false)
  useEffect(() => {
    if (vp.isPortrait && !wasPortraitRef.current) recordUxSignal('device_rotated')
    wasPortraitRef.current = vp.isPortrait
  }, [vp.isPortrait])

  const seatedCount = seats.filter((s) => s.userId != null).length
  const bugContext = useMemo<Partial<PokerBugContext>>(() => ({
    tableId,
    handId: publicState?.handId ?? undefined,
    seatIndex: viewerSeatIndex ?? undefined,
    street: publicState?.street ?? undefined,
    phase,
    stateVersion: publicState?.stateVersion ?? undefined,
    playerCount: seatedCount,
    connectionState: connUx,
    reconnectCount: reconnectCountRef.current,
    errorCode: errorCode ?? undefined,
  }), [tableId, publicState?.handId, publicState?.street, publicState?.stateVersion, phase, viewerSeatIndex, seatedCount, connUx, errorCode])

  return (
    <div
      ref={rootRef}
      className="poker-root fixed inset-0 z-[110] overflow-hidden"
      style={{ background: 'var(--pk-bg-void)' }}
      data-testid="poker-table"
      data-table-id={tableId}
      data-phase={phase}
      data-live={live ? '1' : '0'}
      data-hand-no={publicState?.handNo ?? 0}
      data-viewer-seat={viewerSeatIndex ?? ''}
      data-turn-seat={publicState?.turnSeat ?? ''}
      data-pk-reduce-motion={reduceMotion ? '1' : '0'}
    >
      {vp.isPortrait && (
        <RotateDeviceOverlay
          deadlineMs={isMyTurn ? publicState?.turnDeadline ?? null : null}
          leaveLabel={t('hud.leave')}
          onLeave={
            viewerSeatIndex !== null
              ? () => {
                  void leaveTable(tableId, viewerSeatIndex)
                }
              : undefined
          }
        />
      )}

      {/* Alpha in-game bug report — always reachable (incl. reconnect/offline overlays) */}
      <ReportProblemButton variant="floating" context={bugContext} />

      {/* ── Felt + everything anchored to the inner play area ── */}
      <TableBackground layout={geomLayout(vp.layout)}>
        {/* Inner play area == the background-art image rect (TableBackground's cover box). All
            seat pads / card pockets / board geometry are a % of THIS box, so they stay glued to
            the art at any viewport size. */}
        <div className="absolute" style={{ inset: 0 }}>
          {/* ── Centre: board + pots + street + winner ── */}
          <div
            className="absolute flex flex-col items-center gap-2"
            style={{ left: `${geom.center.xPct}%`, top: `${geom.center.yPct}%`, transform: 'translate(-50%,-50%)' }}
          >
            {settlement && settlement.winners.length > 0 ? (
              <WinnerHighlight
                winnerName={
                  settlement.winners.length > 1
                    ? t('overlay.split_pot', { n: settlement.winners.length })
                    : seats.find((s) => s.seatIndex === settlement.winners[0].seat)?.displayName ?? t('seat.winner')
                }
                amount={settlement.winners.length === 1 ? settlement.winners[0].amount : undefined}
                handName={settlement.handKey ? t(`hand_name.${settlement.handKey}`) : undefined}
              />
            ) : (
              <div className="flex items-center gap-1.5" data-testid="poker-community" data-count={board.length}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <CommunityCardSlot
                    key={i}
                    card={board[i] ?? null}
                    w={geom.boardCardW}
                    dealt={animBoardFrom != null && i >= animBoardFrom}
                  />
                ))}
              </div>
            )}
            {grandTotal > 0 && (
              <div data-testid="poker-pot-total" data-amount={grandTotal}>
                <PotDisplay pots={pots} compact={compact} />
              </div>
            )}
            {live && (
              <div data-testid="poker-street" data-street={street}>
                <StreetIndicator street={street} compact={compact} />
              </div>
            )}
          </div>

          {/* ── Ring seats — pod on the rail pad, hole cards in the felt pocket in front of it ── */}
          {ringSeatIndexes.map((seatIndex) => {
            const s = seats.find((x) => x.seatIndex === seatIndex)
            const pos = visualPosition(seatIndex, viewerSeatIndex, config.capacity)
            const anchor = geom.seats[pos]
            const pocket = geom.pockets[pos]
            const occupied = s && s.userId
            const view = occupied ? toSeatView(s, false) : null
            return (
              <div key={seatIndex}>
                {/* card pocket (behind the pod in z so a pod overlap keeps the avatar on top) */}
                {view && (
                  <div
                    className="absolute z-[1]"
                    style={{ left: `${pocket.xPct}%`, top: `${pocket.yPct}%`, transform: 'translate(-50%,-50%)' }}
                    data-testid="poker-seat-cards"
                    data-seat-index={seatIndex}
                  >
                    <SeatPocketCards
                      cards={view.cards}
                      inHand={view.inHand}
                      folded={view.folded}
                      isWinner={view.isWinner}
                      w={geom.pocketCardW}
                    />
                  </div>
                )}
                {/* seat pod on the rail pad */}
                <div
                  className="absolute z-[2]"
                  style={{ left: `${anchor.xPct}%`, top: `${anchor.yPct}%`, transform: 'translate(-50%,-50%)' }}
                  data-testid="poker-seat"
                  data-seat-index={seatIndex}
                  data-occupied={occupied ? '1' : '0'}
                  data-status={s?.status ?? 'empty'}
                  data-stack={occupied ? s.stack : ''}
                  data-current-actor={publicState?.turnSeat === seatIndex && phase === 'BETTING' ? '1' : '0'}
                  data-winner={winnerSeats.has(seatIndex) ? '1' : '0'}
                  data-folded={s?.lastAction === 'fold' ? '1' : '0'}
                >
                  {view ? (
                    <PlayerSeat seat={view} avatarSize={geom.seatAvatarSize} compact={compact} lowStackThreshold={config.bigBlind * 5} hideCards />
                  ) : (
                    <EmptySeatPod
                      seatIndex={seatIndex}
                      label={t('seat.empty')}
                      sitLabel={t('action_bar.sit_here')}
                      canSit={viewerSeatIndex === null && !!userId}
                      onSit={() => setSitSeat(seatIndex)}
                      compact={compact}
                    />
                  )}
                </div>
              </div>
            )
          })}

          {/* Quick-reaction bubbles — anchored to each sender's seat in the SAME % coordinate space
              as the pods, so they land on the correct seat on every client. */}
          <PokerReactionBubbleLayer
            bubbles={reactions.bubbles}
            geom={geom}
            viewerSeatIndex={viewerSeatIndex}
            capacity={config.capacity}
            lastAnnounceKey={reactions.lastAnnounceKey}
          />
        </div>
      </TableBackground>

      {/* ── Top-left HUD: table info + connection ── */}
      <div className="absolute flex flex-col gap-1.5" style={{ top: 'calc(var(--pk-safe-top) + 8px)', left: 'calc(var(--pk-safe-left) + 10px)' }}>
        <div
          className="flex items-center gap-2 rounded-full px-3 py-1.5"
          style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid var(--pk-gold-line)' }}
        >
          <span className="max-w-[36vw] truncate font-serif" style={{ color: 'var(--pk-gold-soft)', fontSize: 14 }} title={config.name}>
            {config.name}
          </span>
          <span className="tabular-nums" style={{ color: 'var(--pk-text-mid)', fontSize: 12 }}>
            {formatCoinsShort(config.smallBlind)}/{formatCoinsShort(config.bigBlind)}
          </span>
          {(publicState?.handNo ?? 0) > 0 && (
            <span className="tabular-nums" style={{ color: 'var(--pk-text-low)', fontSize: 11.5 }}>
              #{publicState?.handNo}
            </span>
          )}
        </div>
        <ConnectionIndicator status={connUx} variant="banner" />
        {showUpdateBanner && <UpdateAvailableBanner onUpdate={applyUpdate} urgent={protocolMismatch} />}
      </div>

      {/* ── Top-right: sound + menu ── */}
      <div className="absolute flex items-center gap-2" style={{ top: 'calc(var(--pk-safe-top) + 8px)', right: 'calc(var(--pk-safe-right) + 10px)' }}>
        {fs.supported && (
          <IconPill
            onClick={() => void fs.toggle()}
            title={fs.isFullscreen ? t('hud.fullscreen_exit') : t('hud.fullscreen_enter')}
            aria-label={fs.isFullscreen ? t('hud.fullscreen_exit') : t('hud.fullscreen_enter')}
            active={fs.isFullscreen}
          >
            {fs.isFullscreen ? '🡼' : '⛶'}
          </IconPill>
        )}
        <IconPill onClick={toggleMuted} title={muted ? t('hud.unmute') : t('hud.mute')} aria-label={muted ? t('hud.unmute') : t('hud.mute')}>
          {muted ? '🔇' : '🔊'}
        </IconPill>
        <IconPill onClick={() => setMenuOpen((v) => !v)} title={t('hud.menu')} aria-label={t('hud.menu')}>
          ☰
        </IconPill>
        {menuOpen && (
          <div
            className="absolute right-0 top-[44px] z-10 flex w-48 flex-col gap-1 rounded-xl p-2"
            style={{ background: 'linear-gradient(180deg,#1a1620,#0e0c12)', border: '1px solid var(--pk-gold-line)', boxShadow: 'var(--pk-shadow-raised)' }}
          >
            {viewerSeatIndex !== null && !viewerSittingOut && (
              <MenuItem
                label={t('hud.sit_out')}
                disabled={busy !== null}
                onClick={async () => {
                  setMenuOpen(false)
                  setBusy('sitout')
                  try {
                    await sitOut(tableId, viewerSeatIndex)
                  } finally {
                    setBusy(null)
                  }
                }}
              />
            )}
            {viewerSeatIndex !== null && viewerSittingOut && (
              <MenuItem
                label={t('hud.return')}
                disabled={busy !== null}
                onClick={async () => {
                  setMenuOpen(false)
                  setBusy('return')
                  try {
                    await returnFromSitOut(tableId, viewerSeatIndex)
                  } finally {
                    setBusy(null)
                  }
                }}
              />
            )}
            {viewerSeatIndex !== null && (
              <MenuItem
                label={t('hud.leave')}
                tone="danger"
                disabled={busy !== null}
                onClick={async () => {
                  setMenuOpen(false)
                  setBusy('leave')
                  try {
                    await leaveTable(tableId, viewerSeatIndex)
                  } finally {
                    setBusy(null)
                  }
                }}
              />
            )}
            <MenuItem label={t('hud.back_to_lobby')} onClick={() => { window.location.href = '/games/poker' }} />
          </div>
        )}
      </div>

      {/* ── Bottom hero band: own cards + stack + the action bar ── */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 px-3 pt-2"
        style={{ paddingBottom: 'calc(var(--pk-safe-bottom) + 8px)' }}
      >
        {/* status / side-pot detail strip above the controls */}
        <div className="flex w-full max-w-[820px] items-center justify-center gap-2">
          {pots.sides.length > 0 && compact && (
            <details className="rounded-lg" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--pk-gold-line)' }}>
              <summary className="cursor-pointer list-none px-3 py-1 text-[12px]" style={{ color: 'var(--pk-gold-soft)' }}>
                {t('pot.side_summary', { n: pots.sides.length })}
              </summary>
              <div className="p-2">
                <SidePotDisplay pots={pots} />
              </div>
            </details>
          )}
        </div>

        <div
          className="grid w-full max-w-[860px] items-end gap-3 rounded-2xl px-3 py-2.5"
          style={{ gridTemplateColumns: '1fr auto 1fr', background: 'linear-gradient(180deg, rgba(22,19,27,0.92), rgba(7,6,10,0.96))', border: '1px solid var(--pk-gold-line)', boxShadow: 'var(--pk-shadow-panel)' }}
        >
          {/* hero identity + own cards (grid col 1) */}
          {viewerSeat ? (
            <div
              className="flex shrink-0 items-end gap-2"
              data-testid="poker-hero"
              data-seat-index={viewerSeatIndex ?? ''}
              data-stack={viewerSeat.stack}
              data-status={viewerSeat.status}
              data-has-avatar={viewerSeat.avatarUrl ? '1' : '0'}
            >
              {ownHole && ownHole.seatIndex === viewerSeatIndex && (
                <div className="flex items-end gap-1" data-testid="poker-hero-cards" data-count={2}>
                  <PokerCard card={ownHole.cards[0]} w={compact ? 40 : 52} highlight={winnerSeats.has(viewerSeatIndex)} />
                  <PokerCard card={ownHole.cards[1]} w={compact ? 40 : 52} highlight={winnerSeats.has(viewerSeatIndex)} />
                </div>
              )}
              {/* Own occupied-seat identity: real profile avatar (initials fallback), so the felt
                  seat is unmistakably the local player — not only a name/stack readout. */}
              <div data-testid="poker-hero-avatar">
                <PlayerAvatarFrame
                  name={viewerSeat.displayName}
                  avatarUrl={viewerSeat.avatarUrl}
                  size={compact ? 38 : 46}
                  actor={isMyTurn}
                  winner={viewerSeatIndex !== null && winnerSeats.has(viewerSeatIndex)}
                  disconnected={connUx === 'offline' || connUx === 'reconnecting'}
                />
              </div>
              <div className="flex flex-col">
                <span className="flex items-center gap-1.5">
                  <span className="max-w-[120px] truncate font-semibold" style={{ color: 'var(--pk-text-hi)', fontSize: 13 }} title={viewerSeat.displayName ?? ''}>
                    {viewerSeat.displayName ?? t('seat.you')}
                  </span>
                  <span
                    className="rounded px-1 py-[1px] text-[9.5px] font-bold uppercase tracking-wide leading-none"
                    style={{ background: 'var(--pk-gold-line)', color: 'var(--pk-gold-soft)' }}
                    data-testid="poker-hero-you"
                  >
                    {t('seat.you')}
                  </span>
                </span>
                <span className="font-bold tabular-nums" style={{ color: 'var(--pk-gold-soft)', fontSize: 15 }} title={formatCoinsFull(viewerSeat.stack)} data-testid="poker-hero-stack">
                  {formatCoinsShort(viewerSeat.stack)}
                </span>
                {viewerSeat.committedThisStreet > 0 && (
                  <span className="tabular-nums" style={{ color: 'var(--pk-text-mid)', fontSize: 11 }}>
                    {t('action_bar.committed')}: {formatCoinsShort(viewerSeat.committedThisStreet)}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div aria-hidden />
          )}

          {/* the action area (grid col 2 — auto width, kept optically centred on the table by the
              equal 1fr side columns so a lone button doesn't drift toward the hero) */}
          <div className="flex min-w-0 items-center justify-center">
            {isMyTurn && legal?.model ? (
              <ActionControls
                model={legal.model}
                bigBlind={config.bigBlind}
                pending={pending}
                disabled={!canAct || protocolMismatch}
                errorCode={errorCode}
                onAct={onAct}
              />
            ) : (
              <BottomMessage
                t={t}
                connUx={connUx}
                isSpectator={isSpectator}
                seated={viewerSeatIndex !== null}
                sittingOut={viewerSittingOut}
                live={live}
                canDeal={canDeal}
                dealBusy={busy === 'deal'}
                dealError={errorCode}
                onDeal={doDeal}
                turnSeatName={
                  publicState?.turnSeat != null
                    ? seats.find((s) => s.seatIndex === publicState?.turnSeat)?.displayName ?? null
                    : null
                }
                phase={phase}
              />
            )}
          </div>

          {/* grid col 3 — balances the hero (equal 1fr) so col 2 stays centred; holds the quick-
              reaction trigger for a seated player (spectators cannot send). */}
          <div className="flex items-end justify-end">
            {viewerSeatIndex !== null && (
              <PokerReactionTrigger send={reactions.send} compact={compact} />
            )}
          </div>
        </div>
      </div>

      {/* ── Buy-in sheet ── */}
      {sitSeat !== null && (
        <BuyInSheet
          min={config.minBuyIn}
          max={config.maxBuyIn}
          bigBlind={config.bigBlind}
          onCancel={() => setSitSeat(null)}
          onConfirm={async (amount) => {
            setBusy('sit')
            try {
              const res = await sitDown(tableId, sitSeat, amount)
              if (res.ok) setSitSeat(null)
              else setErrorCode(res.error)
            } finally {
              setBusy(null)
            }
          }}
          busy={busy === 'sit'}
        />
      )}
    </div>
  )
}

// ── Small presentational helpers ─────────────────────────────────────────────────────────────

function IconPill({ children, onClick, title, active = false, ...rest }: { children: React.ReactNode; onClick?: () => void; title?: string; active?: boolean } & React.AriaAttributes) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex items-center justify-center"
      style={{
        width: 40,
        height: 40,
        borderRadius: 999,
        background: active ? 'rgba(201,161,74,0.22)' : 'rgba(0,0,0,0.55)',
        border: `1px solid ${active ? 'var(--pk-gold)' : 'var(--pk-gold-line)'}`,
        color: active ? 'var(--pk-gold-soft)' : 'var(--pk-text-hi)',
        fontSize: 17,
      }}
      {...rest}
    >
      {children}
    </button>
  )
}

function MenuItem({ label, onClick, tone = 'default', disabled = false }: { label: string; onClick?: () => void; tone?: 'default' | 'danger'; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-lg px-3 py-2 text-left text-[13px] font-semibold disabled:opacity-40"
      style={{ background: 'rgba(0,0,0,0.3)', color: tone === 'danger' ? 'var(--pk-pink-soft)' : 'var(--pk-text-hi)' }}
    >
      {label}
    </button>
  )
}

function EmptySeatPod({ seatIndex, label, sitLabel, canSit, onSit, compact }: { seatIndex: number; label: string; sitLabel: string; canSit: boolean; onSit: () => void; compact: boolean }) {
  if (canSit) {
    return (
      <button
        type="button"
        onClick={onSit}
        data-testid="poker-sit-here"
        data-seat-index={seatIndex}
        className="flex flex-col items-center justify-center rounded-xl font-semibold active:scale-[0.97]"
        style={{ width: compact ? 84 : 104, height: compact ? 74 : 92, border: '1px dashed var(--pk-gold)', background: 'rgba(0,0,0,0.35)', color: 'var(--pk-gold-soft)', fontSize: 13 }}
      >
        + {sitLabel}
      </button>
    )
  }
  return (
    <span
      className="flex items-center justify-center rounded-xl"
      style={{ width: compact ? 84 : 104, height: compact ? 74 : 92, border: '1px dashed var(--pk-gold-line)', background: 'rgba(0,0,0,0.25)', color: 'var(--pk-text-low)', fontSize: 12 }}
    >
      {label}
    </span>
  )
}

function BottomMessage({
  t,
  connUx,
  isSpectator,
  seated,
  sittingOut,
  live,
  canDeal,
  dealBusy,
  dealError,
  onDeal,
  turnSeatName,
  phase,
}: {
  t: ReturnType<typeof useTranslations>
  connUx: string
  isSpectator: boolean
  seated: boolean
  sittingOut: boolean
  live: boolean
  canDeal: boolean
  dealBusy: boolean
  dealError: string | null
  onDeal: () => void
  turnSeatName: string | null
  phase: string
}) {
  if (connUx === 'connecting') return <InlineGameMessage tone="info">{t('conn.connecting')}</InlineGameMessage>
  if (connUx === 'offline') return <InlineGameMessage tone="danger">{t('conn.offline')}</InlineGameMessage>
  if (connUx === 'reconnecting') return <InlineGameMessage tone="warning">{t('conn.reconnecting')}</InlineGameMessage>
  if (canDeal) {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <ActionButton variant="call" label={dealBusy ? t('message.dealing') : t('message.deal_next')} onClick={onDeal} disabled={dealBusy} testId="poker-deal" />
        {dealError && (
          <InlineGameMessage tone="danger">
            {t.has(`error.${dealError}`) ? t(`error.${dealError}`) : t('error.generic')}
          </InlineGameMessage>
        )}
      </div>
    )
  }
  if (live && turnSeatName) {
    return <InlineGameMessage tone="info">{t('message.waiting_for', { name: turnSeatName })}</InlineGameMessage>
  }
  if (phase === 'PAUSED_FOR_REVIEW') return <InlineGameMessage tone="warning">{t('message.paused')}</InlineGameMessage>
  if (isSpectator) return <InlineGameMessage tone="info">{t('message.spectating')}</InlineGameMessage>
  if (sittingOut) return <InlineGameMessage tone="warning">{t('seat.sitting_out')}</InlineGameMessage>
  if (seated && !live) return <InlineGameMessage tone="info">{t('message.waiting')}</InlineGameMessage>
  return <InlineGameMessage tone="info">{t('message.waiting')}</InlineGameMessage>
}

function BuyInSheet({ min, max, bigBlind, onCancel, onConfirm, busy }: { min: number; max: number; bigBlind: number; onCancel: () => void; onConfirm: (amount: number) => void; busy: boolean }) {
  const t = useTranslations('games.poker')
  const step = Math.max(1, bigBlind)
  const [amount, setAmount] = useState<number>(max)
  const clamp = (v: number) => Math.max(min, Math.min(max, Math.round(v)))
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-5" style={{ background: 'rgba(0,0,0,0.6)' }} data-testid="poker-buyin">
      <div
        className="flex w-full max-w-[420px] flex-col gap-3 rounded-2xl p-4"
        style={{ background: 'linear-gradient(180deg,#1a1620,#0e0c12)', border: '1px solid var(--pk-gold)', boxShadow: 'var(--pk-shadow-raised)' }}
      >
        <h3 className="font-serif" style={{ color: 'var(--pk-gold-soft)', fontSize: 18 }}>
          {t('buy_in.title')}
        </h3>
        <div className="flex items-center justify-between text-[12px]" style={{ color: 'var(--pk-text-low)' }}>
          <span>{t('buy_in.min')}: <span className="tabular-nums" style={{ color: 'var(--pk-text-mid)' }}>{formatCoinsShort(min)}</span></span>
          <span>{t('buy_in.max')}: <span className="tabular-nums" style={{ color: 'var(--pk-text-mid)' }}>{formatCoinsShort(max)}</span></span>
        </div>
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={amount}
          onChange={(e) => setAmount(clamp(Number(e.target.value)))}
          className="w-full bg-transparent text-center font-extrabold tabular-nums outline-none"
          style={{ color: 'var(--pk-gold-soft)', fontSize: 26 }}
          aria-label={t('buy_in.title')}
          data-testid="poker-buyin-amount"
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={amount}
          onChange={(e) => setAmount(clamp(Number(e.target.value)))}
          className="pk-bet-slider w-full"
          aria-label={t('buy_in.title')}
          style={{ background: `linear-gradient(90deg, var(--pk-gold) 0%, var(--pk-gold) ${((amount - min) / Math.max(1, max - min)) * 100}%, rgba(255,255,255,0.14) ${((amount - min) / Math.max(1, max - min)) * 100}%, rgba(255,255,255,0.14) 100%)` }}
        />
        <div className="flex items-center gap-2">
          <ActionButton variant="neutral" label={t('bet.cancel')} onClick={onCancel} disabled={busy} className="flex-1" testId="poker-buyin-cancel" />
          <ActionButton variant="call" label={busy ? t('buy_in.sitting') : t('buy_in.sit')} sublabel={formatCoinsShort(amount)} onClick={() => onConfirm(amount)} disabled={busy} className="flex-[2]" testId="poker-buyin-confirm" />
        </div>
      </div>
    </div>
  )
}
