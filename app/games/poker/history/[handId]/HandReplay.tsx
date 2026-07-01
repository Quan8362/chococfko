'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { HandDetail, HandActionEntry, ReplayStreet } from '../../ecosystem'
import { CardChip, HiddenCard } from '../../_eco/CardChip'
import PlayerActions from '../../_eco/PlayerActions'
import { coins, signedCoins, dateTime } from '../../_eco/format'

function boardCountFor(street: ReplayStreet, boardLen: number): number {
  switch (street) {
    case 'PREFLOP':
      return 0
    case 'FLOP':
      return Math.min(3, boardLen)
    case 'TURN':
      return Math.min(4, boardLen)
    default:
      return boardLen
  }
}

function sum(m: Map<number, number>): number {
  let s = 0
  for (const v of Array.from(m.values())) s += v
  return s
}

interface Step {
  street: ReplayStreet
  boardN: number
  pot: number
  actionIndex: number // -1 = start, actions.length = end
}

export default function HandReplay({ detail }: { detail: HandDetail }) {
  const t = useTranslations('games.poker')
  const locale = useLocale()

  const totalPot = useMemo(
    () => detail.pots.main.amount + detail.pots.sides.reduce((a, s) => a + s.amount, 0),
    [detail.pots],
  )

  // Reconstruct the running pot from the authoritative ordered action log (incl. blinds).
  const steps = useMemo<Step[]>(() => {
    const out: Step[] = [{ street: 'PREFLOP', boardN: 0, pot: 0, actionIndex: -1 }]
    let completed = 0
    const streetCommit = new Map<number, number>()
    let cur: ReplayStreet = 'PREFLOP'
    detail.actions.forEach((a, i) => {
      if (a.street !== cur) {
        completed += sum(streetCommit)
        streetCommit.clear()
        cur = a.street
      }
      applyCommit(streetCommit, a)
      out.push({ street: a.street, boardN: boardCountFor(a.street, detail.board.length), pot: completed + sum(streetCommit), actionIndex: i })
    })
    out.push({ street: 'SHOWDOWN', boardN: detail.board.length, pot: totalPot, actionIndex: detail.actions.length })
    return out
  }, [detail, totalPot])

  const [idx, setIdx] = useState(steps.length - 1) // open on the final state
  const [playing, setPlaying] = useState(false)
  const step = steps[idx]

  useEffect(() => {
    if (!playing) return
    if (idx >= steps.length - 1) {
      setPlaying(false)
      return
    }
    const id = setTimeout(() => setIdx((i) => Math.min(steps.length - 1, i + 1)), 1100)
    return () => clearTimeout(id)
  }, [playing, idx, steps.length])

  const visibleBoard = detail.board.slice(0, step.boardN)
  const seatName = (seat: number, name: string | null, isViewer: boolean) =>
    isViewer ? t('hand.you') : name ?? t('hand.seat', { n: seat })

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-serif text-2xl font-bold">{t('hand.title', { n: detail.handNo })}</h1>
        {detail.completedAt && <span className="text-sm text-muted">{dateTime(detail.completedAt, locale)}</span>}
      </div>
      <p className="mb-5 text-sm text-muted">
        {detail.tableName} · {coins(detail.smallBlind, locale)}/{coins(detail.bigBlind, locale)}
      </p>

      {/* Replay stage */}
      <section className="rounded-2xl border border-line bg-gradient-to-br from-[#1b1230] to-[#2a1a3e] p-6 text-white">
        <div className="flex items-center justify-between text-sm text-white/70">
          <span>{t(`street.${step.street.toLowerCase()}`)}</span>
          <span>
            {t('replay.pot')}: <span className="font-semibold text-white">{coins(step.pot, locale)}</span>
          </span>
        </div>

        <div className="my-5 flex min-h-[3.5rem] flex-wrap items-center justify-center gap-2">
          {visibleBoard.length === 0 ? (
            <span className="text-sm text-white/40">{t('hand.no_board')}</span>
          ) : (
            visibleBoard.map((c, i) => <CardChip key={i} card={c} />)
          )}
        </div>

        <p className="text-center text-sm text-white/80">
          {step.actionIndex === -1
            ? t('replay.start')
            : step.actionIndex >= detail.actions.length
              ? t('replay.end')
              : describeAction(detail.actions[step.actionIndex], t, locale, seatName, detail)}
        </p>

        {/* Controls */}
        <div className="mt-5 flex items-center justify-center gap-2">
          <Ctrl onClick={() => { setPlaying(false); setIdx(0) }} label={t('replay.restart')}>⏮</Ctrl>
          <Ctrl onClick={() => { setPlaying(false); setIdx((i) => Math.max(0, i - 1)) }} label={t('replay.prev')}>◀</Ctrl>
          <button
            onClick={() => setPlaying((p) => !p)}
            className="rounded-lg bg-rose px-5 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {playing ? t('replay.pause') : t('replay.play')}
          </button>
          <Ctrl onClick={() => { setPlaying(false); setIdx((i) => Math.min(steps.length - 1, i + 1)) }} label={t('replay.next')}>▶</Ctrl>
        </div>
        <input
          type="range"
          min={0}
          max={steps.length - 1}
          value={idx}
          onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)) }}
          className="mt-4 w-full accent-rose"
          aria-label={t('replay.title')}
        />
        <p className="mt-1 text-center text-xs text-white/50">
          {t('replay.step', { i: idx + 1, n: steps.length })} · {t('replay.read_only')}
        </p>
      </section>

      {/* Players */}
      <section className="mt-6">
        <h2 className="mb-3 font-serif text-lg font-semibold">{t('hand.players')}</h2>
        <ul className="space-y-2">
          {detail.players.map((p) => (
            <li key={p.seatIndex} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper p-3">
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {p.revealedCards ? (
                    p.revealedCards.map((c, i) => <CardChip key={i} card={c} size="sm" />)
                  ) : (
                    <>
                      <HiddenCard size="sm" />
                      <HiddenCard size="sm" />
                    </>
                  )}
                </div>
                <div>
                  <p className="font-medium">
                    {seatName(p.seatIndex, p.displayName, p.isViewer)}
                    {p.folded && <span className="ml-2 text-xs text-muted">{t('hand.folded')}</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {t('hand.contributions')}: {coins(p.contributed, locale)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-right">
                <div>
                  <p className={`font-medium tabular-nums ${p.net > 0 ? 'text-emerald-600' : p.net < 0 ? 'text-rose' : 'text-muted'}`}>
                    {signedCoins(p.net, locale)}
                  </p>
                  {p.payout > 0 && <p className="text-xs text-emerald-600">{t('hand.won_amount', { amount: coins(p.payout, locale) })}</p>}
                </div>
                {!p.isViewer && p.userId && (
                  <PlayerActions userId={p.userId} displayName={p.displayName} tableId={detail.tableId} />
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">{t('hand.no_hole_cards')}</p>
      </section>

      {/* Settlement */}
      <section className="mt-6">
        <h2 className="mb-3 font-serif text-lg font-semibold">{t('hand.settlement')}</h2>
        <div className="rounded-xl border border-line bg-paper p-4 text-sm">
          <div className="flex justify-between border-b border-line/60 pb-2">
            <span>{t('hand.main_pot')}</span>
            <span className="tabular-nums">{coins(detail.pots.main.amount, locale)}</span>
          </div>
          {detail.pots.sides.map((s, i) => (
            <div key={i} className="flex justify-between border-b border-line/60 py-2">
              <span>{t('hand.side_pot', { n: i + 1 })}</span>
              <span className="tabular-nums">{coins(s.amount, locale)}</span>
            </div>
          ))}
          <div className="mt-2">
            <span className="text-muted">{t('hand.winners')}: </span>
            {detail.players.filter((p) => p.payout > 0).map((p, i, arr) => (
              <span key={p.seatIndex}>
                {seatName(p.seatIndex, p.displayName, p.isViewer)} ({coins(p.payout, locale)}){i < arr.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function applyCommit(streetCommit: Map<number, number>, a: HandActionEntry) {
  switch (a.type) {
    case 'bet':
    case 'raise':
    case 'all_in':
    case 'post_sb':
    case 'post_bb':
      if (a.amount != null) streetCommit.set(a.seatIndex, a.amount)
      break
    case 'call': {
      const max = Math.max(0, ...Array.from(streetCommit.values()))
      streetCommit.set(a.seatIndex, max)
      break
    }
    default:
      break
  }
}

function actionTypeLabel(type: HandActionEntry['type'], t: (k: string) => string): string {
  switch (type) {
    case 'fold':
    case 'timeout_fold':
      return t('action.fold')
    case 'check':
    case 'timeout_check':
      return t('action.check')
    case 'call':
      return t('action.call')
    case 'bet':
      return t('action.bet')
    case 'raise':
      return t('action.raise')
    case 'all_in':
      return t('action.all_in')
    case 'post_sb':
      return t('marker.small_blind')
    case 'post_bb':
      return t('marker.big_blind')
    default:
      return type
  }
}

function describeAction(
  a: HandActionEntry,
  t: (k: string, v?: Record<string, string | number>) => string,
  locale: string,
  seatName: (seat: number, name: string | null, isViewer: boolean) => string,
  detail: HandDetail,
): string {
  const player = detail.players.find((p) => p.seatIndex === a.seatIndex)
  const who = seatName(a.seatIndex, player?.displayName ?? null, player?.isViewer ?? false)
  const label = actionTypeLabel(a.type, t)
  return a.amount != null && ['bet', 'raise', 'all_in', 'post_sb', 'post_bb'].includes(a.type)
    ? `${who} · ${label} ${coins(a.amount, locale)}`
    : `${who} · ${label}`
}

function Ctrl({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} className="rounded-lg bg-white/10 px-3 py-2 text-sm hover:bg-white/20">
      {children}
    </button>
  )
}
