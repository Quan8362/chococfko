'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import ChatUnreadBadge from './ChatUnreadBadge'
import NavIcon from './NavIcon'

export type NavDropdownItem = {
  href: string
  label: string
  icon?: string
  badge?: 'chat'
}

export default function NavDropdown({
  label,
  items,
  showChatBadgeOnParent = false,
}: {
  label: string
  items: NavDropdownItem[]
  showChatBadgeOnParent?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pathname = usePathname()

  const active = items.some(i => pathname === i.href || pathname.startsWith(i.href + '/'))

  useEffect(() => { setOpen(false) }, [pathname])

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey) }
  }, [open])

  const openNow = () => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(true) }
  const closeSoon = () => { closeTimer.current = setTimeout(() => setOpen(false), 120) }

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
    >
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`pl-3 pr-2.5 py-1.5 rounded-lg hover:bg-line hover:text-rose transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${active ? 'text-rose' : ''}`}
      >
        {label}
        {showChatBadgeOnParent && <ChatUnreadBadge />}
        <svg className={`w-3.5 h-3.5 mt-px text-current/70 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="animate-slidedown absolute left-1/2 -translate-x-1/2 top-full pt-2 z-[110]"
        >
          <div className="min-w-[224px] bg-paper border border-line rounded-2xl shadow-dropdown p-2">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="group/item flex items-center gap-3 pl-2.5 pr-3 py-2.5 rounded-xl text-[13.5px] font-medium text-ink hover:bg-cream hover:text-rose transition-colors"
              >
                {it.icon && (
                  <span className="flex-none grid place-items-center w-8 h-8 rounded-lg bg-cream text-muted group-hover/item:bg-rose/10 group-hover/item:text-rose transition-colors">
                    <NavIcon name={it.icon} />
                  </span>
                )}
                <span className="flex-1">{it.label}</span>
                {it.badge === 'chat' && <ChatUnreadBadge />}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
