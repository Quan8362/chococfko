'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { signOut } from '@/app/auth/actions'
import { avatarSrc } from '@/lib/avatar'
import NavIcon from './NavIcon'

interface UserMenuProps {
  displayName: string
  initial: string
  isAdmin: boolean
  avatarUrl?: string | null
}

function Avatar({
  avatarUrl, initial, size = 8,
}: {
  avatarUrl?: string | null
  initial: string
  size?: number
}) {
  const px = size * 4
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarSrc(avatarUrl)}
        alt=""
        width={px * 2}
        height={px * 2}
        decoding="async"
        style={{
          width: px,
          height: px,
          borderRadius: '9999px',
          objectFit: 'cover',
          flexShrink: 0,
          display: 'block',
        }}
      />
    )
  }
  return (
    <span
      className="rounded-full bg-rose text-white font-semibold text-[13px] grid place-items-center flex-none"
      style={{ width: px, height: px, flexShrink: 0 }}
    >
      {initial}
    </span>
  )
}

export default function UserMenu({ displayName, initial, isAdmin, avatarUrl }: UserMenuProps) {
  const t = useTranslations('nav')
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full hover:bg-line transition-colors"
      >
        <Avatar avatarUrl={avatarUrl} initial={initial} size={8} />
        <span className="hidden lg:block text-[13px] text-[#5c4d44] font-medium max-w-[88px] truncate leading-none">
          {displayName}
        </span>
        <svg
          className={`w-3 h-3 text-muted hidden lg:block transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="animate-fadein absolute right-0 top-[calc(100%+8px)] w-56 bg-paper border border-line rounded-2xl shadow-dropdown overflow-hidden z-[200]">
          {/* Dropdown header */}
          <div className="px-4 py-3 bg-cream/60 border-b border-line flex items-center gap-3">
            <Avatar avatarUrl={avatarUrl} initial={initial} size={9} />
            <div className="min-w-0">
              <p className="text-[12px] text-muted font-medium">{t('account')}</p>
              <p className="text-[13.5px] font-semibold text-ink truncate leading-snug">{displayName}</p>
            </div>
          </div>

          {/* Profile link */}
          <Link
            href="/ho-so"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[#5c4d44] hover:bg-cream hover:text-rose transition-colors"
          >
            <NavIcon name="user" className="w-[16px] h-[16px] flex-none" />
            {t('profile')}
          </Link>

          {/* My posts link */}
          <Link
            href="/bai-viet-cua-toi"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[#5c4d44] hover:bg-cream hover:text-rose transition-colors"
          >
            <NavIcon name="document" className="w-[16px] h-[16px] flex-none" />
            {t('my_posts')}
          </Link>

          {/* Saved places link */}
          <Link
            href="/dia-diem-da-luu"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[#5c4d44] hover:bg-cream hover:text-rose transition-colors"
          >
            <NavIcon name="heart" className="w-[16px] h-[16px] flex-none" />
            {t('saved_places')}
          </Link>

          {isAdmin && (
            <Link
              href="/admin"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-amber-700 hover:bg-[#fffbeb] transition-colors"
            >
              <NavIcon name="cog" className="w-[16px] h-[16px] flex-none" />
              <span>{t('admin')}</span>
            </Link>
          )}

          <form action={signOut}>
            <button
              type="submit"
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] font-medium text-[#5c4d44] hover:text-rose hover:bg-rose-soft transition-colors"
            >
              <NavIcon name="logout" className="w-[16px] h-[16px] flex-none" />
              {t('logout')}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
