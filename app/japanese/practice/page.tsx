import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import PracticeClient from '@/components/japanese/PracticeClient'
import {
  getPracticeAvailability,
  getRecentPracticeSessions,
  getWeakAreas,
} from '@/app/japanese/practice-actions'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('japanese')
  return {
    title: `${t('quiz_heading')} · ${t('page_heading')}`,
  }
}

export default async function PracticePage() {
  const t = await getTranslations('japanese')
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [availability, recentSessions, weakAreas] = await Promise.all([
    getPracticeAvailability(),
    user ? getRecentPracticeSessions() : Promise.resolve([]),
    user ? getWeakAreas() : Promise.resolve([]),
  ])

  return (
    <div className="max-w-[1040px] mx-auto px-5 sm:px-6 py-10 pb-20">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-7 flex-wrap">
        <Link href="/japanese" className="hover:text-rose transition-colors">
          {t('page_heading')}
        </Link>
        <span>/</span>
        <span className="text-ink">{t('quiz_heading')}</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          {t('page_heading')}
        </span>
        <h1 className="font-serif font-bold text-[clamp(24px,4vw,36px)] leading-tight tracking-[-0.4px] text-ink mb-2">
          {t('quiz_heading')}
        </h1>
        <p className="text-[14px] text-muted">{t('practice_subtitle')}</p>
      </div>

      <PracticeClient
        isLoggedIn={!!user}
        availability={availability}
        recentSessions={recentSessions}
        weakAreas={weakAreas}
      />
    </div>
  )
}
