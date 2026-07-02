'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

// Light-theme shell for the poker ECOSYSTEM screens (lobby / history / profile / rules …).
// Deliberately uses the site's standard cream/rose theme — the deep-dark lounge theme is scoped
// to the live table (.poker-root) only, matching the existing visual-system boundary.
const TABS = [
  { key: 'learn', href: '/games/poker/learn' },
  { key: 'lobby', href: '/games/poker/lobby' },
  { key: 'create', href: '/games/poker/create' },
  { key: 'history', href: '/games/poker/history' },
  { key: 'profile', href: '/games/poker/profile' },
  { key: 'rules', href: '/games/poker/rules' },
  { key: 'glossary', href: '/games/poker/glossary' },
  { key: 'settings', href: '/games/poker/settings' },
] as const

export default function PokerShell({ children }: { children: ReactNode }) {
  const t = useTranslations('games.poker')
  const pathname = usePathname()

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="border-b border-line bg-paper/80 backdrop-blur sticky top-0 z-20">
        <div className="mx-auto max-w-5xl px-5 sm:px-6">
          <div className="flex items-center justify-between gap-4 py-3">
            <Link href="/games/poker" className="flex items-center gap-2 font-serif text-lg font-bold text-rose">
              <span aria-hidden className="grid h-7 w-7 place-items-center rounded-md bg-rose/10 text-rose">♠</span>
              {t('title')}
            </Link>
            <Link href="/games" className="text-sm text-muted hover:text-ink">
              {t('nav.back')}
            </Link>
          </div>
          <nav className="-mb-px flex gap-1 overflow-x-auto pb-px">
            {TABS.map((tab) => {
              const active = pathname === tab.href || pathname.startsWith(tab.href + '/')
              return (
                <Link
                  key={tab.key}
                  href={tab.href}
                  className={`whitespace-nowrap rounded-t-md border-b-2 px-3 py-2 text-sm transition-colors ${
                    active
                      ? 'border-rose font-medium text-rose'
                      : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  {t(`nav.${tab.key}`)}
                </Link>
              )
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-8 pb-20 sm:px-6">{children}</main>
    </div>
  )
}
