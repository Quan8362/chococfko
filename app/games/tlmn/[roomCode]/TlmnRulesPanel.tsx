'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import {
  DEFAULT_RULES, resolveRules,
  type HostRulesOverride, type HostConfigurableKey,
} from '@/lib/games/tlmn/engine'
import { updateRules } from '../actions'
import { TlmnSettings, TlmnReset } from '../icons'

// Host rule-config panel (lobby only). Every control is pre-filled with the full
// DEFAULT_RULES; the host's edits are diffed back to a PARTIAL override (only the
// changed fields) and persisted via updateRules — an untouched panel stores {} so
// the room runs the complete ruleset. Non-hosts see it read-only, live-synced
// through the room.settings realtime stream.

const TOGGLE_KEYS = [
  'toiTrangEnabled', 'thoiHeoEnabled', 'thoiBomEnabled', 'congEnabled', 'denEnabled',
] as const
const NUMBER_KEYS = [
  'basePerCard', 'thoiHeoMultiplier', 'thoiBomPenalty', 'congMultiplier',
  'denHeo', 'denBom', 'toiTrangPayout', 'turnSeconds',
] as const

type Props = {
  roomId: string
  isHost: boolean
  override: HostRulesOverride | undefined
  disabled?: boolean // locked once the game starts
}

export default function TlmnRulesPanel({ roomId, isHost, override, disabled }: Props) {
  const t = useTranslations('games.tlmn')
  const [isPending, startTransition] = useTransition()
  const effective = resolveRules(override)
  const readOnly = !isHost || !!disabled || isPending

  // Recompute the full ruleset with one field changed, diff vs defaults → partial.
  const commit = (key: HostConfigurableKey, value: number | boolean) => {
    const next = { ...effective, [key]: value }
    const partial: Record<string, number | boolean> = {}
    for (const k of [...TOGGLE_KEYS, ...NUMBER_KEYS] as HostConfigurableKey[]) {
      if (next[k] !== DEFAULT_RULES[k]) partial[k] = next[k] as number | boolean
    }
    const isEmpty = Object.keys(partial).length === 0
    startTransition(async () => {
      await updateRules(roomId, isEmpty ? null : (partial as HostRulesOverride))
    })
  }

  const reset = () => startTransition(async () => { await updateRules(roomId, null) })

  const isCustom = !!override && Object.keys(override).length > 0

  return (
    <div className="tl-panel p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--tl-red)] uppercase tracking-[1.5px]">
          <TlmnSettings className="w-4 h-4" /> {t('settings_heading')}
        </p>
        {isHost && !disabled && isCustom && (
          <button
            type="button"
            onClick={reset}
            disabled={isPending}
            className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[var(--tl-red)] hover:underline disabled:opacity-50"
          >
            <TlmnReset className="w-3.5 h-3.5" /> {t('rules_reset')}
          </button>
        )}
      </div>

      {/* On/off toggles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
        {TOGGLE_KEYS.map(key => (
          <label
            key={key}
            className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[12.5px] transition-colors ${
              effective[key] ? 'border-[var(--tl-gold)]/50 bg-[var(--tl-gold)]/10' : 'border-[var(--tl-cream-line)] bg-white/40'
            } ${readOnly ? 'opacity-90' : 'cursor-pointer'}`}
          >
            <span className="font-semibold text-[var(--tl-text)]">{t(`rule_${key}` as Parameters<typeof t>[0])}</span>
            <input
              type="checkbox"
              checked={!!effective[key]}
              disabled={readOnly}
              onChange={e => commit(key, e.target.checked)}
              className="tl-check w-4 h-4 disabled:cursor-not-allowed"
            />
          </label>
        ))}
      </div>

      {/* Numeric amounts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {NUMBER_KEYS.map(key => (
          <label key={key} className="flex flex-col gap-1">
            <span className="text-[10.5px] font-semibold text-[var(--tl-text-soft)] leading-tight">
              {t(`rule_${key}` as Parameters<typeof t>[0])}
            </span>
            <input
              type="number"
              min={key === 'turnSeconds' ? 5 : 0}
              value={effective[key]}
              disabled={readOnly}
              onChange={e => {
                const v = Number(e.target.value)
                if (Number.isFinite(v) && v >= 0) commit(key, v)
              }}
              className="w-full rounded-lg border border-[var(--tl-cream-line)] bg-white px-2 py-1.5 text-[13px] font-mono text-[var(--tl-text)] disabled:bg-black/5 disabled:text-[var(--tl-text-soft)] disabled:cursor-not-allowed focus:border-[var(--tl-gold)] focus:ring-2 focus:ring-[var(--tl-gold)]/20 focus:outline-none transition-all"
            />
          </label>
        ))}
      </div>

      {!isHost && (
        <p className="text-[11.5px] text-[var(--tl-text-soft)]/70 mt-2.5">{t('settings_host_only')}</p>
      )}
      {disabled && isHost && (
        <p className="text-[11.5px] text-[var(--tl-text-soft)]/70 mt-2.5">{t('settings_locked')}</p>
      )}
    </div>
  )
}
