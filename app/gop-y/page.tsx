import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import FeedbackForm from './FeedbackForm'

export async function generateMetadata() {
  const t = await getTranslations('feedback_page')
  const description = t('intro')
  return {
    title: t('title'),
    description,
    openGraph: { title: t('title'), description },
  }
}

export default async function GopY() {
  const t = await getTranslations('feedback_page')

  return (
    <div className="min-h-[calc(100vh-160px)] py-16 px-6">
      <div className="max-w-[620px] mx-auto">

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

        <FeedbackForm
          labels={{
            name: t('name'),
            namePh: t('name_ph'),
            email: t('email'),
            emailPh: t('email_ph'),
            message: t('message'),
            messagePh: t('message_ph'),
            submit: t('submit'),
            submitting: t('submitting'),
            error: t('error'),
            successTitle: t('success_title'),
            successDesc: t('success_desc'),
          }}
        />

      </div>
    </div>
  )
}
