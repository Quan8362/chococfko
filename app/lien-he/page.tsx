import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

export async function generateMetadata() {
  const t = await getTranslations('contact_page')
  const description = t('intro')
  return {
    title: t('title'),
    description,
    openGraph: { title: t('title'), description },
  }
}

export default async function LienHe() {
  const t = await getTranslations('contact_page')

  return (
    <div className="min-h-[calc(100vh-160px)] py-16 px-6">
      <div className="max-w-[700px] mx-auto">

        {/* Breadcrumb */}
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
          <h1 className="font-serif font-black text-[clamp(28px,4vw,46px)] leading-[1.1] tracking-[-0.5px] text-ink mb-3">
            {t('heading')}{' '}
            <em className="italic text-rose not-italic">{t('heading_accent')}</em>
          </h1>
          <p className="text-[15.5px] text-muted leading-[1.7]">
            {t('intro')}
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-5 mb-8">
          {/* About card */}
          <div className="sm:col-span-2 bg-paper border border-line rounded-2xl p-6 shadow-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose/10 border border-rose/15 text-[18px] grid place-items-center">
                🏪
              </div>
              <h2 className="font-serif font-bold text-[17px] text-ink">
                {t('about_title')}
              </h2>
            </div>
            <p className="text-[14.5px] text-muted leading-[1.7]">
              {t('about_desc')}
            </p>
          </div>

          {/* Email card */}
          <div className="bg-paper border border-line rounded-2xl p-6 shadow-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose/10 border border-rose/15 text-[18px] grid place-items-center">
                ✉️
              </div>
              <h2 className="font-serif font-bold text-[17px] text-ink">
                {t('email_label')}
              </h2>
            </div>
            <a
              href="mailto:chococfko@gmail.com"
              className="text-[14.5px] text-rose hover:underline break-all"
            >
              chococfko@gmail.com
            </a>
          </div>

          {/* Social card */}
          <div className="bg-paper border border-line rounded-2xl p-6 shadow-card">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose/10 border border-rose/15 text-[18px] grid place-items-center">
                🌐
              </div>
              <h2 className="font-serif font-bold text-[17px] text-ink">
                {t('social_label')}
              </h2>
            </div>
            <p className="text-[14px] text-muted italic">
              Facebook · Instagram
              <br />
              <span className="text-[12px] not-italic opacity-70">(coming soon)</span>
            </p>
          </div>
        </div>

        {/* Feedback link */}
        <div className="bg-rose/5 border border-rose/20 rounded-2xl p-6 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-[14.5px] text-muted">
            Có ý kiến hoặc muốn báo lỗi?
          </p>
          <Link
            href="/gop-y"
            className="flex-none font-semibold text-[13.5px] px-5 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-colors"
          >
            Góp ý →
          </Link>
        </div>

      </div>
    </div>
  )
}
