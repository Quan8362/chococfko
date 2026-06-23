'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { HOME_RESET_EVENT } from '@/lib/homeNav'

/**
 * Header logo = "return to homepage / default state" — reliable everywhere.
 *
 * It is a real <Link href="/"> (keyboard accessible, works without JS, locale
 * preserved via cookie i18n). On click it ALSO dispatches HOME_RESET_EVENT so the
 * homepage search (ExploreSearch) clears its client query + temporary filters, and
 * scrolls to top. The Link navigation drops the ?q param from the URL; from another
 * route it loads a fresh homepage. This fixes the bug where, on "/", clicking the
 * logo did nothing because the search lived only in client state.
 */
export default function HomeLogo({ label }: { label: string }) {
  const pathname = usePathname()
  const onActivate = () => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent(HOME_RESET_EVENT))
    window.scrollTo({ top: 0, behavior: pathname === '/' ? 'smooth' : 'auto' })
  }
  return (
    <Link
      href="/"
      onClick={onActivate}
      aria-label={label}
      className="flex items-center shrink-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/50"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/logo-nav.png"
        alt="Chợ Cóc FKO"
        className="h-9 sm:h-10 w-auto max-w-[160px] sm:max-w-[196px] object-contain"
      />
    </Link>
  )
}
