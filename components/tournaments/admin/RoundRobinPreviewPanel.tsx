'use client'

import { useTranslations } from 'next-intl'
import { buildRoundRobinPreview } from '@/lib/tournaments/domain/group-preview'
import type { Competitor } from '@/lib/tournaments/domain/types'

// Read-only preview of the round-robin schedule that WOULD be generated, computed by the pure
// domain function (never a re-implemented algorithm). Deterministic. Rendered in a modal overlay.
export default function RoundRobinPreviewPanel({
  groups,
  nameOf,
  groupNameOf,
  onClose,
}: {
  // Ordered competitors per group (same order that will be generated).
  groups: { groupId: string; competitors: Competitor[] }[]
  nameOf: (competitorId: string) => string
  groupNameOf: (groupId: string) => string
  onClose: () => void
}) {
  const t = useTranslations('admin_round_robin_preview')
  const preview = buildRoundRobinPreview({ groups })

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[640px] max-h-[85vh] overflow-y-auto bg-paper border border-line rounded-2xl shadow-xl p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-serif font-bold text-[18px] text-ink leading-snug">{t('title')}</h3>
            <p className="text-[12.5px] text-muted mt-1">
              {t('summary', { groups: preview.totalGroups, matches: preview.totalMatches })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-none w-8 h-8 grid place-items-center rounded-full border border-line bg-cream text-muted hover:text-rose transition-colors"
            aria-label={t('close')}
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {preview.groups.map((g) => (
            <div key={g.groupId} className="border border-line rounded-xl overflow-hidden">
              <div className="bg-cream px-4 py-2 flex items-baseline justify-between gap-2 border-b border-line">
                <span className="font-serif font-bold text-[14px] text-ink">
                  {t('group', { name: groupNameOf(g.groupId) })}
                </span>
                <span className="text-[12px] text-muted">
                  {t('group_meta', { players: g.competitorCount, matches: g.matchCount })}
                </span>
              </div>
              <div className="p-3 space-y-2.5">
                {g.rounds.map((r) => (
                  <div key={r.roundNumber}>
                    <p className="text-[11.5px] font-semibold text-muted uppercase tracking-wide mb-1">
                      {t('round', { number: r.roundNumber })}
                    </p>
                    <ul className="space-y-1">
                      {r.matches.map((m) => (
                        <li
                          key={m.generationKey}
                          className="text-[13px] text-ink flex items-center gap-2 bg-cream/60 rounded-lg px-2.5 py-1.5"
                        >
                          <span className="flex-1 text-right truncate">{nameOf(m.competitorAId)}</span>
                          <span className="flex-none text-[11px] font-semibold text-muted px-1.5">
                            {t('vs')}
                          </span>
                          <span className="flex-1 truncate">{nameOf(m.competitorBId)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {g.rounds.length === 0 && <p className="text-[12.5px] text-muted">{t('no_matches')}</p>}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-5">
          <button
            type="button"
            onClick={onClose}
            className="font-semibold text-[13px] px-5 py-2 rounded-full border border-line bg-cream text-[#5c4d44] hover:bg-line/60 transition-colors"
          >
            {t('close')}
          </button>
        </div>
      </div>
    </div>
  )
}
