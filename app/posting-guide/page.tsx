import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('writing_guide')
  const description = t('intro')
  return {
    title: t('title'),
    description,
    openGraph: { title: t('title'), description },
  }
}

const STEPS = ['s1', 's2', 's3', 's4', 's5'] as const
const ICONS = ['📍', '📷', '💬', '💰', '✅']

export default async function HuongDanVietBai() {
  const t = await getTranslations('writing_guide')

  return (
    <div className="min-h-[calc(100vh-160px)] py-16 px-6">
      <div className="max-w-[780px] mx-auto">

        {/* Breadcrumb */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-rose transition-colors mb-10"
        >
          {t('back')}
        </Link>

        {/* Hero */}
        <div className="mb-12">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[2.5px] uppercase text-rose mb-5 before:content-[''] before:w-5 before:h-px before:bg-rose/60 after:content-[''] after:w-5 after:h-px after:bg-rose/60">
            {t('label')}
          </span>
          <h1 className="font-serif font-black text-[clamp(30px,4.5vw,52px)] leading-[1.1] tracking-[-0.5px] text-ink mb-4">
            {t('heading')}{' '}
            <em className="italic text-rose not-italic">{t('heading_accent')}</em>
          </h1>
          <p className="text-[16.5px] text-muted leading-[1.75] max-w-[560px]">
            {t('intro')}
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-5 mb-12">
          {STEPS.map((key, i) => (
            <div
              key={key}
              className="flex gap-5 bg-paper border border-line rounded-2xl p-6 shadow-card hover:border-rose/30 transition-colors"
            >
              <div className="flex-none w-11 h-11 rounded-xl bg-rose/10 border border-rose/15 text-[20px] grid place-items-center">
                {ICONS[i]}
              </div>
              <div>
                <h2 className="font-serif font-bold text-[17px] text-ink mb-1.5">
                  {t(`${key}_title` as Parameters<typeof t>[0])}
                </h2>
                <p className="text-[14.5px] text-muted leading-[1.7]">
                  {t(`${key}_desc` as Parameters<typeof t>[0])}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center bg-rose/5 border border-rose/20 rounded-2xl py-10 px-6">
          <p className="font-serif text-[19px] font-bold text-ink mb-5">
            {t('heading')} {t('heading_accent')}?
          </p>
          <Link
            href="/community/write"
            className="inline-flex items-center gap-2 font-semibold text-[14.5px] px-8 py-3.5 rounded-full bg-rose text-white shadow-[0_6px_20px_-6px_rgba(194,24,91,0.5)] hover:bg-rose-deep hover:-translate-y-0.5 transition-all"
          >
            {t('cta')}
          </Link>
        </div>

      </div>
    </div>
  )
}
