import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getJp60Settings } from '../../actions'
import { getJp60Challenge } from '../../social-actions'
import { ChallengeClient } from './ChallengeClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('games.jp60')
  return { title: `${t('challenge_title')} · ${t('meta_title')}` }
}

export default async function ChallengePage({ params }: { params: { code: string } }) {
  const t = await getTranslations('games.jp60')
  const [info, settings] = await Promise.all([getJp60Challenge(params.code), getJp60Settings()])

  if (!info) {
    return (
      <div className="max-w-[480px] mx-auto px-5 py-20 text-center">
        <p className="text-[15px] text-ink">{t('err_challenge_not_found')}</p>
      </div>
    )
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <ChallengeClient info={info} settings={settings} signedIn={!!user} />
}
