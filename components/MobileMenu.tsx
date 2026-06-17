'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import ChatUnreadBadge from './ChatUnreadBadge'
import NavIcon from './NavIcon'

interface MobileMenuProps {
  isAdmin?: boolean
  isLoggedIn?: boolean
}

export default function MobileMenu({ isLoggedIn }: MobileMenuProps) {
  const t = useTranslations('nav')
  const tConf = useTranslations('confessions')
  const tJp = useTranslations('japanese')
  const [open, setOpen] = useState(false)

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
        className="md:hidden flex flex-col justify-center gap-[5px] p-2 -mr-1"
      >
        <span className={`block h-[1.5px] w-[20px] bg-ink rounded-full transition-all duration-200 origin-center ${open ? 'rotate-45 translate-y-[6.5px]' : ''}`} />
        <span className={`block h-[1.5px] w-[20px] bg-ink rounded-full transition-all duration-200 ${open ? 'opacity-0 scale-x-0' : ''}`} />
        <span className={`block h-[1.5px] w-[20px] bg-ink rounded-full transition-all duration-200 origin-center ${open ? '-rotate-45 -translate-y-[6.5px]' : ''}`} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[95] bg-ink/20 backdrop-blur-[2px] md:hidden"
            onClick={close}
          />
          <div className="animate-slidedown fixed inset-x-0 top-[68px] z-[96] bg-paper border-b border-line shadow-dropdown md:hidden">
            <nav className="px-4 py-3 flex flex-col gap-0.5 max-h-[calc(100dvh-68px)] overflow-y-auto">
              <Link href="/" onClick={close} className="group/m flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                <span className="flex-none grid place-items-center w-9 h-9 rounded-lg bg-cream text-muted group-hover/m:bg-rose/10 group-hover/m:text-rose transition-colors"><NavIcon name="explore" /></span>
                {t('explore')}
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
