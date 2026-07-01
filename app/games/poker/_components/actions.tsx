'use client'

// ── Action controls — ActionButton · PresetBetButton · BettingSlider · BettingAmountControl ──
//
// The bottom action band. These components send INTENT only — they never decide legality, pot
// math, or whether an action is allowed; the server is authoritative (C2). Inputs are driven by
// the server's LegalActionModel (callAmount / minRaiseTo / maxRaiseTo / pot). All amounts are
// integers. Touch targets are ≥ 44px; the all-in (and other irreversible) action requires a
// confirm step (visual-spec §8). No hover is required to operate anything.

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { formatCoinsShort, formatCoinsFull } from '@/lib/game/economy'

type ActionVariant = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin' | 'neutral'

const VARIANT_STYLE: Record<ActionVariant, { bg: string; fg: string; border: string }> = {
  fold: { bg: 'linear-gradient(180deg,#9d2b3f,#6e1c2c)', fg: '#fbe9ec', border: '#6e1c2c' },
  check: { bg: 'linear-gradient(180deg,#2d5b8e,#1c3c61)', fg: '#eaf2fb', border: '#1c3c61' },
  call: { bg: 'linear-gradient(180deg,#2f9e6f,#1c6b4a)', fg: '#e9f7ef', border: '#1c6b4a' },
  bet: { bg: 'linear-gradient(180deg,#d99836,#a06d1f)', fg: '#1a1206', border: '#a06d1f' },
  raise: { bg: 'linear-gradient(180deg,#d99836,#a06d1f)', fg: '#1a1206', border: '#a06d1f' },
  allin: { bg: 'linear-gradient(180deg,#e6cf95,#c9a14a)', fg: '#241b18', border: '#8a6d2c' },
  neutral: { bg: 'linear-gradient(180deg,#211c28,#16131b)', fg: '#f4efe6', border: 'var(--pk-gold-line)' },
}

export function ActionButton({
  variant = 'neutral',
  label,
  sublabel,
  disabled = false,
  onClick,
  className = '',
  testId,
}: {
  variant?: ActionVariant
  label: string
  sublabel?: string
  disabled?: boolean
  onClick?: () => void
  className?: string
  /** Optional stable e2e hook (rendered as data-testid); presentation is unaffected. */
  testId?: string
}) {
  const s = VARIANT_STYLE[variant]
  return (
    <button
      type="button"
      data-testid={testId}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex flex-col items-center justify-center font-bold leading-tight transition-transform active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 ${className}`}
      style={{
        minWidth: 92,
        minHeight: 48,
        padding: '8px 16px',
        borderRadius: 'var(--pk-r-control)',
        background: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`,
        boxShadow: disabled ? 'none' : 'var(--pk-shadow-seat)',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <span className="text-[15px]">{label}</span>
      {sublabel && <span className="text-[12px] font-semibold tabular-nums opacity-90">{sublabel}</span>}
    </button>
  )
}

export function PresetBetButton({
  label,
  value,
  active = false,
  disabled = false,
  onClick,
}: {
  label: string
  value?: number
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={value != null ? formatCoinsFull(value) : undefined}
      className="inline-flex flex-col items-center justify-center font-semibold transition-colors active:scale-[0.97] disabled:opacity-40"
      style={{
        minWidth: 56,
        minHeight: 44,
        padding: '6px 10px',
        borderRadius: 10,
        background: active ? 'linear-gradient(180deg,#2a2330,#16131b)' : 'rgba(0,0,0,0.4)',
        color: active ? 'var(--pk-gold-soft)' : 'var(--pk-text-mid)',
        border: `1px solid ${active ? 'var(--pk-gold)' : 'var(--pk-gold-line)'}`,
      }}
    >
      <span className="text-[12.5px]">{label}</span>
      {value != null && <span className="text-[11px] tabular-nums opacity-90">{formatCoinsShort(value)}</span>}
    </button>
  )
}

// Touch-friendly range slider for choosing a "raise to" total. Uses a native range input
// (keyboard-accessible) with a themed track filled to the current value.
export function BettingSlider({
  min,
  max,
  step = 1,
  value,
  onChange,
  disabled = false,
}: {
  min: number
  max: number
  step?: number
  value: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Math.round(Number(e.target.value)))}
      aria-label="bet amount"
      className="pk-bet-slider w-full"
      style={
        {
          // gold fill up to the thumb, charcoal track after
          background: `linear-gradient(90deg, var(--pk-gold) 0%, var(--pk-gold) ${pct}%, rgba(255,255,255,0.14) ${pct}%, rgba(255,255,255,0.14) 100%)`,
        } as React.CSSProperties
      }
    />
  )
}

