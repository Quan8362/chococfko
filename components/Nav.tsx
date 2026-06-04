import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import LanguageSwitcher from './LanguageSwitcher'
import UserMenu from './UserMenu'
import MobileMenu from './MobileMenu'

async function getAuthState() {
  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { user: null, isAdmin: false, avatarUrl: null as string | null }
    const [isAdmin, { data: profile }] = await Promise.all([
      checkIsAdmin(),
      supabase.from('profiles').select('avatar_url').eq('id', user.id).single(),
    ])
    return { user, isAdmin, avatarUrl: profile?.avatar_url ?? null }
  } catch {
    return { user: null, isAdmin: false, avatarUrl: null as string | null }
  }
}

export default async function Nav() {
  const [t, tConf] = await Promise.all([
    getTranslations('nav'),
    getTranslations('confessions'),
  ])
  const { user, isAdmin, avatarUrl } = await getAuthState()
  const displayName =
    user?.user_metadata?.display_name || user?.email?.split('@')[0] || t('user_default')
  const initial = displayName[0].toUpperCase()

  return (
    <header className="sticky top-0 z-[100] bg-[rgba(250,244,234,0.92)] backdrop-blur-md border-b border-line">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 h-[68px] flex items-center justify-between md:grid md:grid-cols-[1fr_auto_1fr] md:items-center">

        {/* Logo — bên trái */}
        <Link href="/" className="flex items-center shrink-0 md:justify-self-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-nav.png"
            alt="Chợ Cóc FKO"
            className="h-8 sm:h-9 w-auto max-w-[150px] sm:max-w-[180px] object-contain"
          />
        </Link>

        {/* Desktop nav — cột giữa, ẩn trên mobile */}
        <nav className="hidden md:flex items-center gap-0.5 text-[13.5px] font-medium text-[#6b5b50]">
          <Link href="/" className="px-3 py-1.5 rounded-lg hover:bg-line hover:text-rose transition-colors whitespace-nowrap">
            {t('explore')}
          </Link>
          <Link href="/cong-dong" className="px-3 py-1.5 rounded-lg hover:bg-line hover:text-rose transition-colors whitespace-nowrap">
            {t('community')}
          </Link>
          <Link href="/confessions" className="px-3 py-1.5 rounded-lg hover:bg-line hover:text-rose transition-colors whitespace-nowrap">
            {tConf('nav')}
          </Link>
        </nav>

        {/* Right actions — bên phải */}
        <div className="flex items-center gap-2.5 md:justify-self-end">
          <LanguageSwitcher />

          {user ? (
            <UserMenu displayName={displayName} initial={initial} isAdmin={isAdmin} avatarUrl={avatarUrl} />
          ) : (
            <Link
              href="/dang-nhap"
              className="hidden sm:block text-[13px] font-medium px-3 py-2 rounded-lg text-[#5c4d44] hover:bg-line hover:text-rose transition-colors"
            >
              {t('login')}
            </Link>
          )}

          <MobileMenu isAdmin={isAdmin} isLoggedIn={!!user} />
        </div>
      </div>
    </header>
  )
}
