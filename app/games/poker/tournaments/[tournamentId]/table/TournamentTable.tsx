'use client'

// ── TournamentTable — internal-alpha tournament LIVE gameplay surface ─────────────────────────
//
// Presentation orchestrator over the viewer-safe snapshot from useTournamentTable. It NEVER decides
// cards, winners, pots, legal actions, turn order, stacks or settlement — every fact is read from
// the server-assembled view. The browser only sends minimal intent through `act` (re-validated
// server-side via the expected action-seq CAS). Opponent seats always render FACE-DOWN; the only
// exposed hole cards are the viewer's own (carried in view.seats[self].cards).
//
// Distinct from cash poker + practice-with-bots: this reads tournament CHIP stacks + blind LEVELS
// (no buy-in / cash-out), shows the blind level + hand #, and surfaces eliminated / champion /
// completed states.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import '../../../_design/poker-theme.css'
import { useViewportClass, type PokerLayout } from '../../../_design/useViewportClass'
import { tableGeometry, visualPosition, type PokerTableLayout } from '@/lib/games/poker/seatLayout'
import { formatCoinsShort, formatCoinsFull } from '@/lib/game/economy'
import type { PokerActionType } from '@/lib/games/poker/types'
import {
  PlayerSeat,
  SeatPocketCards,
  CommunityCardSlot,
  PokerCard,
  PotDisplay,
  StreetIndicator,
  ConnectionIndicator,
  WinnerHighlight,
  InlineGameMessage,
  RotateDeviceOverlay,
  TableBackground,
  type PokerSeatView,
  type StreetName,
} from '../../../_components'
import { ActionControls } from '../../../_components/ActionControls'
import { useTournamentTable } from './useTournamentTable'

export interface TournamentTableProps {
  readonly tournamentId: string
  readonly capacity: number
}

function geomLayout(layout: PokerLayout): PokerTableLayout {
  return layout === 'portrait' ? 'mobile' : layout
}

