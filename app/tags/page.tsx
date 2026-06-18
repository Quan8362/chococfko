import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { createPublicClient } from '@/lib/supabase/public'
import { getPopularTags } from '@/lib/tags'
import { SITE_URL, SITE_NAME } from '@/lib/seo'
import TagList from '@/components/tags/TagList'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('tags')
  return {
    title: `${t('browse')} | ${SITE_NAME}`,
    description: t('browseSub'),
    alternates: { canonical: `${SITE_URL}/tags` },
  }
}

export default async function TagsIndexPage() {
  const [t, tags] = await Promise.all([
    getTranslations('tags'),
    getPopularTags(createClient(), 120),
  ])

  return (
    <div className="max-w-[900px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <h1 className="font-serif font-black text-[clamp(26px,4vw,40px)] tracking-[-0.5px] text-ink mb-1.5">
        {t('browse')}
      </h1>
      <p className="text-[14px] text-muted mb-7">{t('browseSub')}</p>

      {tags.length === 0 ? (
        <div className="bg-paper border border-dashed border-line rounded-2xl p-10 text-center">
          <p className="text-[15px] text-muted">{t('noTags')}</p>
        </div>
      ) : (
        <div className="bg-paper border border-line rounded-2xl p-6">
          <TagList tags={tags} />
        </div>
      )}
    </div>
  )
}