// ── BettingAmountControl ─────────────────────────────────────────────────────────────────────
// Full raise composer: numeric input + steppers + slider + pot-fraction presets + a confirm
// action. Emits the chosen "raise to" TOTAL via onConfirm; the server validates it. The displayed
// presets are convenience approximations (server is authoritative on exact legal sizing).
export interface BettingModel {
  readonly callAmount: number // chips to add to call (0 when checking)
  readonly minRaiseTo: number // smallest legal raise-to total this street
  readonly maxRaiseTo: number // largest raise-to (= all-in)
  readonly pot: number // total committed this hand (for pot-fraction presets)
  readonly currentContribution: number // already committed THIS street
  readonly bigBlind?: number // slider step granularity
}

export function BettingAmountControl({
  model,
  onConfirm,
  onCancel,
}: {
  model: BettingModel
  onConfirm?: (raiseTo: number) => void
  onCancel?: () => void
}) {
  const t = useTranslations('games.poker')
  const { callAmount, minRaiseTo, maxRaiseTo, pot, currentContribution } = model
  const step = Math.max(1, model.bigBlind ?? 1)
  const [amount, setAmount] = useState<number>(minRaiseTo)

  const clamp = (v: number) => Math.max(minRaiseTo, Math.min(maxRaiseTo, Math.round(v)))
  const set = (v: number) => setAmount(clamp(v))

  // Pot-fraction presets → a "raise to" total ≈ (pot after our call) × fraction + amount to call.
  const presets = useMemo(() => {
    const potAfterCall = pot + callAmount
    const make = (frac: number) => clamp(currentContribution + callAmount + Math.round(potAfterCall * frac))
    return [
      { key: 'half', label: t('bet.half_pot'), value: make(0.5) },
      { key: 'three_q', label: t('bet.three_quarter_pot'), value: make(0.75) },
      { key: 'pot', label: t('bet.pot'), value: make(1) },
    ]
  }, [pot, callAmount, currentContribution, t]) // eslint-disable-line react-hooks/exhaustive-deps

  const isAllIn = amount >= maxRaiseTo
  const isOpen = callAmount === 0 // no bet to call yet ⇒ this is a "bet", else a "raise"

  return (
    <div
      className="flex flex-col gap-3 rounded-2xl p-3"
      style={{ background: 'linear-gradient(180deg,#1a1620,#0e0c12)', border: '1px solid var(--pk-gold-line)', boxShadow: 'var(--pk-shadow-raised)' }}
    >
      {/* amount readout + steppers + numeric input */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => set(amount - step)}
          aria-label={t('bet.decrease')}
          className="inline-flex items-center justify-center font-bold"
          style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(0,0,0,0.4)', color: 'var(--pk-text-hi)', border: '1px solid var(--pk-gold-line)' }}
        >
          −
        </button>
        <label className="flex-1 flex flex-col items-center">
          <span className="text-[10.5px] uppercase tracking-wide" style={{ color: 'var(--pk-text-low)' }}>
            {t('bet.raise_to')}
          </span>
          <input
            type="number"
            min={minRaiseTo}
            max={maxRaiseTo}
            step={step}
            value={amount}
            onChange={(e) => set(Number(e.target.value))}
            className="w-full bg-transparent text-center font-extrabold tabular-nums outline-none"
            style={{ color: 'var(--pk-gold-soft)', fontSize: 22 }}
            aria-label={t('bet.raise_to')}
          />
        </label>
        <button
          type="button"
          onClick={() => set(amount + step)}
          aria-label={t('bet.increase')}
          className="inline-flex items-center justify-center font-bold"
          style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(0,0,0,0.4)', color: 'var(--pk-text-hi)', border: '1px solid var(--pk-gold-line)' }}
        >
          +
        </button>
      </div>

      <BettingSlider min={minRaiseTo} max={maxRaiseTo} step={step} value={amount} onChange={set} />

      <div className="flex items-center gap-2">
        {presets.map((p) => (
          <PresetBetButton key={p.key} label={p.label} value={p.value} active={amount === p.value} onClick={() => set(p.value)} />
        ))}
        <PresetBetButton label={t('bet.all_in')} value={maxRaiseTo} active={isAllIn} onClick={() => set(maxRaiseTo)} />
      </div>

      <div className="flex items-center gap-2">
        {onCancel && (
          <ActionButton variant="neutral" label={t('bet.cancel')} onClick={onCancel} className="flex-1" />
        )}
        <ActionButton
          variant={isAllIn ? 'allin' : isOpen ? 'bet' : 'raise'}
          label={isAllIn ? t('action.all_in') : isOpen ? t('action.bet') : t('action.raise')}
          sublabel={isAllIn ? undefined : formatCoinsShort(amount)}
          onClick={() => onConfirm?.(amount)}
          className="flex-[2]"
        />
      </div>
      {isAllIn && (
        <p className="text-center text-[11.5px]" style={{ color: 'var(--pk-amber)' }}>
          {t('bet.all_in_confirm_hint')}
        </p>
      )}
    </div>
  )
}
