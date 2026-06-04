import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { signIn } from '@/app/auth/actions'
import SocialLoginButtons from '@/components/SocialLoginButtons'

export async function generateMetadata() {
  const t = await getTranslations('auth')
  return { title: `${t('login_heading')} · Chợ Cóc FKO` }
}

export default async function DangNhap({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const t = await getTranslations('auth')

  return (
    <section className="min-h-[calc(100vh-160px)] flex items-center justify-center py-12">
      <div className="w-full max-w-[440px] mx-auto px-7">
        <div className="text-center mb-8">
          <h1 className="font-serif font-black text-[clamp(28px,4vw,38px)] tracking-[-0.5px] mb-2">
            {t('login_heading')}
          </h1>
          <p className="text-muted text-[15px]">{t('login_sub')}</p>
        </div>

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
              placeholder={t('email_placeholder')}
              className="w-full text-[14.5px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose"
            />
          </div>
          <div>
            <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">
              {t('password')}
            </label>
            <input
              type="password"
              name="password"
              required
              placeholder={t('password_placeholder')}
              className="w-full text-[14.5px] px-3.5 py-3 border-[1.5px] border-line rounded-xl bg-white focus:outline-none focus:border-rose"
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
