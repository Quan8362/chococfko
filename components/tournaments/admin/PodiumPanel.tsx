'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { CompetitorRow, PodiumRowView } from '@/lib/tournaments/admin/types'

// Renders the championship podium (1st / 2nd / 3rd). Rank 3 may repeat for joint third (no
// third-place match). Shows a "not decided yet" state while the deciding matches are unfinished —
// the podium is computed and persisted by the server (calculatePodium), never guessed on the client.
export default function PodiumPanel({
  podium,
  competitors,
  isComplete,
}: {
  podium: PodiumRowView[]
  competitors: CompetitorRow[]
  isComplete: boolean
}) {
  const t = useTranslations('admin_podium')
  const nameOf = useMemo(() => {
    const map = new Map(competitors.map((c) => [c.id, c.name]))
    return (id: string) => map.get(id) ?? id
  }, [competitors])

  if (podium.length === 0) {
    return (
      <div className="bg-cream border border-line rounded-2xl py-10 px-6 text-center">
        <p className="text-[13.5px] text-ink font-medium mb-1">{t('pending_title')}</p>
        <p className="text-[12.5px] text-muted">{t('pending_hint')}</p>
      </div>
    )
  }

  const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉')
  const rankLabel = (rank: number, joint: boolean) =>
    joint ? t('rank_joint_third') : rank === 1 ? t('rank_first') : rank === 2 ? t('rank_second') : t('rank_third')

  return (
    <div>
      {!isComplete && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mb-3">
          <p className="text-[12.5px] text-amber-700">{t('partial_notice')}</p>
        </div>
      )}
      <ul className="space-y-2">
        {podium.map((p, i) => (
          <li
            key={`${p.rank}-${p.competitorId}-${i}`}
            className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
              p.rank === 1 ? 'bg-gold/10 border-gold/40' : 'bg-paper border-line'
            }`}
          >
            <span className="flex-none text-[22px]" aria-hidden>{medal(p.rank)}</span>
            <div className="min-w-0">
              <p className="text-[11.5px] font-semibold text-muted uppercase tracking-wide">{rankLabel(p.rank, p.isJoint)}</p>
              <p className="text-[15px] font-bold text-ink truncate">{nameOf(p.competitorId)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
