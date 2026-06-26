import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { updatePassword } from '@/app/auth/actions'
import PasswordInput from '@/components/PasswordInput'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('auth')
  return { title: `${t('reset_heading')}` }
}

export default async function DatLaiMatKhau({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const t = await getTranslations('auth')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <section className="min-h-[calc(100vh-160px)] flex items-center justify-center py-12">
      <div className="w-full max-w-[440px] mx-auto px-7">
        <div className="text-center mb-8">
          <h1 className="font-serif font-black text-[clamp(26px,4vw,34px)] tracking-[-0.5px] mb-2">
            {t('reset_heading')}
          </h1>
          <p className="text-muted text-[15px]">{t('reset_sub')}</p>
        </div>

        {searchParams.error && (
          <div className="bg-[#fff4f6] border border-[#f3cdd9] rounded-xl p-3.5 text-[13.5px] text-rose-deep mb-5">
            {decodeURIComponent(searchParams.error)}
          </div>
        )}

        {user ? (
          <form action={updatePassword} className="space-y-4">
            <div>
              <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">{t('new_password')}</label>
              <PasswordInput name="password" required minLength={6} autoComplete="new-password" placeholder={t('new_password_placeholder')} />
            </div>
            <div>
              <label className="block text-[13px] font-semibold mb-1.5 text-[#5c4d44]">{t('confirm_password')}</label>
              <PasswordInput name="confirm_password" required minLength={6} autoComplete="new-password" placeholder={t('confirm_password_placeholder')} />
            </div>
            <button
              type="submit"
              className="w-full font-semibold text-[15px] py-3.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all mt-2"
            >
              {t('reset_save_btn')}
            </button>
          </form>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center">
            <p className="text-[14px] text-amber-800 font-medium mb-3">⚠️ {t('reset_link_invalid')}</p>
            <Link href="/forgot-password" className="inline-block text-[13.5px] font-semibold px-5 py-2.5 rounded-full bg-amber-500 text-white hover:bg-amber-600 transition-colors">
              {t('forgot_send_btn')}
            </Link>
          </div>
        )}

        <p className="text-center text-[14px] text-muted mt-6">
          <Link href="/login" className="text-rose font-semibold hover:underline">← {t('back_to_login')}</Link>
        </p>
      </div>
    </section>
  )
}
