'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { useRouter } from 'next/navigation'
import ChatUnreadBadge from './ChatUnreadBadge'
import NavIcon from './NavIcon'
import { LANGS, Flag } from './LanguageSwitcher'
import { trackMapOpen } from '@/lib/mapNav'

interface MobileMenuProps {
  isAdmin?: boolean
  isLoggedIn?: boolean
}

export default function MobileMenu({ isLoggedIn }: MobileMenuProps) {
  const t = useTranslations('nav')
  const tConf = useTranslations('confessions')
  const tJp = useTranslations('japanese')
  const locale = useLocale()
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const changeLanguage = (code: string) => {
    document.cookie = `locale=${code}; path=/; max-age=31536000; SameSite=Lax`
    setOpen(false)
    router.refresh()
  }

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

  const close = () => setOpen(false)

  return (
    <>
      <button
        onClick={() => setOpen(v => !v)}
        aria-label={t('open_menu')}
        aria-expanded={open}
        className="xl:hidden flex flex-col items-center justify-center gap-[5px] h-11 w-11 -mr-1.5 rounded-lg transition-colors hover:bg-line/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
      >
        <span className={`block h-[1.5px] w-[20px] bg-ink rounded-full transition-all duration-200 origin-center ${open ? 'rotate-45 translate-y-[6.5px]' : ''}`} />
        <span className={`block h-[1.5px] w-[20px] bg-ink rounded-full transition-all duration-200 ${open ? 'opacity-0 scale-x-0' : ''}`} />
        <span className={`block h-[1.5px] w-[20px] bg-ink rounded-full transition-all duration-200 origin-center ${open ? '-rotate-45 -translate-y-[6.5px]' : ''}`} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[95] bg-ink/20 backdrop-blur-[2px] xl:hidden"
            onClick={close}
          />
          <div className="animate-slidedown fixed inset-x-0 top-[68px] z-[96] bg-paper border-b border-line shadow-dropdown xl:hidden">
            {/* Utility row — language switcher relocated from the top bar to
                declutter mobile. Lives outside the scroll area. */}
            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-line">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted/70 shrink-0">{t('language')}</span>
              <div className="flex items-center gap-1 flex-wrap">
                {LANGS.map(l => (
                  <button
                    key={l.code}
                    onClick={() => changeLanguage(l.code)}
                    aria-label={l.label}
                    aria-current={l.code === locale ? 'true' : undefined}
                    title={l.label}
                    className={`grid place-items-center h-10 w-10 rounded-lg border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 ${
                      l.code === locale ? 'border-rose bg-rose/[0.07]' : 'border-transparent hover:bg-cream'
                    }`}
                  >
                    <Flag src={l.flag} label={l.label} />
                  </button>
                ))}
              </div>
            </div>
            <nav className="px-4 py-3 flex flex-col gap-0.5 max-h-[calc(100dvh-68px-57px)] overflow-y-auto">
              <Link href="/" onClick={close} className="group/m flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                <span className="flex-none grid place-items-center w-9 h-9 rounded-lg bg-cream text-muted group-hover/m:bg-rose/10 group-hover/m:text-rose transition-colors"><NavIcon name="explore" /></span>
                {t('explore')}
              </Link>
              <Link href="/places" onClick={close} className="group/m flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                <span className="flex-none grid place-items-center w-9 h-9 rounded-lg bg-cream text-muted group-hover/m:bg-rose/10 group-hover/m:text-rose transition-colors"><NavIcon name="grid" /></span>
                {t('all_places')}
              </Link>
              <Link href="/map" onClick={() => { trackMapOpen('mobile_navigation'); close() }} className="group/m flex items-start gap-3 px-2.5 py-2.5 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                <span className="flex-none grid place-items-center w-9 h-9 rounded-lg bg-cream text-muted group-hover/m:bg-rose/10 group-hover/m:text-rose transition-colors"><NavIcon name="map" /></span>
                <span className="flex flex-col min-w-0">
                  <span className="leading-tight">{t('explore_map')}</span>
                  <span className="text-[12.5px] font-normal text-muted leading-snug">{t('explore_map_desc')}</span>
                </span>
              </Link>

              <p className="px-3 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted/70">{t('community')}</p>
              <Link href="/community" onClick={close} className="group/m flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                <span className="flex-none grid place-items-center w-9 h-9 rounded-lg bg-cream text-muted group-hover/m:bg-rose/10 group-hover/m:text-rose transition-colors"><NavIcon name="posts" /></span>
                {t('community_posts')}
              </Link>
              <Link href="/confessions" onClick={close} className="group/m flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                <span className="flex-none grid place-items-center w-9 h-9 rounded-lg bg-cream text-muted group-hover/m:bg-rose/10 group-hover/m:text-rose transition-colors"><NavIcon name="confession" /></span>
                {tConf('nav')}
              </Link>
              <Link href="/community/chat" onClick={close} className="group/m flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                <span className="flex-none grid place-items-center w-9 h-9 rounded-lg bg-cream text-muted group-hover/m:bg-rose/10 group-hover/m:text-rose transition-colors"><NavIcon name="chat" /></span>
                <span className="flex-1">{t('chat')}</span>
                <ChatUnreadBadge />
              </Link>

              <p className="px-3 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted/70">{t('marketplace')}</p>
              <Link href="/marketplace" onClick={close} className="group/m flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                <span className="flex-none grid place-items-center w-9 h-9 rounded-lg bg-cream text-muted group-hover/m:bg-rose/10 group-hover/m:text-rose transition-colors"><NavIcon name="bag" /></span>
                {t('marketplace_browse')}
              </Link>
              <Link href="/marketplace/new" onClick={close} className="group/m flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                <span className="flex-none grid place-items-center w-9 h-9 rounded-lg bg-cream text-muted group-hover/m:bg-rose/10 group-hover/m:text-rose transition-colors"><NavIcon name="plus" /></span>
                {t('marketplace_post')}
              </Link>

              <p className="px-3 pt-3 pb-1.5 text-[11px] font-bold uppercase tracking-wider text-muted/70">{t('more')}</p>
              <Link href="/japanese" onClick={close} className="group/m flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                <span className="flex-none grid place-items-center w-9 h-9 rounded-lg bg-cream text-muted group-hover/m:bg-rose/10 group-hover/m:text-rose transition-colors"><NavIcon name="language" /></span>
                {tJp('nav')}
              </Link>
              <Link href="/games" onClick={close} className="group/m flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                <span className="flex-none grid place-items-center w-9 h-9 rounded-lg bg-cream text-muted group-hover/m:bg-rose/10 group-hover/m:text-rose transition-colors"><NavIcon name="puzzle" /></span>
                {t('mini_game')}
              </Link>

              <div className="my-1.5 border-t border-line" />
              <Link href="/community/write" onClick={close} className="group/m flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[15px] font-semibold text-rose hover:bg-rose-soft transition-colors">
                <span className="flex-none grid place-items-center w-9 h-9 rounded-lg bg-rose/10 text-rose"><NavIcon name="pencil" /></span>
                {t('write_post')}
              </Link>
              {isLoggedIn ? (
                <>
                  <Link href="/profile" onClick={close} className="group/m flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                    <span className="flex-none grid place-items-center w-9 h-9 rounded-lg bg-cream text-muted group-hover/m:bg-rose/10 group-hover/m:text-rose transition-colors"><NavIcon name="user" /></span>
                    {t('profile')}
                  </Link>
                  <Link href="/my-posts" onClick={close} className="group/m flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                    <span className="flex-none grid place-items-center w-9 h-9 rounded-lg bg-cream text-muted group-hover/m:bg-rose/10 group-hover/m:text-rose transition-colors"><NavIcon name="document" /></span>
                    {t('my_posts')}
                  </Link>
                  <Link href="/saved-places" onClick={close} className="group/m flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                    <span className="flex-none grid place-items-center w-9 h-9 rounded-lg bg-cream text-muted group-hover/m:bg-rose/10 group-hover/m:text-rose transition-colors"><NavIcon name="heart" /></span>
                    {t('saved_places')}
                  </Link>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={close} className="group/m flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[15px] font-semibold text-rose hover:bg-rose-soft transition-colors">
                    <span className="flex-none grid place-items-center w-9 h-9 rounded-lg bg-rose/10 text-rose"><NavIcon name="user" /></span>
                    {t('login')}
                  </Link>
                  <Link href="/register" onClick={close} className="group/m flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                    <span className="flex-none grid place-items-center w-9 h-9 rounded-lg bg-cream text-muted group-hover/m:bg-rose/10 group-hover/m:text-rose transition-colors"><NavIcon name="plus" /></span>
                    {t('register')}
                  </Link>
                </>
              )}
            </nav>
          </div>
        </>
      )}
    </>
  )
}
