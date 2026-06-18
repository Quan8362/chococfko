import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'
import { isUuid } from '@/lib/marketplace'
import { getListingById } from '@/lib/marketplace-data'
import { getPopularTags, getTagsForContent } from '@/lib/tags'
import ListingForm from '../../ListingForm'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('marketplace')
  return { title: `${t('edit_title')} · Chợ Cóc FKO` }
}

export default async function EditListingPage({ params }: { params: { id: string } }) {
  if (!isUuid(params.id)) notFound()
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [t, listing, popularTags, currentTags] = await Promise.all([
    getTranslations('marketplace'),
    getListingById(params.id),
    getPopularTags(createPublicClient(), 12).then((tags) => tags.map((tag) => tag.name)),
    getTagsForContent(supabase, 'listing', params.id).then((tags) => tags.map((tag) => tag.name)),
  ])
  if (!listing) notFound()
  if (listing.user_id !== user.id) redirect(`/marketplace/${params.id}`)

  return (
    <div className="max-w-[760px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <Link href="/marketplace/mine" className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-rose transition-colors mb-6">
        ← {t('my_listings')}
      </Link>
      <h1 className="font-serif font-bold text-[28px] sm:text-[34px] tracking-[-0.5px] text-ink mb-1.5">{t('edit_title')}</h1>
      <p className="text-[14px] text-muted mb-8">{t('edit_subtitle')}</p>

      <ListingForm userId={user.id} listing={listing} popularTags={popularTags} defaultTags={currentTags} />
    </div>
  )
}
