import Link from 'next/link'
import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { SITE_URL } from '@/lib/japanese/seo'
import HandwritingCanvas from '@/components/japanese/HandwritingCanvas'

const PATH = '/japanese/handwriting'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('japanese')
  const title = t('hw_seo_title')
  const description = t('hw_seo_desc')
  const url = `${SITE_URL}${PATH}`
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website' },
    twitter: { card: 'summary', title, description },
  }
}

export default async function HandwritingPage() {
  const t = await getTranslations('japanese')

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('page_heading'), item: `${SITE_URL}/japanese` },
      { '@type': 'ListItem', position: 2, name: t('hw_title'), item: `${SITE_URL}${PATH}` },
    ],
  }

  return (
    <div className="max-w-[760px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8 flex-wrap">
        <Link href="/japanese" className="hover:text-rose transition-colors">{t('page_heading')}</Link>
        <span>/</span>
        <Link href="/japanese/dictionary" className="hover:text-rose transition-colors">{t('dictionary')}</Link>
        <span>/</span>
        <span className="text-ink">{t('hw_title')}</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          {t('hw_title')}
        </span>
        <h1 className="font-serif font-bold text-[clamp(24px,4vw,36px)] leading-tight tracking-[-0.4px] text-ink mb-2">
          {t('hw_seo_title')}
        </h1>
        <p className="text-[14px] text-muted">{t('hw_seo_desc')}</p>
      </div>

      <div className="bg-paper border border-line rounded-2xl p-5 sm:p-6">
        <HandwritingCanvas />
      </div>
    </div>
  )
}
