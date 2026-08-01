'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import StatusBadge from '@/components/tournaments/admin/StatusBadge'
import TournamentStatusActions from '@/components/tournaments/admin/TournamentStatusActions'
import type { TournamentStatus } from '@/lib/tournaments/admin/types'
import type { ManageableTournament } from '@/lib/tournaments/members'
import {
  MANAGEMENT_STATUS_FILTERS,
  selectManageableTournaments,
  type ManagementSortOption,
  type ManagementStatusFilter,
} from '@/lib/tournaments/management/list-view'
import ManagementIcon, { type ManagementIconName } from './ManagementIcon'

type RowCaps = {
  publish: boolean
  archive: boolean
  delete: boolean
  canEdit: boolean
  showActions: boolean
}

export type ManagementListItem = ManageableTournament & { rowCaps: RowCaps }

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function MetadataItem({
  icon,
  label,
  children,
}: {
  icon: ManagementIconName
  label: string
  children: React.ReactNode
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2 text-[13px] leading-5 text-muted" title={label}>
      <span className="grid h-7 w-7 flex-none place-items-center rounded-lg bg-cream text-[#9a7d68]">
        <ManagementIcon name={icon} className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 break-words">{children}</span>
    </span>
  )
}

export default function TournamentManagementList({
  items,
  basePath,
  siteAdmin,
}: {
  items: ManagementListItem[]
  basePath: string
  siteAdmin: boolean
}) {
  const t = useTranslations('tournament_management')
  const ta = useTranslations('admin_tournaments')
  const tr = useTranslations('tournament_roles')
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<ManagementStatusFilter>('all')
  const [sort, setSort] = useState<ManagementSortOption>('updated')

  const visibleItems = useMemo(
    () => selectManageableTournaments(items, query, status, sort),
    [items, query, sort, status],
  )
  const filtered = query.trim().length > 0 || status !== 'all' || sort !== 'updated'

  function resetFilters() {
    setQuery('')
    setStatus('all')
    setSort('updated')
  }

  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-line bg-paper px-6 py-14 text-center shadow-[0_4px_20px_rgba(36,26,23,0.04)] sm:px-8 sm:py-16">
        <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-rose/15 bg-rose-soft text-rose">
          <ManagementIcon name="empty" className="h-7 w-7" />
        </div>
        <h2 className="mb-2 font-serif text-[20px] font-bold text-ink">{t('empty_title')}</h2>
        <p className="mx-auto mb-6 max-w-[420px] text-[13.5px] leading-relaxed text-muted">
          {siteAdmin ? t('empty_sub_admin') : t('empty_sub_create')}
        </p>
        <Link
          href={`${basePath}/new`}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-rose px-5 text-[13.5px] font-semibold text-white transition-colors hover:bg-rose-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 focus-visible:ring-offset-2"
        >
          <ManagementIcon name="plus" className="h-4 w-4" />
          {ta('create_cta')}
        </Link>
      </section>
    )
  }

  return (
    <section aria-label={t('list_region_label')}>
      <div className="mb-5 rounded-2xl border border-line bg-paper p-3 shadow-[0_3px_18px_rgba(36,26,23,0.035)] sm:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(280px,1fr)_190px_240px_auto]">
          <label className="relative sm:col-span-2 lg:col-span-1">
            <span className="sr-only">{t('search_label')}</span>
            <ManagementIcon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('search_placeholder')}
              className="h-11 w-full rounded-xl border border-line bg-[#fffefb] pl-10 pr-3 text-[13.5px] text-ink outline-none transition-colors placeholder:text-muted/70 hover:border-[#d9c9b7] focus:border-rose/45 focus:ring-2 focus:ring-rose/10"
            />
          </label>

          <label className="relative">
            <span className="sr-only">{t('filter_label')}</span>
            <ManagementIcon name="filter" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as ManagementStatusFilter)}
              className="h-11 w-full appearance-none rounded-xl border border-line bg-[#fffefb] pl-10 pr-9 text-[13.5px] font-medium text-ink outline-none transition-colors hover:border-[#d9c9b7] focus:border-rose/45 focus:ring-2 focus:ring-rose/10"
            >
              {MANAGEMENT_STATUS_FILTERS.map((option) => (
                <option key={option} value={option}>{ta(`filter_${option}`)}</option>
              ))}
            </select>
            <svg aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
            </svg>
          </label>

          <label className="relative">
            <span className="sr-only">{t('sort_label')}</span>
            <ManagementIcon name="sort" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as ManagementSortOption)}
              className="h-11 w-full appearance-none rounded-xl border border-line bg-[#fffefb] pl-10 pr-9 text-[13.5px] font-medium text-ink outline-none transition-colors hover:border-[#d9c9b7] focus:border-rose/45 focus:ring-2 focus:ring-rose/10"
            >
              <option value="updated">{t('sort_updated')}</option>
              <option value="starts">{t('sort_starts')}</option>
            </select>
            <svg aria-hidden className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m6 9 6 6 6-6" />
            </svg>
          </label>

          <button
            type="button"
            onClick={resetFilters}
            disabled={!filtered}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-cream px-4 text-[13px] font-semibold text-[#5c4d44] transition-colors hover:border-rose/30 hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/35 disabled:cursor-default disabled:opacity-45"
          >
            <ManagementIcon name="reset" className="h-4 w-4" />
            {t('clear_filters')}
          </button>
        </div>

        <p className="mt-3 px-1 text-[12px] font-medium text-muted" aria-live="polite">
          {t('results_count', { shown: visibleItems.length, total: items.length })}
        </p>
      </div>

      {visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-paper px-6 py-12 text-center sm:px-8">
          <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-cream text-muted">
            <ManagementIcon name="search" className="h-6 w-6" />
          </div>
          <h2 className="mb-1.5 font-serif text-[18px] font-bold text-ink">{t('no_results_title')}</h2>
          <p className="mx-auto mb-5 max-w-[420px] text-[13.5px] leading-relaxed text-muted">{t('no_results_sub')}</p>
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-line bg-cream px-4 text-[13px] font-semibold text-[#5c4d44] transition-colors hover:border-rose/30 hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/35"
          >
            <ManagementIcon name="reset" className="h-4 w-4" />
            {t('clear_filters')}
          </button>
        </div>
      ) : (
        <ul className="space-y-3.5">
          {visibleItems.map((item) => {
            const statusValue = item.status as TournamentStatus
            return (
              <li key={item.id}>
                <article className="rounded-2xl border border-line bg-paper p-5 shadow-[0_3px_18px_rgba(36,26,23,0.035)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-rose/25 hover:shadow-card focus-within:border-rose/30 focus-within:shadow-card motion-reduce:transform-none sm:p-6 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-6">
                  <div className="min-w-0">
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      <StatusBadge status={statusValue} label={ta(`status_${statusValue}`)} />
                      <span className="inline-flex items-center rounded-full border border-line bg-cream px-2.5 py-1 text-[11px] font-semibold text-[#6b5a4f]">
                        {tr(`role_${item.viewerRole}`)}
                      </span>
                    </div>

                    <h2 className="max-w-[760px] break-words font-serif text-[18px] font-bold leading-snug text-ink sm:text-[19px]" title={item.name}>
                      {item.name}
                    </h2>
                    <p className="mt-1 max-w-[760px] truncate font-mono text-[12px] text-muted" title={`/${item.slug}`}>
                      /{item.slug}
                    </p>

                    <div className="mt-4 grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2 xl:flex xl:flex-wrap xl:items-center">
                      <MetadataItem icon="calendar" label={ta('f_starts')}>
                        {fmtDate(item.startsAt)} – {fmtDate(item.endsAt)}
                      </MetadataItem>
                      {item.location && (
                        <MetadataItem icon="pin" label={ta('f_location')}>{item.location}</MetadataItem>
                      )}
                      <MetadataItem icon="events" label={ta('events_label')}>
                        {ta('events_count', { count: item.eventCount })}
                      </MetadataItem>
                      <MetadataItem icon="clock" label={ta('updated_at')}>{fmtDate(item.updatedAt)}</MetadataItem>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4 lg:mt-0 lg:justify-end lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                    <Link
                      href={`${basePath}/${item.id}`}
                      className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-line bg-cream px-4 text-[13px] font-semibold text-[#5c4d44] transition-colors hover:border-rose/30 hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/35 sm:flex-none"
                    >
                      {ta('action_view')}
                    </Link>
                    {item.rowCaps.canEdit && (
                      <Link
                        href={`${basePath}/${item.id}/edit`}
                        className="inline-flex min-h-10 flex-1 items-center justify-center rounded-xl border border-teal/25 bg-teal-soft px-4 text-[13px] font-semibold text-teal transition-colors hover:border-teal hover:bg-teal hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/35 sm:flex-none"
                      >
                        {ta('action_edit')}
                      </Link>
                    )}
                    {item.rowCaps.showActions && (
                      <div className="flex-none">
                        <TournamentStatusActions
                          id={item.id}
                          status={statusValue}
                          eventCount={item.eventCount}
                          updatedAt={item.updatedAt}
                          variant="menu"
                          basePath={basePath}
                          caps={item.rowCaps}
                        />
                      </div>
                    )}
                  </div>
                </article>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
