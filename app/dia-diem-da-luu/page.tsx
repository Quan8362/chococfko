import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import SavedPlacesClient from './SavedPlacesClient'

export async function generateMetadata() {
  const t = await getTranslations('saved_places_page')
  const description = t('sub')
  return {
    title: t('title'),
    description,
    openGraph: { title: t('title'), description },
    robots: { index: false },
  }
}

export default async function DiaDiemDaLuu() {
  const t = await getTranslations('saved_places_page')

  return (
    <div className="min-h-[calc(100vh-160px)] py-14 px-6">
      <div className="max-w-[1100px] mx-auto">

        {/* Breadcrumb */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-rose transition-colors mb-10"
        >
          {t('back')}
        </Link>

        {/* Header */}
        <div className="mb-10">
          <h1 className="font-serif font-black text-[clamp(28px,4vw,44px)] leading-[1.1] tracking-[-0.5px] text-ink mb-2">
            {t('heading')}{' '}
            <em className="italic text-rose not-italic">{t('heading_accent')}</em>
          </h1>
          <p className="text-[15px] text-muted">{t('sub')}</p>
        </div>

        <SavedPlacesClient
          emptyTitle={t('empty_title')}
          emptySub={t('empty_sub')}
          exploreCta={t('explore_cta')}
          detailLabel={t('detail')}
          unsaveLabel={t('unsave')}
        />

      </div>
    </div>
  )
}
