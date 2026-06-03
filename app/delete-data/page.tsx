import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('delete_data_page')
  const description = t('intro')
  return {
    title: t('title'),
    description,
    openGraph: { title: t('title'), description },
  }
}

const EMAIL = 'chococfko@gmail.com'

export default async function DeleteDataPage() {
  const t = await getTranslations('delete_data_page')

  return (
    <div className="min-h-[calc(100vh-160px)] py-16 px-6">
      <div className="max-w-[720px] mx-auto">

        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-rose transition-colors mb-10"
        >
          {t('back')}
        </Link>

        {/* Hero */}
        <div className="mb-10">
          <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[2.5px] uppercase text-rose mb-5 before:content-[''] before:w-5 before:h-px before:bg-rose/60 after:content-[''] after:w-5 after:h-px after:bg-rose/60">
            {t('label')}
          </span>
          <h1 className="font-serif font-black text-[clamp(26px,4vw,42px)] leading-[1.12] tracking-[-0.5px] text-ink mb-4">
            {t('heading')}
          </h1>
          <p className="text-[15.5px] text-muted leading-[1.75]">
            {t('intro')}
          </p>
        </div>

        {/* Content cards */}
        <div className="space-y-5">

          {/* Data we store */}
          <div className="bg-paper border border-line rounded-2xl p-6 shadow-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose/10 border border-rose/15 text-[18px] grid place-items-center flex-none">
                📋
              </div>
              <h2 className="font-serif font-bold text-[17px] text-ink">
                {t('s1_title')}
              </h2>
            </div>
            <p className="text-[14.5px] text-muted leading-[1.75] mb-3">
              {t('s1_intro')}
            </p>
            <ul className="space-y-1.5 text-[14px] text-muted">
              {(['s1_i1', 's1_i2', 's1_i3', 's1_i4', 's1_i5'] as const).map((key) => (
                <li key={key} className="flex items-start gap-2">
                  <span className="text-rose mt-0.5">•</span>
                  {t(key)}
                </li>
              ))}
            </ul>
          </div>

          {/* Purpose */}
          <div className="bg-paper border border-line rounded-2xl p-6 shadow-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose/10 border border-rose/15 text-[18px] grid place-items-center flex-none">
                🎯
              </div>
              <h2 className="font-serif font-bold text-[17px] text-ink">
                {t('s2_title')}
              </h2>
            </div>
            <ul className="space-y-1.5 text-[14px] text-muted">
              {(['s2_i1', 's2_i2', 's2_i3', 's2_i4'] as const).map((key) => (
                <li key={key} className="flex items-start gap-2">
                  <span className="text-rose mt-0.5">•</span>
                  {t(key)}
                </li>
              ))}
            </ul>
            <p className="text-[13.5px] text-muted mt-4 pt-4 border-t border-line">
              ✅ {t('s2_no_sell')}
            </p>
          </div>

          {/* How to request deletion */}
          <div className="bg-paper border border-line rounded-2xl p-6 shadow-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-rose/10 border border-rose/15 text-[18px] grid place-items-center flex-none">
                🗑️
              </div>
              <h2 className="font-serif font-bold text-[17px] text-ink">
                {t('s3_title')}
              </h2>
            </div>
            <p className="text-[14.5px] text-muted leading-[1.75] mb-4">
              {t('s3_intro')}
            </p>

            {/* Email highlight */}
            <a
              href={`mailto:${EMAIL}?subject=${encodeURIComponent(t('s3_e1_value'))}`}
              className="inline-flex items-center gap-2.5 bg-rose/5 border border-rose/25 rounded-xl px-4 py-3 text-rose font-semibold text-[15px] hover:bg-rose/10 transition-colors mb-5"
            >
              ✉️ {EMAIL}
            </a>

            <p className="text-[13.5px] font-semibold text-ink mb-2">
              {t('s3_email_hint')}
            </p>
            <ul className="space-y-1.5 text-[14px] text-muted">
              <li className="flex items-start gap-2">
                <span className="text-rose mt-0.5">•</span>
                <span>
                  <strong className="text-ink">{t('s3_e1_label')}</strong>{' '}
                  {t('s3_e1_value')}
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose mt-0.5">•</span>
                {t('s3_e2')}
              </li>
              <li className="flex items-start gap-2">
                <span className="text-rose mt-0.5">•</span>
                {t('s3_e3')}
              </li>
            </ul>

            <p className="text-[13.5px] text-muted mt-4 pt-4 border-t border-line leading-[1.7]">
              {t('s3_after')}
            </p>
          </div>

          {/* Warning */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex gap-3">
            <span className="text-[20px] flex-none mt-0.5">⚠️</span>
            <p className="text-[14px] text-amber-800 leading-[1.7]">
              {t('warning')}
            </p>
          </div>

        </div>

        {/* Footer note */}
        <p className="text-[12.5px] text-muted/70 text-center mt-10">
          {t('footer_note')}
        </p>

      </div>
    </div>
  )
}
