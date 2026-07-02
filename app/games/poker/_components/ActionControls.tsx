'use client'

// ── ActionControls — the authoritative action bar + raise composer ──────────────────────────
//
// Driven ENTIRELY by the server's LegalActionModel (security-model §4): the buttons shown are
// exactly the actions the server marked legal, the call amount and raise bounds are the server's
// numbers, and every value the player picks is re-validated server-side. The client never invents
// a legal action, never shows an impossible combination (e.g. Check while a call is owed), and
// never decides the result.
//
// UX protections (visual-spec §8): a single in-flight command (double-submit guarded by the
// parent's `pending`), an all-in confirm step (irreversible), graceful recovery after a stale /
// rejected action (the error is surfaced and the bar re-enables once truth re-syncs), and touch
// targets ≥ 44px with no hover dependency.

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { formatCoinsShort, formatCoinsFull } from '@/lib/game/economy'
import type { LegalActionModel } from '@/lib/games/poker/hand'
import type { PokerActionType } from '@/lib/games/poker/types'
import { recordUxSignal } from '@/lib/games/poker/uxSignals'
import { ActionButton, PresetBetButton, BettingSlider } from './actions'

export interface ActionControlsProps {
  /** The server's authoritative legal-action model — non-null ONLY on the viewer's turn. */
  model: LegalActionModel
  bigBlind: number
  /** A command is in flight — block all further submits until it resolves (no double-submit). */
  pending: boolean
  /** Non-null disables the bar (e.g. reconnecting); a short reason can be shown. */
  disabled?: boolean
  /** The last server error code for a rejected action (e.g. 'stale_state'); cleared by the parent. */
  errorCode?: string | null
  /** Fire ONE intent. The parent owns identity, the expected-seq CAS and `pending`. */
  onAct: (action: PokerActionType, amount?: number) => void
}

type Mode = 'idle' | 'compose' | 'confirm_allin'

