'use client'

import { useEffect, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { buildKnockoutPreview, type KnockoutPreviewSlot } from '@/lib/tournaments/domain/knockout-seed'

// Deterministic pre-generate preview of the bracket that would be built from the current seed order.
// Read-only; renders totals, per-round pairings (with BYE / to-be-decided markers) and the
// third-place placeholder. Built entirely from the pure engine (buildKnockoutPreview).
export default function KnockoutPreviewPanel({
  seededIds,
  thirdPlaceEnabled,
  nameOf,
  onClose,
}: {
  seededIds: string[]
  thirdPlaceEnabled: boolean
  nameOf: (id: string) => string
  onClose: () => void
}) {
  const t = useTranslations('admin_knockout_seeding')
  const tb = useTranslations('admin_knockout_bracket')
  const preview = useMemo(() => buildKnockoutPreview(seededIds, thirdPlaceEnabled), [seededIds, thirdPlaceEnabled])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const slotLabel = (s: KnockoutPreviewSlot): string => {
    switch (s.kind) {
      case 'competitor': return nameOf(s.competitorId)
      case 'bye': return tb('bye')
      case 'winner': return tb('winner_of')
      case 'loser': return tb('loser_of')
    }
  }
  const roundName = (label: string) => {
    const known = ['final', 'semifinal', 'quarterfinal', 'round_of_16', 'third_place']
    if (known.includes(label)) return tb(`label_${label}`)
    const m = /^round_(\d+)$/.exec(label)
    return m ? tb('label_generic', { n: m[1] }) : label
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('preview_title')}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[560px] max-h-[88vh] overflow-y-auto bg-paper border border-line rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="font-serif font-bold text-[17px] text-ink">{t('preview_title')}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('cancel')}
            className="flex-none w-8 h-8 grid place-items-center rounded-lg text-muted hover:text-ink hover:bg-cream transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-cream border border-line px-3 py-2.5 mb-4">
          <span className="text-[12.5px] text-muted">{t('total_competitors')}: <b className="text-ink">{preview.totalCompetitors}</b></span>
          <span className="text-[12.5px] text-muted">{t('bracket_size')}: <b className="text-ink">{preview.bracketSize}</b></span>
          <span className="text-[12.5px] text-muted">{t('bye_count')}: <b className="text-ink">{preview.byes}</b></span>
          <span className="text-[12.5px] text-muted">{tb('rounds')}: <b className="text-ink">{preview.roundCount}</b></span>
        </div>

        <div className="space-y-4">
          {preview.rounds.map((round) => (
            <div key={round.roundNumber}>
              <h4 className="text-[12.5px] font-bold text-teal mb-1.5">{roundName(round.label)}</h4>
              <ul className="space-y-1.5">
                {round.matches.map((m) => (
                  <li key={m.matchKey} className="flex items-center gap-2 rounded-lg bg-cream border border-line px-3 py-2">
                    <span className="flex-1 text-[13px] text-ink text-right truncate">{slotLabel(m.slotA)}</span>
                    <span className="flex-none text-[10.5px] text-muted px-1">{tb('vs')}</span>
                    <span className="flex-1 text-[13px] text-ink truncate">{slotLabel(m.slotB)}</span>
                    {m.isBye && <span className="flex-none text-[10px] font-bold text-teal">{tb('bye')}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {preview.thirdPlaceMatch && (
            <div>
              <h4 className="text-[12.5px] font-bold text-amber-600 mb-1.5">{tb('label_third_place')}</h4>
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                <span className="flex-1 text-[13px] text-ink text-right">{slotLabel(preview.thirdPlaceMatch.slotA)}</span>
                <span className="flex-none text-[10.5px] text-muted px-1">{tb('vs')}</span>
                <span className="flex-1 text-[13px] text-ink">{slotLabel(preview.thirdPlaceMatch.slotB)}</span>
              </div>
            </div>
          )}
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
