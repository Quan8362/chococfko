import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import PokerShell from '../../_eco/PokerShell'
import HandReplay from './HandReplay'
import { fetchHandDetail } from '../../ecosystem'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: { handId: string } }) {
  const t = await getTranslations('games.poker')
  const res = await fetchHandDetail(params.handId)
  const n = res.ok ? res.detail.handNo : 0
  return { title: `${t('hand.title', { n })} · ${t('title')}` }
}

export default async function HandDetailPage({ params }: { params: { handId: string } }) {
  const res = await fetchHandDetail(params.handId)
  if (!res.ok) notFound()
  const t = await getTranslations('games.poker')

  return (
    <PokerShell>
      <div className="mb-4">
        <Link href="/games/poker/history" className="text-sm text-muted hover:text-ink">
          ← {t('nav.history')}
        </Link>
      </div>
      <HandReplay detail={res.detail} />
    </PokerShell>
  )
}