export function ActionControls({ model, bigBlind, pending, disabled = false, errorCode, onAct }: ActionControlsProps) {
  const t = useTranslations('games.poker')
  const allowed = useMemo(() => new Set(model.allowed), [model.allowed])

  const canCheck = allowed.has('check')
  const canFold = allowed.has('fold')
  const canBet = allowed.has('bet')
  const canRaise = allowed.has('raise')
  const canAggress = canBet || canRaise
  // A call that consumes the whole stack is an all-in (ALLIN-CALLSHORT-001) — present it as
  // ALL-IN, never a plain Call.
  const callIsAllIn = allowed.has('call') && model.remainingStack > 0 && model.callAmount >= model.remainingStack
  const canPlainCall = allowed.has('call') && !callIsAllIn
  // A pure shove (can't make a full-sized raise, but may go all-in).
  const canShoveOnly = allowed.has('all_in') && !canAggress && !callIsAllIn

  const minTo = canBet ? model.minOpeningBet : model.minRaiseTo
  const maxTo = model.maxRaiseTo

  const [mode, setMode] = useState<Mode>('idle')
  const [raiseTo, setRaiseTo] = useState<number>(minTo)

  // Reset the composer whenever the authoritative turn/version changes (a fresh decision point).
  useEffect(() => {
    setMode('idle')
    setRaiseTo(minTo)
  }, [model.actionSeq, model.seatIndex, minTo])

  const blocked = pending || disabled
  const clamp = (v: number) => Math.max(minTo, Math.min(maxTo, Math.round(Number.isFinite(v) ? v : minTo)))

  const submit = (action: PokerActionType, amount?: number) => {
    if (blocked) return
    onAct(action, amount)
  }
  const submitRaise = (to: number) => {
    const v = clamp(to)
    if (v >= maxTo) submit('all_in')
    else submit(canBet ? 'bet' : 'raise', v)
  }

  // ── Compose mode (the full betting control) ──────────────────────────────────────────────
  if (mode === 'compose') {
    return (
      <RaiseComposer
        minTo={minTo}
        maxTo={maxTo}
        callAmount={model.callAmount}
        pot={model.pot}
        currentContribution={model.currentStreetContribution}
        remainingStack={model.remainingStack}
        bigBlind={bigBlind}
        value={raiseTo}
        isOpen={canBet}
        pending={pending}
        disabled={disabled}
        onChange={(v) => setRaiseTo(clamp(v))}
        onCancel={() => setMode('idle')}
        onConfirm={() => submitRaise(raiseTo)}
      />
    )
  }

  // ── Confirm-all-in mode (irreversible) ───────────────────────────────────────────────────
  if (mode === 'confirm_allin') {
    const shoveAmount = callIsAllIn ? model.currentStreetContribution + model.callAmount : maxTo
    return (
      <div className="flex w-full flex-col items-center gap-2">
        <p className="pk-felt-scrim text-center text-[13px] font-semibold" style={{ color: 'var(--pk-amber)' }}>
          {t('bet.all_in_confirm_hint')}
        </p>
        <div className="flex w-full items-center justify-center gap-2">
          <ActionButton variant="neutral" label={t('bet.cancel')} onClick={() => { recordUxSignal('allin_confirm_cancelled'); setMode('idle') }} disabled={pending} className="flex-1" />
          <ActionButton
            variant="allin"
            label={t('action.all_in')}
            sublabel={formatCoinsShort(shoveAmount)}
            onClick={() => submit('all_in')}
            disabled={blocked}
            className="flex-[2]"
            testId="poker-allin-confirm"
          />
        </div>
      </div>
    )
  }

  // ── Idle mode (the primary action buttons) ───────────────────────────────────────────────
  return (
    <div className="flex w-full flex-col items-stretch gap-2">
      {errorCode && (
        <p role="alert" className="pk-felt-scrim text-center text-[12px] font-semibold" style={{ color: 'var(--pk-pink-soft)' }}>
          {t.has(`error.${errorCode}`) ? t(`error.${errorCode}`) : t('error.generic')}
        </p>
      )}
      <div className="flex w-full items-stretch justify-center gap-2">
        {canFold && (
          <ActionButton variant="fold" label={t('action.fold')} onClick={() => submit('fold')} disabled={blocked} className="flex-1" testId="poker-action-fold" />
        )}
        {canCheck && (
          <ActionButton variant="check" label={t('action.check')} onClick={() => submit('check')} disabled={blocked} className="flex-1" testId="poker-action-check" />
        )}
        {canPlainCall && (
          <ActionButton
            variant="call"
            label={t('action.call')}
            sublabel={formatCoinsShort(model.callAmount)}
            onClick={() => submit('call')}
            disabled={blocked}
            className="flex-1"
            testId="poker-action-call"
          />
        )}
        {callIsAllIn && (
          <ActionButton
            variant="allin"
            label={t('action.all_in')}
            sublabel={formatCoinsShort(model.callAmount)}
            onClick={() => { recordUxSignal('allin_confirm_opened'); setMode('confirm_allin') }}
            disabled={blocked}
            className="flex-1"
            testId="poker-action-allin"
          />
        )}
        {canShoveOnly && (
          <ActionButton
            variant="allin"
            label={t('action.all_in')}
            sublabel={formatCoinsShort(maxTo)}
            onClick={() => { recordUxSignal('allin_confirm_opened'); setMode('confirm_allin') }}
            disabled={blocked}
            className="flex-1"
            testId="poker-action-allin"
          />
        )}
        {canAggress && (
          <ActionButton
            variant={canBet ? 'bet' : 'raise'}
            label={canBet ? t('action.bet') : t('action.raise')}
            onClick={() => {
              recordUxSignal('raise_composer_opened')
              setRaiseTo(clamp(minTo))
              setMode('compose')
            }}
            disabled={blocked}
            className="flex-1"
            testId="poker-action-raise"
          />
        )}
      </div>
    </div>
  )
}

