'use client'

import { useTranslations } from 'next-intl'
import type { PublicBracket } from '@/lib/tournaments/public/types'
import type { PodiumRowView } from '@/lib/tournaments/admin/types'
import { isJointThird, orderPodiumRows } from '@/lib/tournaments/public/podiumView'
import TruncatedName from './TruncatedName'
import EmptyState from './EmptyState'

// Public podium ("Thành tích"). Each knockout branch is one SELF-CONTAINED column — Serie A
// (championship) on the left, Serie B (consolation) on the right on desktop/tablet, stacked on mobile.
// Inside a column the placements run TOP→BOTTOM by rank (gold, silver, bronze[, bronze]); the two
// branches never share a card. Data & ranks come from the domain calculator — this is presentation
// only.

type RankMeta = { medal: string; badge: string; ring: string; bg: string }

// Rank hierarchy is carried by THREE independent cues (never colour alone): the medal glyph, the text
// label rendered per item, and the border/background weight below. Rank 1 gets a heavier border; the
// palette stays soft (no strong gradients) and both series use the identical scale so neither looks
// more important than the other.
const RANK_META: Record<number, RankMeta> = {
  1: { medal: '🥇', badge: 'bg-[#f4d67a]', ring: 'border-2 border-[#e3b23c]', bg: 'bg-[#fdf6e3]' },
  2: { medal: '🥈', badge: 'bg-[#dfe2e7]', ring: 'border border-[#c3c7cf]', bg: 'bg-[#f4f5f7]' },
  3: { medal: '🥉', badge: 'bg-[#ecd3bb]', ring: 'border border-[#d9b28a]', bg: 'bg-[#fbf1e8]' },
}

function PodiumPlacementItem({
  row,
  label,
  name,
}: {
  row: PodiumRowView
  label: string
  name: string
}) {
  const meta = RANK_META[row.rank] ?? RANK_META[3]
  return (
    <li className={`flex items-center gap-3 rounded-2xl ${meta.ring} ${meta.bg} px-3.5 py-2.5`}>
      <span
        aria-hidden="true"
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${meta.badge} text-lg`}
      >
        {meta.medal}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted">{label}</p>
        {/* Mobile + tablet (< lg): show the FULL name, wrapping onto as many lines as needed — the
            card grows to fit and nothing is clipped. Desktop (lg+) keeps the single-line truncated
            label with its hover/focus tooltip so the two half-width columns stay tidy. */}
        <span className="block text-[13.5px] font-semibold leading-snug text-ink break-words lg:hidden">
          {name}
        </span>
        <TruncatedName
          name={name}
          className="hidden text-[13.5px] font-semibold text-ink lg:block"
        />
      </div>
    </li>
  )
}

function PodiumSerieColumn({
  bracket,
  title,
  nameOf,
  labelFor,
}: {
  bracket: PublicBracket
  title: string
  nameOf: (id: string | null) => string
  labelFor: (row: PodiumRowView, joint: boolean) => string
}) {
  const rows = orderPodiumRows(bracket.podium)
  const joint = isJointThird(bracket.podium)
  return (
    <section className="rounded-3xl border border-line bg-paper shadow-card p-5 sm:p-6">
      <h3 className="mb-3.5 flex items-center gap-2 font-serif text-[16px] font-bold text-ink">
        <span aria-hidden className="h-4 w-1 rounded-full bg-gold" />
        {title}
      </h3>
      <ol className="list-none space-y-2.5">
        {rows.map((row, i) => (
          <PodiumPlacementItem
            key={`${row.rank}-${row.competitorId}-${i}`}
            row={row}
            label={labelFor(row, joint)}
            name={nameOf(row.competitorId)}
          />
        ))}
      </ol>
    </section>
  )
}

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

  const labelFor = (row: PodiumRowView, joint: boolean) => {
    if (row.rank === 1) return t('podium.first')
    if (row.rank === 2) return t('podium.second')
    return joint ? t('podium.joint_third') : t('podium.third')
  }

  // Two balanced, top-aligned columns from tablet up (Serie A left, Serie B right); a single serie
  // spans one column at full width instead of a lonely half-width card.
  const cols = withPodium.length > 1 ? 'md:grid-cols-2' : 'md:grid-cols-1'

  return (
    <div className={`grid grid-cols-1 ${cols} items-start gap-5`}>
      {withPodium.map((b) => (
        <PodiumSerieColumn
          key={b.bracket}
          bracket={b}
          title={t(`podium.${b.bracket}`)}
          nameOf={nameOf}
          labelFor={labelFor}
        />
      ))}
    </div>
  )
}
