import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getMyLists } from './actions'
import ListsClient from './ListsClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('trips')
  return { title: t('lists_title'), description: t('lists_sub'), robots: { index: false } }
}

export default async function ListsPage() {
  const t = await getTranslations('trips')
  const { data: { user } } = await createClient().auth.getUser()

  return (
    <div className="max-w-[1100px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
        <h1 className="font-serif font-bold text-[clamp(26px,4vw,40px)] tracking-[-0.4px] text-ink">{t('lists_title')}</h1>
        <Link href="/plans" className="text-[13px] font-semibold text-teal hover:underline">{t('plans')} →</Link>
      </div>
      <p className="text-[15px] text-muted mb-7">{t('lists_sub')}</p>
      {!user ? (
        <div className="bg-cream border border-line rounded-2xl px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-[14px] text-ink">{t('sign_in_required')}</span>
          <Link href="/login" className="text-[13px] font-semibold px-4 py-2 rounded-full bg-rose text-white">{t('sign_in')}</Link>
        </div>
      ) : (
        <ListsClient lists={await getMyLists()} />
      )}
    </div>
  )
}
