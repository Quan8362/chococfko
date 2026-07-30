'use client'

// Accessible tie-break ORDER editor (Prompt 15C-1 §12). Reorders a list of sporting tie-break tokens
// with Move up / Move down buttons (full keyboard operability — every control is a real <button>),
// adds remaining tokens from a <select>, and removes a token. It NEVER allows a duplicate token and
// NEVER silently drops one: tokens the runtime cannot evaluate automatically are kept and flagged
// with a visible "manual" warning (icon + text, not colour alone). Controlled component — the parent
// owns the value.

import { useTranslations } from 'next-intl'
import { ALL_TIE_BREAK_TOKENS, unsupportedTieBreakTokens, type TieBreakToken } from '@/lib/tournaments/rules'

export default function TieBreakOrderEditor({
  value,
  onChange,
  disabled = false,
  invalid = false,
}: {
  value: readonly TieBreakToken[]
  onChange: (next: TieBreakToken[]) => void
  disabled?: boolean
  invalid?: boolean
}) {
  const t = useTranslations('admin_rule_editor')
  const tokenLabel = (tok: TieBreakToken) => t(`tie_token_${tok}`)

  const remaining = ALL_TIE_BREAK_TOKENS.filter((tok) => !value.includes(tok))
  const manual = new Set(unsupportedTieBreakTokens(value))

  function move(index: number, delta: number) {
    const next = [...value]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }
  function add(tok: string) {
    if (!tok) return
    const token = tok as TieBreakToken
    if (value.includes(token) || !ALL_TIE_BREAK_TOKENS.includes(token)) return
    onChange([...value, token])
  }

  return (
    <div>
      <ol className="space-y-1.5" aria-label={t('tie_break_list_label')}>
        {value.map((tok, i) => {
          const isManual = manual.has(tok)
          return (
            <li
              key={tok}
              className="flex items-center gap-2 rounded-lg border border-line bg-cream/60 px-3 py-2"
            >
              <span className="flex-none w-5 text-[12px] font-semibold text-muted tabular-nums">{i + 1}.</span>
              <span className="flex-1 min-w-0 text-[13px] text-ink">
                {tokenLabel(tok)}
                {isManual && (
                  <span className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                    <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                      <path
                        fillRule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                    {t('tie_token_manual')}
                  </span>
                )}
              </span>
              <div className="flex-none flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(i, -1)}
                  disabled={disabled || i === 0}
                  aria-label={t('tie_move_up', { token: tokenLabel(tok) })}
                  className="w-7 h-7 grid place-items-center rounded-md border border-line text-muted hover:text-ink hover:border-ink/30 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => move(i, 1)}
                  disabled={disabled || i === value.length - 1}
                  aria-label={t('tie_move_down', { token: tokenLabel(tok) })}
                  className="w-7 h-7 grid place-items-center rounded-md border border-line text-muted hover:text-ink hover:border-ink/30 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  disabled={disabled || value.length <= 1}
                  aria-label={t('tie_remove', { token: tokenLabel(tok) })}
                  className="w-7 h-7 grid place-items-center rounded-md border border-line text-muted hover:text-rose hover:border-rose/30 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </li>
          )
        })}
      </ol>

      {invalid && (
        <p className="mt-1.5 text-[12px] text-rose" role="alert">
          {t('tie_break_invalid')}
        </p>
      )}

      {remaining.length > 0 && !disabled && (
        <div className="mt-2 flex items-center gap-2">
          <label htmlFor="tie-add" className="text-[12px] text-muted">
            {t('tie_add_label')}
          </label>
          <select
            id="tie-add"
            value=""
            onChange={(e) => {
              add(e.target.value)
              e.currentTarget.value = ''
            }}
            className="text-[12.5px] rounded-md border border-line bg-paper px-2 py-1.5 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
          >
            <option value="">{t('tie_add_placeholder')}</option>
            {remaining.map((tok) => (
              <option key={tok} value={tok}>
                {tokenLabel(tok)}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}
