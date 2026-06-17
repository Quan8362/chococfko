import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('privacy_policy')
  return {
    title: t('title'),
    description: t('description'),
    openGraph: { title: t('title'), description: t('description') },
  }
}

const EMAIL = 'chococfko@gmail.com'

const SECTIONS = [
  { key: 's1', icon: '🔒' },
  { key: 's2', icon: '📋' },
  { key: 's3', icon: '🎯' },
  { key: 's4', icon: '🚫' },
  { key: 's5', icon: '👥' },
  { key: 's6', icon: '📝' },
] as const

export default async function PrivacyPolicyPage() {
  const t = await getTranslations('privacy_policy')

  return (
    <div className="min-h-[calc(100vh-160px)] py-16 px-6">
      <div className="max-w-[780px] mx-auto">

        {/* Back link */}
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
          <h1 className="font-serif font-black text-[clamp(28px,4.5vw,50px)] leading-[1.1] tracking-[-0.5px] text-ink mb-4">
            {t('heading')}{' '}
            <em className="italic text-rose not-italic">{t('heading_accent')}</em>
          </h1>
          <p className="text-[16px] text-muted leading-[1.75] max-w-[560px]">
            {t('sub')}
          </p>
        </div>

        {/* Policy cards */}
        <div className="space-y-5">
          {SECTIONS.map(({ key, icon }) => (
            <div
              key={key}
              className="flex gap-5 bg-paper border border-line rounded-2xl p-6 shadow-card"
            >
              <div className="flex-none w-11 h-11 rounded-xl bg-rose/10 border border-rose/15 text-[18px] grid place-items-center">
                {icon}
              </div>
              <div>
                <h2 className="font-serif font-bold text-[17px] text-ink mb-2">
                  {t(`${key}_title` as Parameters<typeof t>[0])}
                </h2>
                <p className="text-[14.5px] text-muted leading-[1.7]">
                  {t(`${key}_body` as Parameters<typeof t>[0])}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Delete data section */}
        <div className="mt-6 flex gap-5 bg-paper border border-line rounded-2xl p-6 shadow-card">
          <div className="flex-none w-11 h-11 rounded-xl bg-rose/10 border border-rose/15 text-[18px] grid place-items-center">
            🗑️
          </div>
          <div>
            <h2 className="font-serif font-bold text-[17px] text-ink mb-2">
              {t('delete_title')}
            </h2>
            <p className="text-[14.5px] text-muted leading-[1.7] mb-4">
              {t('delete_body')}
            </p>
            <a
              href={`mailto:${EMAIL}?subject=${encodeURIComponent('Yêu cầu xóa dữ liệu chococfko')}`}
              className="inline-flex items-center gap-2 bg-rose/5 border border-rose/25 rounded-xl px-4 py-2.5 text-rose font-semibold text-[14px] hover:bg-rose/10 transition-colors mb-4"
            >
              ✉️ {EMAIL}
            </a>
            <p className="text-[13.5px] text-muted leading-[1.7]">
              {t('delete_or')}{' '}
              <Link href="/delete-data" className="text-rose hover:underline font-medium">
                {t('delete_link')}
              </Link>
            </p>
          </div>
        </div>

        {/* Contact section */}
        <div className="mt-10 bg-rose/5 border border-rose/20 rounded-2xl p-6 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[13.5px] text-muted">
            {t('contact_note')}{' '}
            <a href={`mailto:${EMAIL}`} className="text-rose hover:underline">
              {EMAIL}
            </a>
          </p>
          <Link
            href="/contact"
            className="flex-none font-semibold text-[13px] px-5 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-colors"
          >
            {t('contact_link')}
          </Link>
        </div>

        <p className="text-[12px] text-muted/60 text-center mt-8">
          {t('footer_note')}
        </p>

      </div>
    </div>
  )
}
