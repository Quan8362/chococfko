import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'
import { getPopularTags } from '@/lib/tags'
import ListingForm from '../ListingForm'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('marketplace')
  return { title: `${t('create_title')} · Chợ Cóc FKO` }
}

export default async function CreateListingPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [t, popularTags] = await Promise.all([
    getTranslations('marketplace'),
    getPopularTags(createPublicClient(), 12).then((tags) => tags.map((tag) => tag.name)),
  ])

  return (
    <div className="max-w-[760px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <Link href="/marketplace" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-rose transition-colors mb-6">
        ← {t('back_to_market')}
      </Link>
      <h1 className="font-serif font-bold text-[28px] sm:text-[34px] tracking-[-0.5px] text-ink mb-1.5">{t('create_title')}</h1>
      <p className="text-[14px] text-muted mb-8">{t('create_subtitle')}</p>

      <ListingForm userId={user.id} popularTags={popularTags} />
    </div>
  )
}
