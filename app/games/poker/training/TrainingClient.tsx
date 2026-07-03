'use client'

// ── TRAINING TABLE (client) ──────────────────────────────────────────────────────────────────
//
// A no-risk practice table. ALL game logic comes from the PURE trainer (lib/games/poker/learn),
// which imports nothing from the wallet/DB/server — so nothing here can move a coin or touch a
// statistic (enforced by trainer.test.ts). This component is presentation + input only: it renders
// the reveal-safe TrainingView, sends the learner's chosen action to the pure trainer, and shows
// contextual help + a post-hand explanation, all localized and honouring reduced-motion.

import { useCallback, useReducer, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import '../_design/poker-theme.css'
import { PokerCard, PokerCardBack, CommunityCardSlot } from '../_components/cards'
import { ActionButton, BettingAmountControl, type BettingModel } from '../_components/actions'
import { DealerButton, SmallBlindBadge, BigBlindBadge, AllInBadge } from '../_components/markers'
import { formatCoinsShort } from '@/lib/game/economy'
import {
  startTraining,
  trainingApply,
  trainingView,
  type TrainingSession,
  type TrainingView,
  type TrainingSeatView,
} from '@/lib/games/poker/learn/trainer'
import { TRAINING_SCENARIOS, type TrainingScenarioId } from '@/lib/games/poker/learn/scenarios'
import { getTrainingScenario } from '@/lib/games/poker/learn/scenarios'
import { explainShowdown, explainWhyNot, explainMinRaise, HELP_TOPICS } from '@/lib/games/poker/learn/explain'
import {
  trackTrainingScenarioStarted,
  trackTrainingScenarioCompleted,
  trackHelpTopicOpened,
} from '@/lib/games/poker/learn/analytics'
import type { AppliedAction } from '@/lib/games/poker/betting'
import { markTrainingScenarioComplete } from '../social'

const RANK_TEXT: Record<string, string> = { T: '10' }
function rankText(r: string): string {
  return RANK_TEXT[r] ?? r
}

export default function TrainingClient() {
  const t = useTranslations('games.poker')
  const sessionRef = useRef<TrainingSession | null>(null)
  const [scenarioId, setScenarioId] = useState<TrainingScenarioId | null>(null)
  const [, force] = useReducer((x: number) => x + 1, 0)
  const [showComposer, setShowComposer] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)

  const start = useCallback((id: TrainingScenarioId) => {
    const scenario = getTrainingScenario(id)
    if (!scenario) return
    sessionRef.current = startTraining(scenario)
    setScenarioId(id)
    setShowComposer(false)
    const index = TRAINING_SCENARIOS.findIndex((s) => s.id === id)
    trackTrainingScenarioStarted(index)
    force()
  }, [])

  const act = useCallback(
    (action: AppliedAction) => {
      const session = sessionRef.current
      if (!session) return
      const res = trainingApply(session, action)
      setShowComposer(false)
      if (res.ok && res.session.settled) {
        const index = TRAINING_SCENARIOS.findIndex((s) => s.id === res.session.scenario.id)
        trackTrainingScenarioCompleted(index)
        // Cosmetic 'complete_training' mission (best-effort; no-op if the flag/migration is off).
        void markTrainingScenarioComplete()
      }
      force()
    },
    [],
  )

  // ── Scenario picker ─────────────────────────────────────────────────────────────────────────
  if (!scenarioId || !sessionRef.current) {
    return (
      <div>
        <TrainingHeader t={t} />
        <h2 className="mt-6 mb-3 font-serif text-lg font-semibold">{t('learn.training.pick_scenario')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {TRAINING_SCENARIOS.map((s) => (
            <button
              key={s.id}
              data-testid={`pk-scenario-${s.id}`}
              onClick={() => start(s.id as TrainingScenarioId)}
              className="rounded-xl border border-line bg-paper p-4 text-left hover:border-rose"
            >
              <p className="font-medium">{t(`learn.training.scenario.${s.id}_t`)}</p>
              <p className="mt-1 text-sm text-muted">{t(`learn.training.scenario.${s.id}_b`)}</p>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const view = trainingView(sessionRef.current)
  const learnerTurn = view.turnSeat === view.learnerSeat && !view.settled
  const legal = view.legal

  return (
    <div>
      <TrainingHeader t={t} />

      <div className="mt-4 flex items-center justify-between gap-3">
        <div>
          <p className="font-serif text-base font-semibold">{t(`learn.training.scenario.${scenarioId}_t`)}</p>
          <p className="text-sm text-muted">{t(`learn.training.scenario.${scenarioId}_b`)}</p>
        </div>
        <button onClick={() => start(scenarioId)} className="whitespace-nowrap rounded-lg border border-line px-3 py-2 text-sm hover:border-rose">
          {t('learn.training.restart')}
        </button>
      </div>

      {/* ── The felt (dark lounge theme, scoped) ── */}
      <div data-testid="pk-training-felt" className="poker-root mt-4 overflow-hidden rounded-2xl" style={{ background: 'radial-gradient(120% 100% at 50% 0%, var(--pk-felt) 0%, var(--pk-felt-deep) 70%, var(--pk-felt-edge) 100%)' }}>
        <div className="p-4 sm:p-6">
          {/* opponents */}
          <div className="flex flex-wrap justify-center gap-4">
            {view.seats.filter((s) => !s.isLearner).map((s) => (
              <SeatView key={s.seatIndex} seat={s} view={view} t={t} />
            ))}
          </div>

          {/* board + pot */}
          <div className="my-6 flex flex-col items-center gap-2">
            <div className="rounded-full bg-black/30 px-4 py-1 text-sm font-semibold" style={{ color: 'var(--pk-gold-soft)' }}>
              {t('learn.training.pot')}: <span className="tabular-nums">{formatCoinsShort(view.pot)}</span>
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <CommunityCardSlot key={i} card={view.board[i] ?? null} w={44} />
              ))}
            </div>
          </div>

          {/* learner */}
          <div className="flex justify-center">
            {view.seats.filter((s) => s.isLearner).map((s) => (
              <SeatView key={s.seatIndex} seat={s} view={view} t={t} self />
            ))}
          </div>
        </div>
      </div>

      {/* ── Action / status area ── */}
      <div className="mt-4">
        {view.settled ? (
          <PostHand t={t} session={sessionRef.current} onNext={() => nextScenario(scenarioId, start)} onReplay={() => start(scenarioId)} />
        ) : learnerTurn && legal ? (
          <div className="poker-root rounded-2xl p-3" style={{ background: 'var(--pk-charcoal)' }}>
            <p className="mb-2 text-center text-sm font-semibold" style={{ color: 'var(--pk-gold-soft)' }}>
              {t('learn.training.your_turn')}
            </p>
            {showComposer ? (
              <BettingAmountControl
                model={toBettingModel(legal)}
                onCancel={() => setShowComposer(false)}
                onConfirm={(raiseTo) => act(aggressiveAction(legal, raiseTo))}
              />
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <ActionButton variant="fold" label={t('action.fold')} onClick={() => act({ type: 'fold' })} className={suggestedRing(view, 'fold')} testId={actTestId(view, 'fold')} />
                {legal.allowed.includes('check') ? (
                  <ActionButton variant="check" label={t('action.check')} onClick={() => act({ type: 'check' })} className={suggestedRing(view, 'check')} testId={actTestId(view, 'check')} />
                ) : legal.allowed.includes('call') ? (
                  <ActionButton
                    variant="call"
                    label={t('action.call')}
                    sublabel={formatCoinsShort(legal.callAmount)}
                    onClick={() => act({ type: 'call' })}
                    className={suggestedRing(view, 'call')}
                    testId={actTestId(view, 'call')}
                  />
                ) : null}
                {legal.allowed.includes('bet') || legal.allowed.includes('raise') ? (
                  <ActionButton
                    variant="raise"
                    label={legal.allowed.includes('bet') ? t('action.bet') : t('action.raise')}
                    onClick={() => setShowComposer(true)}
                    className={suggestedRing(view, legal.allowed.includes('bet') ? 'bet' : 'raise')}
                    testId={actTestId(view, legal.allowed.includes('bet') ? 'bet' : 'raise')}
                  />
                ) : null}
                {legal.allowed.includes('all_in') && !legal.allowed.includes('bet') && !legal.allowed.includes('raise') ? (
                  <ActionButton variant="allin" label={t('action.all_in')} onClick={() => act({ type: 'all_in' })} className={suggestedRing(view, 'all_in')} testId={actTestId(view, 'all_in')} />
                ) : null}
              </div>
            )}

            {!showComposer && <WhyHints t={t} legal={legal} />}
            <p className="mt-2 text-center text-[11px]" style={{ color: 'var(--pk-text-low)' }}>
              {t('learn.training.suggested_hint')}
            </p>
          </div>
        ) : (
          <p className="rounded-2xl border border-line bg-paper py-4 text-center text-sm text-muted">{t('learn.training.waiting')}</p>
        )}
      </div>

      {/* ── Contextual help panel (all the "why?" questions) ── */}
      <div className="mt-4">
        <button
          onClick={() => setHelpOpen((o) => !o)}
          className="text-sm font-medium text-rose hover:underline"
          aria-expanded={helpOpen}
        >
          {t('learn.explain.why_title')} ▾
        </button>
        {helpOpen && (
          <dl className="mt-2 grid gap-2 sm:grid-cols-2">
            {HELP_TOPICS.map((topic, i) => (
              <div key={topic.key} className="rounded-xl border border-line bg-paper p-3">
                <dt>
                  <button
                    className="text-left text-sm font-medium text-ink"
                    onClick={() => trackHelpTopicOpened(i)}
                  >
                    {t(`learn.explain.topic.${topic.key}_q`)}
                  </button>
                </dt>
                <dd className="mt-1 text-sm text-muted">{t(`learn.explain.topic.${topic.key}_a`)}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  )
}

// ── Header (TRAINING badge + no-stakes note) ────────────────────────────────────────────────────
function TrainingHeader({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <h1 className="font-serif text-2xl font-bold">{t('learn.training.title')}</h1>
        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-600">
          {t('learn.training.badge')}
        </span>
      </div>
      <p className="mt-1 flex items-center gap-2 text-sm text-muted">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
        {t('learn.training.subtitle')}
      </p>
    </div>
  )
}

// ── One seat ────────────────────────────────────────────────────────────────────────────────────
function SeatView({ seat, view, t, self = false }: { seat: TrainingSeatView; view: TrainingView; t: ReturnType<typeof useTranslations>; self?: boolean }) {
  const name = t(`learn.training.player.${seat.nameKey}` as never) as string
  const active = seat.isCurrentActor && !view.settled
  const won = seat.winAmount > 0
  return (
    <div
      className="flex min-w-[120px] flex-col items-center gap-1 rounded-xl px-3 py-2"
      style={{
        background: active ? 'rgba(230,207,149,0.12)' : 'rgba(0,0,0,0.25)',
        border: `1px solid ${active ? 'var(--pk-actor)' : won ? 'var(--pk-gold)' : 'var(--pk-gold-line)'}`,
        opacity: seat.folded ? 0.5 : 1,
      }}
    >
      <div className="flex items-center gap-1">
        {seat.isButton && <DealerButton size={18} />}
        {seat.isSmallBlind && <SmallBlindBadge size={18} />}
        {seat.isBigBlind && <BigBlindBadge size={18} />}
        {seat.allIn && <AllInBadge />}
      </div>
      <div className="flex gap-1">
        {seat.cards ? (
          <>
            <PokerCard card={seat.cards[0]} w={self ? 46 : 34} />
            <PokerCard card={seat.cards[1]} w={self ? 46 : 34} />
          </>
        ) : (
          <>
            <PokerCardBack w={self ? 46 : 34} />
            <PokerCardBack w={self ? 46 : 34} />
          </>
        )}
      </div>
      <p className="text-xs font-medium" style={{ color: 'var(--pk-text-hi)' }}>
        {self ? t('learn.training.player.you') : name}
      </p>
      <p className="text-[11px] tabular-nums" style={{ color: 'var(--pk-text-mid)' }}>
        {formatCoinsShort(seat.stack)}
        {seat.committedThisStreet > 0 && <span style={{ color: 'var(--pk-gold-soft)' }}> · {formatCoinsShort(seat.committedThisStreet)}</span>}
      </p>
      {won && <p className="text-[11px] font-bold" style={{ color: 'var(--pk-gold-soft)' }}>+{formatCoinsShort(seat.winAmount)}</p>}
    </div>
  )
}

// ── "Why can't I …?" inline hints derived from authoritative state ──────────────────────────────
function WhyHints({ t, legal }: { t: ReturnType<typeof useTranslations>; legal: NonNullable<TrainingView['legal']> }) {
  const hints: string[] = []
  if (!legal.allowed.includes('check')) {
    const e = explainWhyNot(legal, 'check')
    if (e.code === 'check_blocked_by_bet') hints.push(t('learn.explain.check_blocked_by_bet', { amount: e.params.callAmount }))
  }
  if (!legal.allowed.includes('raise') && !legal.allowed.includes('bet')) {
    const e = explainWhyNot(legal, 'raise')
    if (e.code === 'raise_no_chips') hints.push(t('learn.explain.raise_no_chips'))
    else if (e.code === 'raise_not_reopened') hints.push(t('learn.explain.raise_not_reopened'))
  } else if (legal.allowed.includes('raise')) {
    const m = explainMinRaise(legal)
    hints.push(t('learn.explain.min_raise', { minRaiseTo: m.minRaiseTo, increment: m.increment }))
  }
  if (legal.callAmount > 0 && legal.callAmount >= legal.remainingStack) {
    hints.push(t('learn.explain.call_would_be_all_in', { amount: legal.callAmount }))
  }
  if (hints.length === 0) return null
  return (
    <ul className="mt-2 space-y-1">
      {hints.map((h, i) => (
        <li key={i} className="text-center text-[11.5px]" style={{ color: 'var(--pk-text-mid)' }}>
          💡 {h}
        </li>
      ))}
    </ul>
  )
}

// ── Post-hand explanation ───────────────────────────────────────────────────────────────────────
function PostHand({ t, session, onNext, onReplay }: { t: ReturnType<typeof useTranslations>; session: TrainingSession; onNext: () => void; onReplay: () => void }) {
  if (!session.settled) return null
  const ex = explainShowdown(session.settled, session.state.board)
  const learnerWon = ex.pots.some((p) => p.winners.includes(session.learnerSeat))
  const anySplit = ex.pots.some((p) => p.split)
  const nameOf = (seat: number) => {
    const key = session.nameBySeat.get(seat) ?? 'a'
    return key === 'you' ? t('learn.training.player.you') : (t(`learn.training.player.${key}` as never) as string)
  }

  return (
    <div data-testid="pk-posthand" className="rounded-2xl border border-line bg-paper p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-serif text-lg font-bold">{t('learn.explain.posthand.title')}</h2>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${learnerWon ? 'bg-emerald-500/10 text-emerald-600' : 'bg-rose/10 text-rose'}`}
        >
          {anySplit ? t('learn.training.split') : learnerWon ? t('learn.training.you_won') : t('learn.training.you_lost')}
        </span>
      </div>

      <div className="space-y-3">
        {ex.pots.filter((p) => p.amount > 0).map((p) => (
          <div key={p.potIndex} className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                {p.kind === 'main' ? t('learn.explain.posthand.pot_won') : t('learn.explain.posthand.side_pot_won')}
              </p>
              <p className="text-sm tabular-nums text-rose">{formatCoinsShort(p.amount)}</p>
            </div>
            <p className="mt-1 text-sm text-muted">
              {t('learn.explain.posthand.winner')}: {p.winners.map(nameOf).join(', ')}
              {p.categoryLabel && <> · {t('learn.explain.posthand.winning_hand')}: {t(`hand_name.${p.categoryLabel}`)}</>}
            </p>
            {p.bestFive.length === 5 && (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-muted">{t('learn.explain.posthand.best_five')}</span>
                <span className="inline-flex gap-1" style={{ ['--pk-r-card' as string]: '6px', ['--pk-shadow-seat' as string]: '0 1px 4px rgba(0,0,0,0.2)', ['--pk-gold-soft' as string]: '#e6cf95' } as React.CSSProperties}>
                  {p.bestFive.map((c) => (
                    <PokerCard key={c} card={c} w={26} />
                  ))}
                </span>
              </div>
            )}
            <div className="mt-2 space-y-0.5 text-[12.5px] text-muted">
              {p.split && <p>· {t('learn.explain.posthand.split')}</p>}
              {p.boardPlays && <p>· {t('learn.explain.posthand.board_plays')}</p>}
              {p.kickerRank && <p>· {t('learn.explain.posthand.kicker', { rank: rankText(p.kickerRank) })}</p>}
            </div>
          </div>
        ))}
        {ex.refund && (
          <p className="text-sm text-muted">· {t('learn.explain.posthand.uncalled_refund', { amount: formatCoinsShort(ex.refund.amount) })}</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={onReplay} className="rounded-lg border border-line px-4 py-2 text-sm font-medium hover:border-rose">
          {t('learn.training.restart')}
        </button>
        <button onClick={onNext} className="rounded-lg bg-rose px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          {t('learn.training.next_scenario')}
        </button>
      </div>
    </div>
  )
}

// ── helpers ─────────────────────────────────────────────────────────────────────────────────────
function toBettingModel(legal: NonNullable<TrainingView['legal']>): BettingModel {
  return {
    callAmount: legal.callAmount,
    minRaiseTo: legal.minRaiseTo,
    maxRaiseTo: legal.maxRaiseTo,
    pot: legal.pot,
    currentContribution: legal.currentStreetContribution,
    bigBlind: undefined,
  }
}

function aggressiveAction(legal: NonNullable<TrainingView['legal']>, raiseTo: number): AppliedAction {
  const isOpen = legal.callAmount === 0 && legal.allowed.includes('bet')
  return isOpen ? { type: 'bet', to: raiseTo } : { type: 'raise', to: raiseTo }
}

function suggestedRing(view: TrainingView, actionType: string): string {
  return view.suggested?.type === actionType ? 'ring-2 ring-[var(--pk-gold-soft)] ring-offset-1 ring-offset-transparent' : ''
}

// The button matching the scripted "good line" gets a stable `pk-suggested` hook (E2E can play a
// whole hand by clicking it repeatedly); every other action gets `pk-act-<type>`.
function actTestId(view: TrainingView, actionType: string): string {
  return view.suggested?.type === actionType ? 'pk-suggested' : `pk-act-${actionType}`
}

function nextScenario(current: string, start: (id: TrainingScenarioId) => void) {
  const idx = TRAINING_SCENARIOS.findIndex((s) => s.id === current)
  const next = TRAINING_SCENARIOS[(idx + 1) % TRAINING_SCENARIOS.length]
  start(next.id as TrainingScenarioId)
}
