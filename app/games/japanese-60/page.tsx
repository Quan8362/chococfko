import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { tokyoDateString } from '@/lib/games/jp60/time'
import { getJp60Settings } from './actions'
import { Jp60Game } from './Jp60Game'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.jp60')
  return { title: `${t('meta_title')} · Mini Game · Chợ Cóc FKO` }
}

export default async function Jp60Page() {
  const settings = await getJp60Settings()
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Which daily levels has this user already completed today (Tokyo)?
  const dailyDone: Record<string, boolean> = {}
  if (user) {
    try {
      const admin = createAdminClient()
      const { data } = await admin
        .from('jp60_daily_participation')
        .select('level')
        .eq('user_id', user.id)
        .eq('daily_date', tokyoDateString())
      for (const r of (data ?? []) as { level: string }[]) dailyDone[r.level] = true
    } catch { /* migration may be pending */ }
  }

  return <Jp60Game settings={settings} signedIn={!!user} dailyDone={dailyDone} />
}