// ── RaiseComposer — slider + numeric + steppers + pot-fraction presets + min/max + all-in ────
// Emits the chosen "raise to" TOTAL for this street. Shows the live to-call, the stack, and the
// stack remaining AFTER the selected action so the commitment is never a surprise. Server is
// authoritative on the exact legal sizing — these presets are convenience approximations.
function RaiseComposer({
  minTo,
  maxTo,
  callAmount,
  pot,
  currentContribution,
  remainingStack,
  bigBlind,
  value,
  isOpen,
  pending,
  disabled,
  onChange,
  onCancel,
  onConfirm,
}: {
  minTo: number
  maxTo: number
  callAmount: number
  pot: number
  currentContribution: number
  remainingStack: number
  bigBlind: number
  value: number
  isOpen: boolean // true ⇒ opening bet, false ⇒ raise
  pending: boolean
  disabled: boolean
  onChange: (v: number) => void
  onCancel: () => void
  onConfirm: () => void
}) {
  const t = useTranslations('games.poker')
  const step = Math.max(1, bigBlind)
  const clamp = (v: number) => Math.max(minTo, Math.min(maxTo, Math.round(v)))
  // Record a typed amount that fell outside the legal [minTo, maxTo] bounds (a UX-research signal
  // that the numeric bounds may be unclear). Never blocks input — the value is still clamped.
  const onTypedAmount = (raw: number) => {
    if (Number.isFinite(raw) && (raw < minTo || raw > maxTo)) {
      recordUxSignal('invalid_amount_attempt')
    }
    onChange(clamp(raw))
  }

  const presets = useMemo(() => {
    const potAfterCall = pot + callAmount
    const make = (frac: number) => clamp(currentContribution + callAmount + Math.round(potAfterCall * frac))
    return [
      { key: 'half', label: t('bet.half_pot'), value: make(0.5) },
      { key: 'two_third', label: t('bet.two_third_pot'), value: make(2 / 3) },
      { key: 'three_q', label: t('bet.three_quarter_pot'), value: make(0.75) },
      { key: 'pot', label: t('bet.pot'), value: make(1) },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pot, callAmount, currentContribution, minTo, maxTo, t])

  const isAllIn = value >= maxTo
  const addedThisAction = Math.max(0, value - currentContribution)
  const remainingAfter = Math.max(0, remainingStack - addedThisAction)
  const blocked = pending || disabled

  return (
    <div
      className="flex w-full flex-col gap-2.5 rounded-2xl p-3"
      style={{ background: 'linear-gradient(180deg,#1a1620,#0e0c12)', border: '1px solid var(--pk-gold-line)', boxShadow: 'var(--pk-shadow-raised)' }}
    >
      {/* readouts */}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span style={{ color: 'var(--pk-text-low)' }}>
          {t('action_bar.to_call')}: <span className="tabular-nums" style={{ color: 'var(--pk-text-mid)' }}>{formatCoinsShort(callAmount)}</span>
        </span>
        <span style={{ color: 'var(--pk-text-low)' }}>
          {t('action_bar.after')}: <span className="tabular-nums" style={{ color: remainingAfter === 0 ? 'var(--pk-amber)' : 'var(--pk-text-mid)' }}>{formatCoinsShort(remainingAfter)}</span>
        </span>
      </div>

      {/* amount + steppers + numeric input */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(clamp(value - step))}
          aria-label={t('bet.decrease')}
          disabled={blocked}
          className="inline-flex items-center justify-center font-bold disabled:opacity-40"
          style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(0,0,0,0.4)', color: 'var(--pk-text-hi)', border: '1px solid var(--pk-gold-line)' }}
        >
          −
        </button>
        <label className="flex flex-1 flex-col items-center">
          <span className="text-[10.5px] uppercase tracking-wide" style={{ color: 'var(--pk-text-low)' }}>
            {isOpen ? t('action.bet') : t('bet.raise_to')}
          </span>
          <input
            type="number"
            min={minTo}
            max={maxTo}
            step={step}
            value={value}
            disabled={blocked}
            onChange={(e) => onTypedAmount(Number(e.target.value))}
            className="w-full bg-transparent text-center font-extrabold tabular-nums outline-none"
            style={{ color: 'var(--pk-gold-soft)', fontSize: 22 }}
            aria-label={isOpen ? t('action.bet') : t('bet.raise_to')}
            data-testid="poker-raise-amount"
          />
        </label>
        <button
          type="button"
          onClick={() => onChange(clamp(value + step))}
          aria-label={t('bet.increase')}
          disabled={blocked}
          className="inline-flex items-center justify-center font-bold disabled:opacity-40"
          style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(0,0,0,0.4)', color: 'var(--pk-text-hi)', border: '1px solid var(--pk-gold-line)' }}
        >
          +
        </button>
      </div>

      <BettingSlider min={minTo} max={maxTo} step={step} value={value} onChange={(v) => onChange(clamp(v))} disabled={blocked} />

      {/* pot-fraction + min/max presets */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        <PresetBetButton label={t('bet.min')} value={minTo} active={value === minTo} disabled={blocked} onClick={() => onChange(minTo)} />
        {presets.map((p) => (
          <PresetBetButton key={p.key} label={p.label} value={p.value} active={value === p.value} disabled={blocked} onClick={() => onChange(p.value)} />
        ))}
        <PresetBetButton label={t('bet.max')} value={maxTo} active={isAllIn} disabled={blocked} onClick={() => onChange(maxTo)} />
      </div>

      <div className="flex items-center gap-2">
        <ActionButton variant="neutral" label={t('bet.cancel')} onClick={() => { recordUxSignal('raise_composer_cancelled'); onCancel() }} disabled={pending} className="flex-1" />
        <ActionButton
          variant={isAllIn ? 'allin' : isOpen ? 'bet' : 'raise'}
          label={isAllIn ? t('action.all_in') : isOpen ? t('action.bet') : t('action.raise')}
          sublabel={isAllIn ? undefined : formatCoinsShort(value)}
          onClick={onConfirm}
          disabled={blocked}
          className="flex-[2]"
          testId="poker-raise-confirm"
        />
      </div>
      {isAllIn && (
        <p className="text-center text-[11px]" style={{ color: 'var(--pk-amber)' }} title={formatCoinsFull(maxTo)}>
          {t('bet.all_in_confirm_hint')}
        </p>
      )}
    </div>
  )
}
