import Link from 'next/link'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { SITE_URL } from '@/lib/japanese/seo'
import ImageTranslateClient from '@/components/japanese/ImageTranslateClient'

const PATH = '/japanese/image-translate'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('japanese')
  const title = t('it_seo_title')
  const description = t('it_seo_desc')
  const url = `${SITE_URL}${PATH}`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

export default async function ImageTranslatePage() {
  const t = await getTranslations('japanese')

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('page_heading'), item: `${SITE_URL}/japanese` },
      { '@type': 'ListItem', position: 2, name: t('it_title'), item: `${SITE_URL}${PATH}` },
    ],
  }

  return (
    <div className="max-w-[1040px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8 flex-wrap">
        <Link href="/japanese" className="hover:text-rose transition-colors">{t('page_heading')}</Link>
        <span>/</span>
        <span className="text-ink">{t('it_title')}</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          {t('it_title')}
        </span>
        <h1 className="font-serif font-bold text-[clamp(24px,4vw,36px)] leading-tight tracking-[-0.4px] text-ink mb-2">
          {t('it_seo_title')}
        </h1>
        <p className="text-[14px] text-muted max-w-[640px]">{t('it_seo_desc')}</p>
      </div>

      <ImageTranslateClient />
    </div>
  )
}
