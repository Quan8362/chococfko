'use client'

import { useTranslations } from 'next-intl'
import type { PublicBracket } from '@/lib/tournaments/public/types'
import EmptyState from './EmptyState'

// Podium per branch (championship + optional consolation). Shown only when a branch has a computed
// podium; joint third places (no third-place match) render side by side. Championship and consolation
// are never mixed.
export default function PublicPodium({
  brackets,
  nameOf,
}: {
  brackets: PublicBracket[]
  nameOf: (id: string | null) => string
}) {
  const t = useTranslations('tournaments')
  const withPodium = brackets.filter((b) => b.podium.length > 0)

  if (withPodium.length === 0) {
    return <EmptyState title={t('empty.no_podium')} hint={t('empty.no_podium_hint')} />
  }

  const RANK_META: Record<number, { label: string; ring: string; bg: string; medal: string }> = {
    1: { label: t('podium.first'), ring: 'border-[#e3b23c]', bg: 'bg-[#fdf6e3]', medal: '🥇' },
    2: { label: t('podium.second'), ring: 'border-[#b8bcc4]', bg: 'bg-[#f4f5f7]', medal: '🥈' },
    3: { label: t('podium.third'), ring: 'border-[#cd9b6a]', bg: 'bg-[#fbf1e8]', medal: '🥉' },
  }

  return (
    <div className="space-y-7">
      {withPodium.map((b) => {
        const thirds = b.podium.filter((p) => p.rank === 3)
        const isJointThird = thirds.length > 1 || thirds.some((p) => p.isJoint)
        return (
          <div key={b.bracket}>
            <h3 className="text-[14px] font-bold text-ink mb-3">{t(`podium.${b.bracket}`)}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {b.podium.map((p, i) => {
                const meta = RANK_META[p.rank]
                return (
                  <div
                    key={`${p.rank}-${p.competitorId}-${i}`}
                    className={`rounded-2xl border-2 ${meta.ring} ${meta.bg} p-4 text-center`}
                  >
                    <div className="text-2xl mb-1" aria-hidden="true">{meta.medal}</div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-muted mb-1">
                      {p.rank === 3 && isJointThird ? t('podium.joint_third') : meta.label}
                    </p>
                    <p className="text-[14px] font-semibold text-ink break-words">{nameOf(p.competitorId)}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
