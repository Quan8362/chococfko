'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'

interface MobileMenuProps {
  isAdmin?: boolean
  isLoggedIn?: boolean
}

export default function MobileMenu({ isAdmin, isLoggedIn }: MobileMenuProps) {
  const t = useTranslations('nav')
  const tConf = useTranslations('confessions')
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
        aria-label="Mở menu"
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
            <nav className="px-5 py-3 flex flex-col gap-0.5">
              <Link href="/" onClick={close} className="flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                <span>🗺️</span> {t('explore')}
              </Link>
              <Link href="/cong-dong" onClick={close} className="flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                <span>💬</span> {t('community')}
              </Link>
              <Link href="/confessions" onClick={close} className="flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                <span>🤫</span> {tConf('nav')}
              </Link>
              <Link href="/cong-dong/viet-bai" onClick={close} className="flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-semibold text-rose hover:bg-rose-soft transition-colors">
                {t('write_post')}
              </Link>
              {isLoggedIn ? (
                <>
                  <Link href="/ho-so" onClick={close} className="flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    {t('profile')}
                  </Link>
                  <Link href="/bai-viet-cua-toi" onClick={close} className="flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    {t('my_posts')}
                  </Link>
                  <Link href="/dia-diem-da-luu" onClick={close} className="flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                    {t('saved_places')}
                  </Link>
                  {isAdmin && (
                    <Link href="/admin" onClick={close} className="flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium text-amber-700 hover:bg-[#fffbeb] transition-colors">
                      <span>⚙️</span> {t('admin')}
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <div className="my-1 border-t border-line" />
                  <Link href="/dang-nhap" onClick={close} className="flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-semibold text-rose hover:bg-rose-soft transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    {t('login')}
                  </Link>
                  <Link href="/dang-ky" onClick={close} className="flex items-center gap-3 px-3 py-3 rounded-xl text-[15px] font-medium text-ink hover:bg-cream transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
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