export default function TournamentTable({ tournamentId, capacity }: TournamentTableProps) {
  const t = useTranslations('games.poker')
  const tt = useTranslations('games.poker.tournaments')
  const vp = useViewportClass()
  const rootRef = useRef<HTMLDivElement>(null)
  const { view, connUx, act } = useTournamentTable(tournamentId)

  const [pending, setPending] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)

  const onAct = useCallback(async (action: PokerActionType, amount?: number) => {
    if (pending) return
    setPending(true)
    setErrorCode(null)
    try {
      const res = await act(action, amount)
      if (!res.ok) setErrorCode(res.error ?? 'generic')
    } finally {
      setPending(false)
    }
  }, [pending, act])

  // A fresh decision point clears a stale rejection.
  const actionSeq = view?.actionSeq ?? 0
  useEffect(() => { setErrorCode(null) }, [actionSeq])

  const geom = tableGeometry(capacity, geomLayout(vp.layout))
  const seats = useMemo(() => view?.seats ?? [], [view?.seats])
  const board = view?.board ?? []
  const live = !!view?.handId && !view?.complete
  const street = (view?.street ?? 'PREFLOP') as StreetName
  const viewerSeatIndex = view?.viewerSeatIndex ?? null
  const compact = geom.compactSeats
  const pState = view?.participantState

  // Winner detection from the completed hand: highest live stack among non-folded seats (the server
  // already credited the pot — this only labels the seat for the banner, never decides the winner).
  const winnerSeat = useMemo(() => {
    if (!view?.complete) return null
    const contenders = seats.filter((s) => s.inHand && !s.folded)
    if (contenders.length === 0) return null
    return contenders.reduce((a, b) => (b.stack > a.stack ? b : a)).seatIndex
  }, [view?.complete, seats])

  const toSeatView = useCallback((sIdx: number): PokerSeatView | null => {
    const s = seats.find((x) => x.seatIndex === sIdx)
    if (!s || !s.userId) return null
    return {
      seatIndex: s.seatIndex,
      status: s.seatState === 'busted' ? 'busted' : 'sitting_in',
      displayName: s.displayName,
      avatarUrl: s.avatarUrl,
      stack: s.stack,
      // Once the hand is complete the pot has been awarded — per-seat bet chips are already swept,
      // so hide them (otherwise a stale chip overlaps the centre winner banner / pot display).
      committedThisStreet: view?.complete ? 0 : s.committedTotal,
      lastAction: s.folded ? 'fold' : null,
      allIn: s.allIn,
      folded: s.folded,
      connected: true,
      isButton: s.isButton,
      isSmallBlind: s.isSmallBlind,
      isBigBlind: s.isBigBlind,
      isCurrentActor: s.isTurn,
      isWinner: winnerSeat === s.seatIndex,
      // Opponent cards are NEVER present in the view; own cards come from s.cards. Face-down backs
      // are drawn by SeatPocketCards when cards==null && inHand.
      cards: s.isSelf ? s.cards : null,
      inHand: s.inHand,
      isSelf: s.isSelf,
    }
  }, [seats, winnerSeat, view?.complete])

  const ownCards = viewerSeatIndex !== null ? seats.find((s) => s.seatIndex === viewerSeatIndex)?.cards ?? null : null
  const viewerSeat = viewerSeatIndex !== null ? seats.find((s) => s.seatIndex === viewerSeatIndex) ?? null : null
  const isMyTurn = !!view?.isMyTurn && !!view?.legal
  const grandTotal = view?.pot ?? 0

  const ringSeatIndexes = Array.from({ length: capacity }, (_, i) => i).filter(
    (i) => viewerSeatIndex === null || i !== viewerSeatIndex,
  )

  const levelLabel = view
    ? `${formatCoinsShort(view.meta.smallBlind)}/${formatCoinsShort(view.meta.bigBlind)}`
    : '—'

  // ── Terminal participant states get a full-surface message (no live table) ──
  const terminal = pState === 'eliminated' || pState === 'champion' || view?.meta.state === 'COMPLETED'

  return (
    <div
      ref={rootRef}
      className="poker-root fixed inset-0 z-[110] overflow-hidden"
      style={{ background: 'var(--pk-bg-void)' }}
      data-testid="tnmt-table"
      data-tournament-id={tournamentId}
      data-hand-no={view?.handNo ?? 0}
      data-version={view?.version ?? 0}
      data-street={view?.street ?? ''}
      data-turn-seat={view?.turnSeat ?? ''}
      data-viewer-seat={viewerSeatIndex ?? ''}
      data-pot={grandTotal}
      data-live={live ? '1' : '0'}
      data-complete={view?.complete ? '1' : '0'}
      data-participant-state={pState ?? ''}
    >
      {vp.isPortrait && <RotateDeviceOverlay deadlineMs={null} leaveLabel={t('hud.leave')} />}

      {/* ── Top-left HUD: tournament identity + level + connection ── */}
      <div className="absolute z-30 flex flex-col gap-1.5" style={{ top: 'calc(var(--pk-safe-top) + 8px)', left: 'calc(var(--pk-safe-left) + 10px)' }}>
        <div className="flex items-center gap-2 rounded-full px-3 py-1.5" style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid var(--pk-gold-line)' }}>
          <span className="max-w-[36vw] truncate font-serif" style={{ color: 'var(--pk-gold-soft)', fontSize: 14 }} title={view?.meta.title}>
            {view?.meta.title ?? tt('title')}
          </span>
          <span className="tabular-nums" style={{ color: 'var(--pk-text-mid)', fontSize: 12 }} data-testid="tnmt-level">
            {tt('field.level', { n: (view?.meta.levelIndex ?? 0) + 1 })} · {levelLabel}
          </span>
          {(view?.handNo ?? 0) > 0 && (
            <span className="tabular-nums" style={{ color: 'var(--pk-text-low)', fontSize: 11.5 }}>#{view?.handNo}</span>
          )}
        </div>
        <ConnectionIndicator status={connUx} variant="banner" />
      </div>

      {/* ── Top-right: back to detail ── */}
      <div className="absolute z-30" style={{ top: 'calc(var(--pk-safe-top) + 8px)', right: 'calc(var(--pk-safe-right) + 10px)' }}>
        <a
          href={`/games/poker/tournaments/${tournamentId}`}
          className="inline-flex items-center justify-center rounded-full px-3 py-1.5 text-[13px] font-semibold"
          style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid var(--pk-gold-line)', color: 'var(--pk-text-hi)' }}
        >
          {tt('back')}
        </a>
      </div>

      {/* ── Felt ── */}
      <TableBackground layout={geomLayout(vp.layout)}>
        <div className="absolute" style={{ inset: 0 }}>
          {/* Centre: board + pot + street (or winner banner / terminal message). z-[3] keeps the
              winner banner / pot above the ring seats' bet chips (z-[2]) so nothing overlaps it. */}
          <div className="absolute z-[3] flex flex-col items-center gap-2" style={{ left: `${geom.center.xPct}%`, top: `${geom.center.yPct}%`, transform: 'translate(-50%,-50%)' }}>
            {terminal ? (
              <div className="rounded-2xl px-6 py-4 text-center" style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid var(--pk-gold)' }} role="status" aria-live="polite" data-testid="tnmt-terminal">
                {pState === 'champion' ? (
                  <p className="text-xl font-semibold" style={{ color: 'var(--pk-gold-soft)' }}>{tt('participant.champion')}</p>
                ) : pState === 'eliminated' ? (
                  <p className="text-lg font-medium" style={{ color: 'var(--pk-text-hi)' }}>{tt('participant.eliminated', { place: 0 })}</p>
                ) : (
                  <p className="text-lg font-medium" style={{ color: 'var(--pk-text-hi)' }}>{tt('state.COMPLETED')}</p>
                )}
                <a href={`/games/poker/tournaments/${tournamentId}`} className="mt-2 inline-block text-sm underline" style={{ color: 'var(--pk-gold-soft)' }}>
                  {tt('field.standings')}
                </a>
              </div>
            ) : view?.complete && winnerSeat !== null ? (
              <WinnerHighlight winnerName={seats.find((s) => s.seatIndex === winnerSeat)?.displayName ?? t('seat.winner')} />
            ) : (
              <div className="flex items-center gap-1.5" data-testid="tnmt-board" data-count={board.length}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <CommunityCardSlot key={i} card={board[i] ?? null} w={geom.boardCardW} />
                ))}
              </div>
            )}
            {grandTotal > 0 && (
              <div data-testid="tnmt-pot" data-amount={grandTotal}>
                <PotDisplay pots={{ main: { amount: grandTotal, eligibleSeatIndexes: [] }, sides: [] }} compact={compact} />
              </div>
            )}
            {live && (
              <div data-testid="tnmt-street" data-street={street}>
                <StreetIndicator street={street} compact={compact} />
              </div>
            )}
          </div>

          {/* Ring seats */}
          {ringSeatIndexes.map((seatIndex) => {
            const pos = visualPosition(seatIndex, viewerSeatIndex, capacity)
            const anchor = geom.seats[pos]
            const pocket = geom.pockets[pos]
            const sv = toSeatView(seatIndex)
            return (
              <div key={seatIndex}>
                {sv && (
                  <div className="absolute z-[1]" style={{ left: `${pocket.xPct}%`, top: `${pocket.yPct}%`, transform: 'translate(-50%,-50%)' }} data-testid="tnmt-seat-cards" data-seat-index={seatIndex}>
                    <SeatPocketCards cards={sv.cards ?? null} inHand={!!sv.inHand} folded={!!sv.folded} isWinner={!!sv.isWinner} w={geom.pocketCardW} />
                  </div>
                )}
                <div
                  className="absolute z-[2]"
                  style={{ left: `${anchor.xPct}%`, top: `${anchor.yPct}%`, transform: 'translate(-50%,-50%)' }}
                  data-testid="tnmt-seat"
                  data-seat-index={seatIndex}
                  data-occupied={sv ? '1' : '0'}
                  data-stack={sv ? sv.stack : ''}
                  data-turn={sv?.isCurrentActor ? '1' : '0'}
                  data-folded={sv?.folded ? '1' : '0'}
                >
                  {sv ? (
                    <PlayerSeat seat={sv} avatarSize={geom.seatAvatarSize} compact={compact} lowStackThreshold={(view?.meta.bigBlind ?? 1) * 5} hideCards />
                  ) : (
                    <span className="flex items-center justify-center rounded-xl" style={{ width: compact ? 84 : 104, height: compact ? 74 : 92, border: '1px dashed var(--pk-gold-line)', background: 'rgba(0,0,0,0.25)', color: 'var(--pk-text-low)', fontSize: 12 }}>
                      {t('seat.empty')}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </TableBackground>

      {/* ── Bottom hero band: own cards + stack + action bar ── */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 px-3 pt-2" style={{ paddingBottom: 'calc(var(--pk-safe-bottom) + 8px)' }}>
        <div
          className="grid w-full max-w-[860px] items-end gap-3 rounded-2xl px-3 py-2.5"
          style={{ gridTemplateColumns: '1fr auto 1fr', background: 'linear-gradient(180deg, rgba(22,19,27,0.92), rgba(7,6,10,0.96))', border: '1px solid var(--pk-gold-line)', boxShadow: 'var(--pk-shadow-panel)' }}
        >
          {/* hero identity + own cards */}
          {viewerSeat ? (
            <div className="flex shrink-0 items-end gap-2" data-testid="tnmt-hero" data-seat-index={viewerSeatIndex ?? ''} data-stack={viewerSeat.stack}>
              {ownCards && (
                <div className="flex items-end gap-1" data-testid="tnmt-hero-cards" data-count={2}>
                  <PokerCard card={ownCards[0]} w={compact ? 40 : 52} highlight={winnerSeat === viewerSeatIndex} />
                  <PokerCard card={ownCards[1]} w={compact ? 40 : 52} highlight={winnerSeat === viewerSeatIndex} />
                </div>
              )}
              <div className="flex flex-col">
                <span className="max-w-[120px] truncate font-semibold" style={{ color: 'var(--pk-text-hi)', fontSize: 13 }} title={viewerSeat.displayName ?? ''}>
                  {viewerSeat.displayName ?? t('seat.you')}
                </span>
                <span className="font-bold tabular-nums" style={{ color: 'var(--pk-gold-soft)', fontSize: 15 }} title={formatCoinsFull(viewerSeat.stack)} data-testid="tnmt-hero-stack">
                  {formatCoinsShort(viewerSeat.stack)}
                </span>
              </div>
            </div>
          ) : (
            <div aria-hidden />
          )}

          {/* action area */}
          <div className="flex min-w-0 items-center justify-center" aria-live="polite">
            {isMyTurn && view?.legal ? (
              <ActionControls
                model={view.legal}
                bigBlind={view.meta.bigBlind}
                pending={pending}
                disabled={connUx === 'offline' || connUx === 'reconnecting'}
                errorCode={errorCode}
                onAct={onAct}
              />
            ) : (
              <TableStatus
                t={t}
                tt={tt}
                connUx={connUx}
                seated={viewerSeatIndex !== null}
                live={live}
                complete={!!view?.complete}
                turnName={view?.turnSeat != null ? seats.find((s) => s.seatIndex === view?.turnSeat)?.displayName ?? null : null}
                pState={pState}
              />
            )}
          </div>
          <div aria-hidden />
        </div>
      </div>
    </div>
  )
}

function TableStatus({
  t, tt, connUx, seated, live, complete, turnName, pState,
}: {
  t: ReturnType<typeof useTranslations>
  tt: ReturnType<typeof useTranslations>
  connUx: string
  seated: boolean
  live: boolean
  complete: boolean
  turnName: string | null
  pState?: string
}) {
  if (connUx === 'connecting') return <InlineGameMessage tone="info">{t('conn.connecting')}</InlineGameMessage>
  if (connUx === 'offline') return <InlineGameMessage tone="danger">{t('conn.offline')}</InlineGameMessage>
  if (connUx === 'reconnecting') return <InlineGameMessage tone="warning">{t('conn.reconnecting')}</InlineGameMessage>
  if (!seated && pState === 'waiting') return <InlineGameMessage tone="info">{tt('participant.waiting')}</InlineGameMessage>
  if (complete) return <InlineGameMessage tone="info">{tt('table.hand_complete')}</InlineGameMessage>
  if (live && turnName) return <InlineGameMessage tone="info">{t('message.waiting_for', { name: turnName })}</InlineGameMessage>
  return <InlineGameMessage tone="info">{tt('table.waiting_next')}</InlineGameMessage>
}
