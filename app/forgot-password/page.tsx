import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { requestPasswordReset } from '@/app/auth/actions'

export async function generateMetadata() {
  const t = await getTranslations('auth')
  return { title: `${t('forgot_heading')} · Chợ Cóc FKO` }
}

export default async function QuenMatKhau({
  searchParams,
}: {
  searchParams: { sent?: string }
}) {
  const t = await getTranslations('auth')

  return (
    <section className="min-h-[calc(100vh-160px)] flex items-center justify-center py-12">
      <div className="w-full max-w-[440px] mx-auto px-7">
        <div className="text-center mb-8">
          <h1 className="font-serif font-black text-[clamp(26px,4vw,34px)] tracking-[-0.5px] mb-2">
            {t('forgot_heading')}
          </h1>
          <p className="text-muted text-[15px]">{t('forgot_sub')}</p>
        </div>

        {searchParams.sent ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
            <p className="text-[15px] font-semibold text-emerald-700 mb-1">📧 {t('forgot_sent_heading')}</p>
            <p className="text-[13px] text-emerald-600">{t('forgot_sent_sub')}</p>
          </div>
        ) : (
          <form action={requestPasswordReset} className="space-y-4">
            <div>
              <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">{t('email')}</label>
              <input
                type="email"
                name="email"
                required
                placeholder={t('email_placeholder')}
                className="w-full text-[14.5px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose"
              />
            </div>
            <button
              type="submit"
              className="w-full font-semibold text-[15px] py-3.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all mt-2"
            >
              {t('forgot_send_btn')}
            </button>
          </form>
        )}

        <p className="text-center text-[14px] text-muted mt-6">
          <Link href="/login" className="text-rose font-semibold hover:underline">← {t('back_to_login')}</Link>
        </p>
      </div>
    </section>
  )
}
