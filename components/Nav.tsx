import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import HomeLogo from './HomeLogo'
import LanguageSwitcher from './LanguageSwitcher'
import UserMenu from './UserMenu'
import MobileMenu from './MobileMenu'
import AdminNotificationBell from './AdminNotificationBell'
import UserNotificationBell from './UserNotificationBell'
import NavDropdown from './NavDropdown'
import NavLink from './NavLink'

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
  const [t, tConf, tJp] = await Promise.all([
    getTranslations('nav'),
    getTranslations('confessions'),
    getTranslations('japanese'),
  ])
  const { user, isAdmin, avatarUrl } = await getAuthState()
  const displayName =
    user?.user_metadata?.display_name || user?.email?.split('@')[0] || t('user_default')
  const initial = displayName[0].toUpperCase()

  return (
    <header className="sticky top-0 z-[100] bg-[rgba(250,244,234,0.985)] backdrop-blur-md border-b border-line">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 h-[68px] sm:h-[70px] flex items-center">

        {/* Logo — bên trái. Always "return to homepage/default state" (see HomeLogo). */}
        <HomeLogo label={t('logo_home')} />

        {/* Desktop nav — full horizontal nav only at ≥1280px (xl). Below that
            (incl. all tablet/iPad widths) it collapses into the hamburger so the
            right icon cluster never gets clipped. */}
        <nav className="hidden xl:flex flex-1 justify-center items-center gap-0.5 lg:gap-1 text-[14px] lg:text-[14.5px] font-medium text-[#5c4d44]">
          <NavDropdown
            label={t('explore')}
            items={[
              { href: '/places', label: t('all_places'), icon: 'explore' },
              { href: '/#categories', label: t('place_categories'), icon: 'grid' },
              { href: '/map', label: t('explore_map'), icon: 'map', track: { event: 'explore_map_opened', source: 'header_dropdown' } },
              { href: '/games/destination-wheel', label: t('todays_suggestion'), icon: 'sparkles' },
              { href: '/about', label: t('about'), icon: 'info' },
            ]}
          />
          <NavDropdown
            label={t('community')}
            showChatBadgeOnParent
            items={[
              { href: '/community', label: t('community_posts'), icon: 'posts' },
              { href: '/confessions', label: tConf('nav'), icon: 'confession' },
              { href: '/community/chat', label: t('chat'), icon: 'chat', badge: 'chat' },
            ]}
          />
          <NavLink href="/marketplace">{t('marketplace')}</NavLink>
          <NavLink href="/japanese">{tJp('nav')}</NavLink>
          <NavDropdown
            label={t('entertainment')}
            items={[
              { href: '/games', label: t('mini_game'), icon: 'puzzle' },
            ]}
          />
        </nav>

        {/* Right actions — bên phải. Tighter gaps on narrow phones so the cluster
            (language, bells, avatar, menu) never overflows next to the logo. */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 ml-auto shrink-0">
          <LanguageSwitcher />

          {user && <UserNotificationBell />}
          {isAdmin && <AdminNotificationBell />}

          {user ? (
            <UserMenu displayName={displayName} initial={initial} isAdmin={isAdmin} avatarUrl={avatarUrl} />
          ) : (
            <Link
              href="/login"
              className="hidden sm:block text-[13px] font-medium px-3 py-2 rounded-lg text-[#5c4d44] hover:bg-line hover:text-rose transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
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
