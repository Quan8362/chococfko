import { getTranslations } from 'next-intl/server'
import { LeaderboardClient } from './LeaderboardClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.jp60')
  return { title: `${t('lb_title')} · ${t('meta_title')}` }
}

export default function Page() {
  return <LeaderboardClient />
}
