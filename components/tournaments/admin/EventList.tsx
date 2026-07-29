'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import EventStatusBadge from './EventStatusBadge'
import ConfirmDialog from './ConfirmDialog'
import { deleteTournamentEvent, reorderTournamentEvents } from '@/app/admin/giai-dau/[id]/noi-dung/actions'
import type { EventListItem, EventMutationError } from '@/lib/tournaments/admin/types'

export default function EventList({
  tournamentId,
  events,
}: {
  tournamentId: string
  events: EventListItem[]
}) {
  const t = useTranslations('admin_tournament_events')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [items, setItems] = useState<EventListItem[]>(events)
  const [confirmDelete, setConfirmDelete] = useState<EventListItem | null>(null)
  const [error, setError] = useState<EventMutationError | null>(null)

  // Keep local order in sync if the server re-renders with fresh data.
  if (events !== items && events.map((e) => e.id).join() !== items.map((e) => e.id).join()) {
    setItems(events)
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= items.length) return
    const next = items.slice()
    ;[next[index], next[target]] = [next[target], next[index]]
    setItems(next)
    setError(null)
    startTransition(async () => {
      const res = await reorderTournamentEvents(
        tournamentId,
        next.map((e) => e.id),
      )
      if (!res.ok) {
        setItems(items) // revert
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function onDelete(ev: EventListItem) {
    setError(null)
    startTransition(async () => {
      const res = await deleteTournamentEvent(tournamentId, ev.id, ev.version)
      setConfirmDelete(null)
      if (!res.ok) {
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-serif font-bold text-[16px] text-ink">{t('section_title')}</h2>
        <Link
          href={`/admin/giai-dau/${tournamentId}/noi-dung/new`}
          className="flex-none font-semibold text-[12.5px] px-4 py-2 rounded-full bg-rose text-white hover:bg-rose-deep transition-all"
        >
          + {t('add_cta')}
        </Link>
      </div>

      {error && <p className="text-[12px] text-rose mb-3 max-w-[420px]">{t(`err_${error}`)}</p>}

      {items.length === 0 ? (
        <div className="bg-cream border border-line rounded-2xl py-10 px-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-paper border border-line grid place-items-center text-[20px] mx-auto mb-3 shadow-sm">
            🎯
          </div>
          <h3 className="font-serif font-bold text-[15.5px] text-ink mb-1">{t('empty_title')}</h3>
          <p className="text-[13px] text-muted max-w-[300px] mx-auto leading-relaxed mb-4">{t('empty_sub')}</p>
          <Link
            href={`/admin/giai-dau/${tournamentId}/noi-dung/new`}
            className="inline-block font-semibold text-[12.5px] px-4 py-2 rounded-full bg-rose text-white hover:bg-rose-deep transition-all"
          >
            + {t('add_cta')}
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((ev, i) => (
            <div
              key={ev.id}
              className="bg-paper border border-line rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:border-rose/25 transition-all"
            >
              {/* Order controls */}
              <div className="flex sm:flex-col gap-1 flex-none">
                <button
                  type="button"
                  disabled={pending || i === 0}
                  onClick={() => move(i, -1)}
                  aria-label={t('move_up')}
                  className="w-7 h-7 grid place-items-center rounded-lg border border-line bg-cream text-muted hover:text-rose hover:border-rose/35 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={pending || i === items.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label={t('move_down')}
                  className="w-7 h-7 grid place-items-center rounded-lg border border-line bg-cream text-muted hover:text-rose hover:border-rose/35 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  ↓
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <EventStatusBadge status={ev.status} label={t(`status_${ev.status}`)} />
                  <span className="text-[11.5px] text-muted">{t(`format_${ev.format}`)}</span>
                </div>
                <h3 className="font-serif font-bold text-[16px] leading-snug text-ink truncate">{ev.name}</h3>
                <p className="text-[12px] text-muted mt-0.5">
                  👥 {t('competitor_count', { count: ev.competitorCount })}
                </p>
              </div>

              <div className="flex gap-2 flex-none">
                <Link
                  href={`/admin/giai-dau/${tournamentId}/noi-dung/${ev.id}`}
                  className="text-[12.5px] font-semibold px-3 py-[7px] rounded-lg bg-cream text-[#5c4d44] border border-line hover:border-rose/35 hover:text-rose transition-all"
                >
                  {t('open')}
                </Link>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setError(null)
                    setConfirmDelete(ev)
                  }}
                  className="text-[12.5px] font-semibold px-3 py-[7px] rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-500 hover:text-white hover:border-transparent disabled:opacity-50 transition-all"
                >
                  {t('delete')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        icon="🗑️"
        tone="danger"
        title={t('confirm_delete_title')}
        description={t('confirm_delete_desc')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        pending={pending}
        onConfirm={() => confirmDelete && onDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
