'use client'

// Minimal practice-bot table client. The browser sends INTENT only — it renders the
// server-authoritative view and calls the 'use server' actions; it never decides cards, legality,
// or bot actions. Deliberately spartan: a full-featured table is a follow-up (this ships dark).

import { useState } from 'react'
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function apply<T extends { view: PracticeClientView }>(r: PracticeResult<T>): void {
    if (r.ok) { setView(r.view); setError(null) } else setError(r.error)
  }

  async function start(): Promise<void> {
    setBusy(true); setError(null)
    const r = await createPracticeTable({ seatCount: 4, difficulty })
    if (r.ok) {
      setGameId(r.gameId)
      apply(await fetchPracticeState(r.gameId))
    } else setError(r.error)
    setBusy(false)
  }

  async function act(action: AppliedAction): Promise<void> {
    if (!gameId || !view) return
    setBusy(true)
    apply(await practiceAct(gameId, action, view.version))
    setBusy(false)
  }

  async function nextHand(): Promise<void> {
    if (!gameId) return
    setBusy(true)
    apply(await practiceStartNextHand(gameId))
    setBusy(false)
  }

  const isMyTurn = view && view.turnSeat === view.viewerSeatIndex && view.phase === 'BETTING'

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
          <button
            type="button"
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
            {t('badge_practice')} · {t('badge_no_reward')} · #{view.handNo} · {view.phase}
          </div>
          <div className="flex flex-wrap gap-2">
            {view.board.map((c) => (
              <span key={c} className="rounded-md border border-line bg-cream px-2 py-1 font-mono text-sm">{c}</span>
            ))}
          </div>
          <ul className="flex flex-col gap-1">
            {view.seats.map((s) => (
              <li
                key={s.seatIndex}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${s.seatIndex === view.turnSeat ? 'bg-rose/10 font-semibold' : 'bg-cream'}`}
              >
                <span>
                  {s.isBot ? s.displayName : t('you')}
                  {s.isBot && s.difficulty ? ` · ${t(`difficulty_${s.difficulty}` as 'difficulty_easy')}` : ''}
                </span>
                <span className="font-mono">{s.stack}</span>
              </li>
            ))}
          </ul>
          {view.viewerSeatIndex !== null && view.ownHole && (
            <div className="flex gap-2">
              {view.ownHole.map((c) => (
                <span key={c} className="rounded-md border border-rose/40 bg-rose/10 px-2 py-1 font-mono text-sm">{c}</span>
              ))}
            </div>
          )}

          {isMyTurn && (
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={busy} onClick={() => act({ type: 'fold' })} className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold">Fold</button>
              <button type="button" disabled={busy} onClick={() => act({ type: 'check' })} className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold">Check</button>
              <button type="button" disabled={busy} onClick={() => act({ type: 'call' })} className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold">Call</button>
            </div>
          )}
          {view.phase === 'COMPLETED' && (
            <button type="button" disabled={busy} onClick={nextHand} className="w-fit rounded-full bg-rose px-5 py-2 text-sm font-bold text-white disabled:opacity-50">
              {t('start')}
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm text-rose">{error}</p>}
    </section>
  )
}
