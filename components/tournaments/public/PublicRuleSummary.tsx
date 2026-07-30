'use client'

// PUBLIC (Guest) scoring-rules summary for the tournament detail page (Prompt 15C-2 §4/§5). Renders
// ONLY the public-safe projection returned by the tournament_public_event_rule_summary RPC — no
// internal fields (no snapshot/preset id, no version, no requires_configuration internals, no actor,
// no audit). When the event has no snapshot it shows the "system default rules" notice instead of a
// half-empty card. Pure presentational: it receives the already-fetched summary and never fetches.

import { useTranslations } from 'next-intl'
import type { PublicEventRuleSummary } from '@/lib/tournaments/rules'

const KNOWN_CATEGORIES = ['beginner', 'standard']
const KNOWN_TIE_TOKENS = [
  'table_points',
  'point_difference',
  'points_for',
  'head_to_head',
  'organizer_decision',
  'random_draw',
]

export default function PublicRuleSummary({ summary }: { summary: PublicEventRuleSummary | null }) {
  const t = useTranslations('tournaments')

  // Legacy / no snapshot → the event runs on the system default rules (§5). We never auto-create a
  // snapshot; we just say so plainly.
  if (!summary) {
    return (
      <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
        <h2 className="font-serif font-bold text-[16px] text-ink mb-1">{t('rules.heading')}</h2>
        <p className="text-[13px] text-muted">{t('rules.default_notice')}</p>
      </div>
    )
  }

  const sourceLabel = summary.presetLabel ? t('rules.source_preset') : t('rules.source_custom')
  const categoryLabel = summary.category
    ? KNOWN_CATEGORIES.includes(summary.category)
      ? t(`rules.category_${summary.category}`)
      : summary.category
    : null
  const cap = (c: number | null) => (c === null ? t('rules.no_cap') : String(c))

  return (
    <div className="rounded-2xl border border-line bg-paper p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="font-serif font-bold text-[16px] text-ink mr-1">{t('rules.heading')}</h2>
        <span className="text-[11.5px] font-semibold rounded-full bg-teal-soft text-teal px-2.5 py-0.5">
          {sourceLabel}
        </span>
        {summary.presetLabel && (
          <span className="text-[12px] font-medium text-ink">{summary.presetLabel}</span>
        )}
        {categoryLabel && (
          <span className="text-[11.5px] rounded-full bg-cream px-2.5 py-0.5 text-ink">{categoryLabel}</span>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <RuleColumn heading={t('rules.group_heading')} rule={summary.group} t={t} cap={cap} />
        <RuleColumn heading={t('rules.knockout_heading')} rule={summary.knockout} t={t} cap={cap} />
      </div>

      {/* Tie-break order (group ranking) */}
      {summary.tieBreakOrder.length > 0 && (
        <div className="mt-5 border-t border-line/60 pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">
            {t('rules.tie_break_heading')}
          </p>
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-ink">
            {summary.tieBreakOrder.map((tok, i) => (
              <li key={tok} className="flex items-center gap-1.5">
                <span className="rounded-md bg-cream px-2 py-0.5">{tieTokenLabel(t, tok)}</span>
                {i < summary.tieBreakOrder.length - 1 && <span className="text-muted" aria-hidden>→</span>}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Handicap: on → still pending organizer configuration (Prompt 15D); off → not applied. Guests
          never see the internal acknowledgment metadata. */}
      <div className="mt-5 border-t border-line/60 pt-4 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t('rules.handicap_heading')}</span>
        {summary.handicapEnabled ? (
          <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-amber-800">
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            {t('rules.handicap_on_pending')}
          </span>
        ) : (
          <span className="text-[12.5px] font-medium text-ink">{t('rules.handicap_off')}</span>
        )}
      </div>
    </div>
  )
}

function RuleColumn({
  heading,
  rule,
  t,
  cap,
}: {
  heading: string
  rule: PublicEventRuleSummary['group']
  t: ReturnType<typeof useTranslations>
  cap: (c: number | null) => string
}) {
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-line/40 last:border-b-0">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="text-[13px] font-medium text-ink tabular-nums">{value}</span>
    </div>
  )
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1.5">{heading}</p>
      {row(t('rules.points_to_win'), rule.pointsToWin)}
      {row(t('rules.win_by'), rule.winBy)}
      {row(t('rules.points_cap'), cap(rule.pointsCap))}
    </div>
  )
}

function tieTokenLabel(t: ReturnType<typeof useTranslations>, token: string): string {
  // Every recognized token has a public label; an unrecognized (future) one falls back to its raw key
  // rather than surfacing a missing-message error (the summary is best-effort, never breaks the page).
  return KNOWN_TIE_TOKENS.includes(token) ? t(`rules.tie_token.${token}`) : token
}
