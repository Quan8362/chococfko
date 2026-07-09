'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { Icon, type IconName } from './icons'
import './portal-theme.css'

// ── Premium PORTAL shell for the poker ecosystem screens ──────────────────────────────────────
// A compact "poker salon" identity that is DISTINCT from (and never duplicates) the main website
// header. Warm champagne bar with a gold keyline, a serif wordmark, and a grouped, horizontally
// scrollable tab nav (Play · Learn · Records · Settings). The immersive dark felt theme stays
// scoped to the live table (.poker-root); this portal lives under `.pk-portal`.

interface Tab {
  key: string
  href: string
  icon: IconName
}
// Grouped by intent; rendered with subtle dividers between groups.
const GROUPS: Tab[][] = [
  [
    { key: 'lobby', href: '/games/poker/lobby', icon: 'globe' },
    { key: 'create', href: '/games/poker/create', icon: 'plus' },
  ],
  [
    { key: 'learn', href: '/games/poker/learn', icon: 'graduationCap' },
    { key: 'rules', href: '/games/poker/rules', icon: 'book' },
    { key: 'glossary', href: '/games/poker/glossary', icon: 'list' },
  ],
  [
    { key: 'history', href: '/games/poker/history', icon: 'clock' },
    { key: 'profile', href: '/games/poker/profile', icon: 'user' },
  ],
  [{ key: 'settings', href: '/games/poker/settings', icon: 'settings' }],
]

export default function PokerShell({ children }: { children: ReactNode }) {
  const t = useTranslations('games.poker')
  const pathname = usePathname() || ''

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/')

  return (
    <div className="pk-portal">
      <header className="pk-topbar sticky top-0 z-30 border-b border-[color:var(--pkp-gold-line)]">
        <div className="pk-container">
          <div className="flex items-center justify-between gap-3 py-2.5">
            <Link href="/games/poker" className="group inline-flex items-center gap-2.5" aria-label={t('title')}>
              <span
                className="grid h-9 w-9 place-items-center rounded-xl text-[color:var(--pkp-gold-soft)]"
                style={{
                  background: 'linear-gradient(140deg, var(--pkp-plum) 0%, var(--pkp-plum-2) 100%)',
                  boxShadow: '0 0 0 1px var(--pkp-gold-line), 0 4px 12px rgba(30,18,44,0.28)',
                }}
                aria-hidden
              >
                <Icon name="spade" size={18} />
              </span>
              <span className="flex flex-col leading-none">
                <span className="font-serif text-[1.05rem] font-bold text-[color:var(--pkp-ink)]">{t('title')}</span>
                <span className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--pkp-gold-deep)]">
                  Texas Hold’em
                </span>
              </span>
            </Link>
            <Link
              href="/games"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2.5 text-sm text-[color:var(--pkp-ink-2)] transition-colors hover:text-[color:var(--pkp-ink)]"
            >
              <Icon name="chevronLeft" size={16} />
              <span className="hidden sm:inline">{t('nav.back')}</span>
            </Link>
          </div>

          <nav
            aria-label={t('title')}
            className="-mx-1 flex items-stretch gap-1 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {GROUPS.map((group, gi) => (
              <div key={gi} className="flex items-stretch gap-1">
                {gi > 0 && <span aria-hidden className="mx-1 my-2 w-px shrink-0 bg-[color:var(--pkp-line)]" />}
                {group.map((tab) => {
                  const active = isActive(tab.href)
                  return (
                    <Link
                      key={tab.key}
                      href={tab.href}
                      aria-current={active ? 'page' : undefined}
                      className={`inline-flex min-h-[40px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-medium transition-colors ${
                        active
                          ? 'bg-[color:var(--pkp-ruby-tint)] text-[color:var(--pkp-ruby-ink)]'
                          : 'text-[color:var(--pkp-ink-2)] hover:bg-[color:var(--pkp-surface-2)] hover:text-[color:var(--pkp-ink)]'
                      }`}
                    >
                      <Icon name={tab.icon} size={16} />
                      {t(`nav.${tab.key}`)}
                    </Link>
                  )
                })}
              </div>
            ))}
          </nav>
        </div>
      </header>

      <main className="pk-container py-7" style={{ paddingBottom: 'calc(5rem + var(--pkp-safe-bottom))' }}>
        {children}
      </main>
    </div>
  )
}
