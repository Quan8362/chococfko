'use client'

// Practice-bot table client. The browser sends INTENT only — it renders the server-authoritative
// view and calls the 'use server' actions; it NEVER decides cards, legality, sizing bounds, winners,
// pots, or bot actions. Every control is rendered STRICTLY from the authoritative `view.legal`
// model, and the showdown result is the canonical engine output (view.result). This ships dark.

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  createPracticeTable,
  fetchPracticeState,
  practiceAct,
  practiceStartNextHand,
  type PracticeResult,
} from '../practice-actions'
import type { PracticeClientView } from '@/lib/games/poker/practice'
import type { AppliedAction } from '@/lib/games/poker/betting'

type Difficulty = 'easy' | 'normal' | 'hard'

export default function PracticeClient() {
  const t = useTranslations('games.poker.practice')
  const [gameId, setGameId] = useState<string | null>(null)
  const [view, setView] = useState<PracticeClientView | null>(null)
  const [difficulty, setDifficulty] = useState<Difficulty>('easy')
  const [seatCount, setSeatCount] = useState<number>(2)
  const [busy, setBusy] = useState(false)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [raiseTo, setRaiseTo] = useState<number>(0)

  // Guard against setState after unmount and against overlapping submissions (double-click / a
  // second action landing while the first is still in flight).
  const mounted = useRef(true)
  const inFlight = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  // Map a raw server/engine error CODE to a localized user-facing message. The raw code is kept in
  // state (and logged) for debugging/tests; the primary message the user sees is localized.
  function errorMessage(code: string): string {
    return t.has(`errors.${code}` as 'errors.generic') ? t(`errors.${code}` as 'errors.generic') : t('errors.generic')
  }

  function apply<T extends { view: PracticeClientView }>(r: PracticeResult<T>): void {
    if (!mounted.current) return
    if (r.ok) {
      setView(r.view)
      setErrorCode(null)
    } else {
      setErrorCode(r.error)
      // Preserve the internal code for logging while the user sees the localized message.
      if (typeof console !== 'undefined') console.warn('[practice] action rejected:', r.error)
    }
  }

  async function start(): Promise<void> {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setErrorCode(null)
    try {
      const r = await createPracticeTable({ seatCount, difficulty })
      if (r.ok) {
        if (mounted.current) setGameId(r.gameId)
        apply(await fetchPracticeState(r.gameId))
      } else {
        apply(r)
      }
    } finally {
      inFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }

  async function act(action: AppliedAction): Promise<void> {
    if (!gameId || !view || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      apply(await practiceAct(gameId, action, view.actionSeq))
    } finally {
      inFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }

  async function nextHand(): Promise<void> {
    if (!gameId || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      apply(await practiceStartNextHand(gameId))
    } finally {
      inFlight.current = false
      if (mounted.current) setBusy(false)
    }
  }

  const legal = view?.legal ?? null
  const isMyTurn = !!(view && legal && view.phase === 'BETTING')

  // Aggression (bet/raise) sizing bounds come STRICTLY from the authoritative legal model.
  const canBet = !!legal?.allowed.includes('bet')
  const canRaise = !!legal?.allowed.includes('raise')
  const aggressive = canBet || canRaise
  const sizeMin = legal ? (canBet ? legal.minOpeningBet : legal.minRaiseTo) : 0
  const sizeMax = legal ? legal.maxRaiseTo : 0

  // Reset the sizing input to the authoritative minimum whenever a fresh legal turn arrives.
  useEffect(() => {
    if (aggressive) setRaiseTo(sizeMin)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.actionSeq, aggressive, sizeMin])

  const clampedTo = Math.max(sizeMin, Math.min(sizeMax, Math.floor(Number.isFinite(raiseTo) ? raiseTo : sizeMin)))

  function seatName(seatIndex: number): string {
    const s = view?.seats.find((x) => x.seatIndex === seatIndex)
    if (!s) return `#${seatIndex}`
    return s.isBot ? s.displayName : t('you')
  }

  function seatTag(seatIndex: number): string {
    if (!view) return ''
    const tags: string[] = []
    if (view.buttonSeat === seatIndex) tags.push(t('dealer_short'))
    if (view.sbSeat === seatIndex) tags.push(t('sb_short'))
    if (view.bbSeat === seatIndex) tags.push(t('bb_short'))
    return tags.join(' ')
  }

  const result = view?.phase === 'COMPLETED' ? view.result : null
  const revealBySeat = new Map((result?.reveal ?? []).map((r) => [r.seatIndex, r]))
  const awardBySeat = new Map((result?.awards ?? []).map((a) => [a.seatIndex, a.amount]))

  return (
    <section className="rounded-2xl border border-line bg-paper p-5">
      {!view && (
        <div className="flex flex-col gap-4">
          <label className="text-sm font-semibold text-ink">
            {t('difficulty')}
            <select
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value as Difficulty)}
              className="ml-2 rounded-lg border border-line bg-cream px-2 py-1 text-sm"
            >
              <option value="easy">{t('difficulty_easy')}</option>
              <option value="normal">{t('difficulty_normal')}</option>
              <option value="hard">{t('difficulty_hard')}</option>
            </select>
          </label>
          <label className="text-sm font-semibold text-ink">
            {t('table_size')}
            <select
              value={seatCount}
              onChange={(e) => setSeatCount(Number(e.target.value))}
              className="ml-2 rounded-lg border border-line bg-cream px-2 py-1 text-sm"
            >
              <option value={2}>{t('heads_up')}</option>
              {[3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>{t('seats_option', { n })}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            data-testid="practice-start"
            onClick={start}
            disabled={busy}
            className="w-fit rounded-full bg-rose px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {t('start')}
          </button>
        </div>
      )}

      {view && (
        <div className="flex flex-col gap-4">
          <div className="text-xs text-muted">
            {t('badge_practice')} · {t('badge_no_reward')} · #<span data-testid="practice-handno">{view.handNo}</span>
            {view.street ? ` · ${t.has(`street.${view.street}` as 'street.PREFLOP') ? t(`street.${view.street}` as 'street.PREFLOP') : view.street}` : ''}
          </div>

          {/* Public betting context — pot, bet level, and the amount owed by the viewer. */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-cream px-3 py-2 text-sm">
            <span className="font-semibold text-ink" data-testid="practice-pot">{t('pot')}: <span className="font-mono">{view.pot}</span></span>
            {view.currentBet > 0 && <span className="text-muted">{t('current_bet')}: <span className="font-mono">{view.currentBet}</span></span>}
            {legal && legal.callAmount > 0 && <span className="text-muted">{t('to_call')}: <span className="font-mono">{legal.callAmount}</span></span>}
            {view.turnSeat !== null && view.phase === 'BETTING' && (
              <span className="text-muted">{t('to_act')}: <span className="font-semibold text-ink">{seatName(view.turnSeat)}</span></span>
            )}
          </div>

          {/* Community board. */}
          {view.board.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {view.board.map((c) => (
                <span key={c} className="rounded-md border border-line bg-cream px-2 py-1 font-mono text-sm">{c}</span>
              ))}
            </div>
          )}

          {/* Seats — stack, this-street contribution, position tags, and (at showdown) revealed cards. */}
          <ul className="flex flex-col gap-1">
            {view.seats.map((s) => {
              const rev = revealBySeat.get(s.seatIndex)
              const award = awardBySeat.get(s.seatIndex)
              const isWinner = !!result?.winners.includes(s.seatIndex)
              return (
                <li
                  key={s.seatIndex}
                  data-testid={`seat-${s.seatIndex}`}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${s.seatIndex === view.turnSeat && view.phase === 'BETTING' ? 'bg-rose/10 font-semibold' : isWinner ? 'bg-emerald-500/10' : 'bg-cream'}`}
                >
                  <span className="flex items-center gap-2">
                    <span>
                      {seatName(s.seatIndex)}
                      {s.isBot && s.difficulty ? ` · ${t(`difficulty_${s.difficulty}` as 'difficulty_easy')}` : ''}
                    </span>
                    {seatTag(s.seatIndex) && <span className="rounded bg-ink/10 px-1.5 py-0.5 text-[10px] font-semibold text-muted">{seatTag(s.seatIndex)}</span>}
                    {s.status === 'folded' && <span className="text-[10px] text-muted">{t('folded')}</span>}
                    {rev && (
                      <span className="flex gap-1">
                        {rev.cards.map((c) => (
                          <span key={c} className="rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-xs">{c}</span>
                        ))}
                        <span className="text-[10px] text-muted">{t.has(`rank.${rev.handLabel}` as 'rank.high_card') ? t(`rank.${rev.handLabel}` as 'rank.high_card') : rev.handLabel}</span>
                      </span>
                    )}
                  </span>
                  <span className="flex items-center gap-3">
                    {s.committedThisStreet > 0 && view.phase === 'BETTING' && (
                      <span className="font-mono text-xs text-muted">+{s.committedThisStreet}</span>
                    )}
                    {award ? <span className="font-mono text-xs font-semibold text-emerald-600">+{award}</span> : null}
                    <span className="font-mono" data-testid={`seat-stack-${s.seatIndex}`}>{s.stack}</span>
                  </span>
                </li>
              )
            })}
          </ul>

          {/* The viewer's own hole cards (live hand only). */}
          {view.viewerSeatIndex !== null && view.ownHole && (
            <div className="flex gap-2">
              {view.ownHole.map((c) => (
                <span key={c} className="rounded-md border border-rose/40 bg-rose/10 px-2 py-1 font-mono text-sm">{c}</span>
              ))}
            </div>
          )}

          {/* Action controls — rendered STRICTLY from the authoritative legal-action model. */}
          {isMyTurn && legal && (
            <div className="flex flex-col gap-3" data-testid="practice-actions">
              <div className="flex flex-wrap gap-2">
                {legal.allowed.includes('fold') && (
                  <button type="button" data-testid="act-fold" disabled={busy} onClick={() => act({ type: 'fold' })} className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold disabled:opacity-50">{t('act_fold')}</button>
                )}
                {legal.allowed.includes('check') && (
                  <button type="button" data-testid="act-check" disabled={busy} onClick={() => act({ type: 'check' })} className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold disabled:opacity-50">{t('act_check')}</button>
                )}
                {legal.allowed.includes('call') && (
                  <button type="button" data-testid="act-call" disabled={busy} onClick={() => act({ type: 'call' })} className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold disabled:opacity-50">{t('act_call', { amount: legal.callAmount })}</button>
                )}
                {aggressive && (
                  <button
                    type="button"
                    data-testid={canBet ? 'act-bet' : 'act-raise'}
                    disabled={busy}
                    onClick={() => act(canBet ? { type: 'bet', to: clampedTo } : { type: 'raise', to: clampedTo })}
                    className="rounded-full bg-rose px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {canBet ? t('act_bet', { amount: clampedTo }) : t('act_raise', { amount: clampedTo })}
                  </button>
                )}
                {legal.allowed.includes('all_in') && (
                  <button type="button" data-testid="act-all-in" disabled={busy} onClick={() => act({ type: 'all_in' })} className="rounded-full border border-rose px-4 py-1.5 text-sm font-semibold text-rose disabled:opacity-50">{t('act_all_in', { amount: legal.remainingStack + legal.currentStreetContribution })}</button>
                )}
              </div>

              {/* Integer sizing control for Bet / Raise (authoritative min/max). */}
              {aggressive && sizeMax > sizeMin && (
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={sizeMin}
                    max={sizeMax}
                    step={1}
                    value={clampedTo}
                    disabled={busy}
                    onChange={(e) => setRaiseTo(Number(e.target.value))}
                    className="flex-1"
                    aria-label={t('sizing_label')}
                  />
                  <input
                    type="number"
                    data-testid="sizing-input"
                    min={sizeMin}
                    max={sizeMax}
                    step={1}
                    value={clampedTo}
                    disabled={busy}
                    onChange={(e) => setRaiseTo(Number(e.target.value))}
                    className="w-24 rounded-lg border border-line bg-cream px-2 py-1 font-mono text-sm"
                    aria-label={t('sizing_label')}
                  />
                  <span className="text-xs text-muted">{t('sizing_range', { min: sizeMin, max: sizeMax })}</span>
                </div>
              )}
            </div>
          )}

          {/* Showdown / settlement result panel. */}
          {view.phase === 'COMPLETED' && result && (
            <div data-testid="practice-result" className="flex flex-col gap-2 rounded-lg border border-line bg-cream px-3 py-3 text-sm">
              <div className="font-semibold text-ink">
                {result.winners.length === 1
                  ? t('winner_one', { name: seatName(result.winners[0]) })
                  : t('winner_split', { names: result.winners.map(seatName).join(', ') })}
              </div>
              <div className="text-muted">{t('pot_awarded', { amount: result.potTotal })}</div>
              {result.awards.map((a) => (
                <div key={a.seatIndex} className="font-mono text-xs text-muted">{seatName(a.seatIndex)}: +{a.amount}</div>
              ))}
              {result.refund && (
                <div className="font-mono text-xs text-muted">{t('refund', { name: seatName(result.refund.seatIndex), amount: result.refund.amount })}</div>
              )}
              {!result.wentToShowdown && <div className="text-xs text-muted">{t('uncontested')}</div>}
            </div>
          )}

          {view.phase === 'COMPLETED' && (
            <button type="button" data-testid="practice-next-hand" disabled={busy} onClick={nextHand} className="w-fit rounded-full bg-rose px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
              {t('next_hand')}
            </button>
          )}
        </div>
      )}

      {errorCode && <p className="mt-3 text-sm text-rose">{errorMessage(errorCode)}</p>}
    </section>
  )
}
