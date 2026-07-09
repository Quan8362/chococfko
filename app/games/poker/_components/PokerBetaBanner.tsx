'use client'

// Public product chrome shown on every poker screen while POKER_CLOSED_BETA_ENABLED is on
// (server-gated in layout.tsx). It gives every player, at a glance: a clear virtual-coin
// product label, service-status / maintenance messages, and quick links to Rules, Known
// issues and Support. On a table route it also exposes a one-tap "copy table ID" control so
// a player can quote it in a bug report or to support.
//
// It shows NOTHING sensitive — only the table ID from the URL and static links. All copy is
// i18n. The persistent corner badge is always visible; the link bar can be dismissed.

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslations } from 'next-intl'

interface Props {
  // Optional ops messages resolved server-side from env and passed down.
  statusMessage?: string | null
  maintenance?: boolean
}

// Extract the table id from a /games/poker/<tableId>[/...] path, if present.
function tableIdFromPath(pathname: string): string | null {
  const m = /^\/games\/poker\/([^/]+)/.exec(pathname)
  if (!m) return null
  const seg = m[1]
  // Reserved sub-routes are not table ids.
  const reserved = new Set(['lobby', 'create', 'history', 'profile', 'rules', 'glossary', 'settings', 'preview', 'learn', 'training', 'known-issues', 'ranking'])
  return reserved.has(seg) ? null : seg
}

export default function PokerBetaBanner({ statusMessage, maintenance }: Props) {
  const t = useTranslations('games.poker.beta')
  const pathname = usePathname() || ''
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState(false)

  const tableId = useMemo(() => tableIdFromPath(pathname), [pathname])

  const copyTableId = async () => {
    if (!tableId) return
    try {
      await navigator.clipboard.writeText(tableId)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard unavailable — no-op */ }
  }

  return (
    <>
      {/* Persistent corner badge — a permanent virtual-coin product tag on every poker screen. */}
      <div
        role="status"
        className="pointer-events-none fixed bottom-3 left-1/2 z-[120] max-w-[calc(100vw-1rem)] -translate-x-1/2 select-none whitespace-nowrap rounded-full border border-sky-400/60 bg-sky-500/95 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-lg sm:text-[11px]"
      >
        {t('badge')}
      </div>

      {/* Maintenance / service-status strip (ops-controlled). Maintenance takes priority. */}
      {maintenance ? (
        <div role="alert" className="sticky top-0 z-[118] w-full bg-amber-500 px-3 py-1.5 text-center text-[12px] font-semibold text-black">
          {statusMessage?.trim() || t('maintenance')}
        </div>
      ) : statusMessage?.trim() ? (
        <div role="status" className="sticky top-0 z-[118] w-full bg-sky-50 px-3 py-1.5 text-center text-[12px] text-sky-900">
          {statusMessage}
        </div>
      ) : null}

      {/* Dismissible link bar. */}
      {!dismissed && (
        <div className="z-[117] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-line bg-paper px-3 py-1.5 text-[11px] text-muted">
          <span className="font-bold text-sky-700">{t('label')}</span>
          <span className="text-muted/70">·</span>
          <Link href="/games/poker/rules" className="text-rose hover:underline">{t('rules')}</Link>
          <Link href="/games/poker/known-issues" className="text-rose hover:underline">{t('known_issues')}</Link>
          <Link href="/feedback" className="text-rose hover:underline">{t('support')}</Link>
          {tableId && (
            <button type="button" onClick={copyTableId} className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink hover:bg-cream">
              {copied ? t('copied') : t('copy_table_id')}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="ml-1 rounded px-1 text-muted hover:bg-cream"
            aria-label={t('dismiss')}
          >
            ✕
          </button>
        </div>
      )}
    </>
  )
}
