import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { signUp, resendConfirmation } from '@/app/auth/actions'
import SocialLoginButtons from '@/components/SocialLoginButtons'
import PasswordInput from '@/components/PasswordInput'

export async function generateMetadata() {
  const t = await getTranslations('auth')
  return { title: `${t('register_heading')}` }
}

export default async function DangKy({
  searchParams,
}: {
  searchParams: { error?: string; success?: string; email?: string }
}) {
  const t = await getTranslations('auth')

  if (searchParams.success) {
    const email = searchParams.email ? decodeURIComponent(searchParams.email) : ''
    return (
      <section className="min-h-[calc(100vh-160px)] flex items-center justify-center py-12">
        <div className="w-full max-w-[440px] mx-auto px-7 text-center">
          <div className="text-5xl mb-5">📬</div>
          <h1 className="font-serif font-black text-[28px] mb-3">
            {t('check_email_heading')}
          </h1>
          <p className="text-muted text-[15px] mb-2">{t('check_email_sub')}</p>
          <p className="text-muted/70 text-[13px] mb-7">{t('check_email_spam')}</p>

          {email && (
            <form action={resendConfirmation} className="mb-4">
              <input type="hidden" name="email" value={email} />
              <button
                type="submit"
                className="w-full font-semibold text-[14px] px-6 py-3 rounded-full border border-rose/30 text-rose hover:bg-rose/5 transition-colors"
              >
                {t('resend_btn')}
              </button>
            </form>
          )}

          <Link
            href="/login"
            className="inline-block font-semibold text-[14px] px-6 py-3 rounded-full bg-rose text-white hover:bg-rose-deep transition-all"
          >
            {t('back_to_login')}
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="min-h-[calc(100vh-160px)] flex items-center justify-center py-12">
      <div className="w-full max-w-[440px] mx-auto px-7">
        <div className="text-center mb-8">
          <h1 className="font-serif font-black text-[clamp(28px,4vw,38px)] tracking-[-0.5px] mb-2">
            {t('register_heading')}
          </h1>
          <p className="text-muted text-[15px]">{t('register_sub')}</p>
        </div>

        {searchParams.error && (
          <div className="bg-[#fff4f6] border border-[#f3cdd9] rounded-xl p-3.5 text-[13.5px] text-rose-deep mb-5">
            {decodeURIComponent(searchParams.error)}
          </div>
        )}

        <form action={signUp} className="space-y-4">
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              {t('display_name')}
            </label>
            <input
              type="text"
              name="display_name"
              required
              placeholder={t('display_name_placeholder')}
              className="w-full text-[14.5px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose"
            />
          </div>
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              {t('email')}
            </label>
            <input
              type="email"
              name="email"
              required
              placeholder={t('email_placeholder')}
              className="w-full text-[14.5px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose"
            />
          </div>
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              {t('password')}
            </label>
            <PasswordInput
              name="password"
              required
              minLength={6}
              autoComplete="new-password"
              placeholder={t('password_hint')}
            />
          </div>
          <button
            type="submit"
            className="w-full font-semibold text-[15px] py-3.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all mt-2"
          >
            {t('register_btn')}
          </button>
        </form>

        <SocialLoginButtons variant="register" />

        <p className="text-center text-[14px] text-muted mt-6">
          {t('have_account')}{' '}
          <Link href="/login" className="text-rose font-semibold hover:underline">
            {t('login_link')}
          </Link>
        </p>
      </div>
    </section>
  )
}
