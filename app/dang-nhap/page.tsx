import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { signIn, resendConfirmation } from '@/app/auth/actions'
import SocialLoginButtons from '@/components/SocialLoginButtons'
import PasswordInput from '@/components/PasswordInput'

export async function generateMetadata() {
  const t = await getTranslations('auth')
  return { title: `${t('login_heading')} · Chợ Cóc FKO` }
}

export default async function DangNhap({
  searchParams,
}: {
  searchParams: { error?: string; confirmed?: string; unconfirmed?: string; email?: string; resent?: string; reset?: string }
}) {
  const t = await getTranslations('auth')
  const email = searchParams.email ? decodeURIComponent(searchParams.email) : ''

  return (
    <section className="min-h-[calc(100vh-160px)] flex items-center justify-center py-12">
      <div className="w-full max-w-[440px] mx-auto px-7">
        <div className="text-center mb-8">
          <h1 className="font-serif font-black text-[clamp(28px,4vw,38px)] tracking-[-0.5px] mb-2">
            {t('login_heading')}
          </h1>
          <p className="text-muted text-[15px]">{t('login_sub')}</p>
        </div>

        {/* Email confirmed success */}
        {searchParams.confirmed && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-5 text-center">
            <p className="text-[15px] font-semibold text-emerald-700 mb-0.5">
              ✅ {t('email_confirmed_heading')}
            </p>
            <p className="text-[13px] text-emerald-600">{t('email_confirmed_sub')}</p>
          </div>
        )}

        {/* Password reset success */}
        {searchParams.reset && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 mb-5 text-center">
            <p className="text-[13.5px] text-emerald-700 font-medium">✅ {t('reset_success')}</p>
          </div>
        )}

        {/* Resent success */}
        {searchParams.resent && (
          <div className="bg-teal/10 border border-teal/30 rounded-xl p-3.5 mb-5 text-center">
            <p className="text-[13.5px] text-teal font-medium">📧 {t('resend_sent')}</p>
          </div>
        )}

        {/* Email unconfirmed warning + resend */}
        {searchParams.unconfirmed && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-5">
            <p className="text-[13.5px] text-amber-800 font-medium mb-3">
              ⚠️ {t('unconfirmed_note')}
            </p>
            {email && (
              <form action={resendConfirmation}>
                <input type="hidden" name="email" value={email} />
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg text-[13px] font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-colors"
                >
                  {t('resend_btn')}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Generic error */}
        {searchParams.error && (
          <div className="bg-[#fff4f6] border border-[#f3cdd9] rounded-xl p-3.5 text-[13.5px] text-rose-deep mb-5">
            {decodeURIComponent(searchParams.error)}
          </div>
        )}

        <form action={signIn} className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              {t('email')}
            </label>
            <input
              type="email"
              name="email"
              required
              defaultValue={email}
              placeholder={t('email_placeholder')}
              className="w-full text-[14.5px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-[13px] font-semibold text-[#5c4d44]">
                {t('password')}
              </label>
              <Link href="/quen-mat-khau" className="text-[12.5px] font-medium text-rose hover:underline">
                {t('forgot_password')}
              </Link>
            </div>
            <PasswordInput
              name="password"
              required
              autoComplete="current-password"
              placeholder={t('password_placeholder')}
            />
          </div>
          <button
            type="submit"
            className="w-full font-semibold text-[15px] py-3.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all mt-2"
          >
            {t('login_btn')}
          </button>
        </form>

        <SocialLoginButtons />

        <p className="text-center text-[14px] text-muted mt-6">
          {t('no_account')}{' '}
          <Link href="/dang-ky" className="text-rose font-semibold hover:underline">
            {t('register_link')}
          </Link>
        </p>
      </div>
    </section>
  )
}
