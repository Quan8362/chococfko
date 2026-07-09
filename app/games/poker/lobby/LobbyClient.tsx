'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { LobbyTable } from '@/lib/games/poker/lifecycle'
import { listLobby, joinTable } from '../actions'
import QuickPlayButton from '../_eco/QuickPlayButton'
import ReportProblemButton from '../_components/ReportProblemButton'
import { coins } from '../_eco/format'
import { Icon } from '../_eco/icons'
import { PageHeader, Eyebrow, EmptyState, SearchField } from '../_eco/ui'

type Filter = 'all' | 'open'

export default function LobbyClient({ initialTables }: { initialTables: LobbyTable[] | null }) {
  const t = useTranslations('games.poker')
  const locale = useLocale()
  const router = useRouter()
  const [tables, setTables] = useState<LobbyTable[] | null>(initialTables)
  const [error, setError] = useState(initialTables === null)
  const [loading, setLoading] = useState(false)
  const [join, setJoin] = useState<LobbyTable | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  async function refresh() {
    setLoading(true)
    setError(false)
    const res = await listLobby()
    if (res.ok) setTables(res.tables)
    else setError(true)
    setLoading(false)
  }

  useEffect(() => {
    if (initialTables === null) void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    if (!tables) return null
    const needle = query.trim().toLowerCase()
    return tables.filter((tb) => {
      if (filter === 'open' && !tb.joinable) return false
      if (needle && !tb.name.toLowerCase().includes(needle)) return false
      return true
    })
  }, [tables, query, filter])

  return (
    <div>
      <ReportProblemButton variant="floating" context={{ path: '/games/poker/lobby' }} />
      <PageHeader
        eyebrow={<Eyebrow icon="globe">{t('landing.feature_lobby')}</Eyebrow>}
        icon="globe"
        tone="ruby"
        title={t('lobby.title')}
        subtitle={t('lobby.subtitle')}
        actions={
          <>
            <QuickPlayButton className="pk-btn pk-btn-primary" label={t('lobby.quick_play')} />
            <Link href="/games/poker/create" className="pk-btn pk-btn-secondary">
              <Icon name="plus" size={17} /> {t('lobby.create')}
            </Link>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              aria-label={t('lobby.refresh')}
              className="pk-iconbtn"
            >
              <Icon name="refresh" size={18} className={loading ? 'animate-spin' : ''} />
            </button>
          </>
        }
      />

      {/* Search + filter — only meaningful once there are tables to sift. */}
      {tables && tables.length > 0 && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={t('lobby.search_ph')}
            clearLabel={t('glossary.clear_search')}
            className="flex-1 sm:max-w-xs"
          />
          <div role="group" aria-label={t('lobby.col_status')} className="flex gap-1.5">
            {(['all', 'open'] as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className="pk-seg pk-btn-sm"
              >
                {t(f === 'all' ? 'lobby.filter_all' : 'lobby.filter_open')}
              </button>
            ))}
          </div>
        </div>
      )}

      {error ? (
        <EmptyState icon="alert" tone="coral" title={t('lobby.error_title')}>
          <button onClick={refresh} className="pk-btn pk-btn-primary">
            <Icon name="refresh" size={16} /> {t('lobby.retry')}
          </button>
        </EmptyState>
      ) : tables === null ? (
        <LobbySkeleton />
      ) : filtered && filtered.length === 0 ? (
        tables.length === 0 ? (
          <EmptyState icon="cards" title={t('lobby.empty_title')} description={t('lobby.empty_hint')}>
            <div className="flex flex-wrap justify-center gap-2">
              <QuickPlayButton className="pk-btn pk-btn-primary" label={t('lobby.quick_play')} />
              <Link href="/games/poker/create" className="pk-btn pk-btn-secondary">
                <Icon name="plus" size={16} /> {t('lobby.create')}
              </Link>
            </div>
          </EmptyState>
        ) : (
          <EmptyState icon="search" title={t('lobby.no_match')} description={t('lobby.empty_hint')} />
        )
      ) : (
        <>
          <p className="mb-3 text-sm text-[color:var(--pkp-ink-2)]">{t('lobby.count', { count: filtered!.length })}</p>
          <ul className="grid gap-3 sm:grid-cols-2">
            {filtered!.map((tb) => (
              <TableCard key={tb.tableId} tb={tb} locale={locale} onJoin={() => setJoin(tb)} />
            ))}
          </ul>
        </>
      )}

      {join && (
        <JoinDialog table={join} onClose={() => setJoin(null)} onEntered={(id) => router.push(`/games/poker/${id}`)} />
      )}
    </div>
  )
}

function LobbySkeleton() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="pk-panel p-4">
          <div className="pk-skeleton h-5 w-2/3" />
          <div className="pk-skeleton mt-3 h-4 w-full" />
          <div className="mt-4 flex gap-2">
            <div className="pk-skeleton h-9 w-20" />
            <div className="pk-skeleton h-9 w-16" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function SeatMeter({ occupied, capacity }: { occupied: number; capacity: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {Array.from({ length: capacity }).map((_, i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: i < occupied ? 'var(--pkp-emerald)' : 'var(--pkp-surface-3)' }}
        />
      ))}
    </span>
  )
}

function TableCard({ tb, locale, onJoin }: { tb: LobbyTable; locale: string; onJoin: () => void }) {
  const t = useTranslations('games.poker')
  const full = !tb.joinable && tb.status === 'open'
  const statusTone = tb.status === 'open' ? (full ? 'amber' : 'emerald') : 'neutral'
  const statusLabel = tb.status === 'closing' ? t('lobby.status_closing') : tb.status === 'closed' ? t('lobby.status_closed') : full ? t('lobby.full') : t('lobby.status_open')

  return (
    <li className="pk-panel flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`pk-ichip ${tb.isPrivate ? 'pk-ichip-violet' : 'pk-ichip-ruby'} h-8 w-8 shrink-0`}
              title={tb.isPrivate ? t('lobby.type_private') : t('lobby.type_public')}
            >
              <Icon name={tb.isPrivate ? 'lock' : 'globe'} size={16} />
            </span>
            <p className="truncate font-serif text-base font-semibold text-[color:var(--pkp-ink)]">{tb.name}</p>
          </div>
        </div>
        <span className={`pk-badge pk-badge-${statusTone}`}>{statusLabel}</span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <Stat icon="coins" label={t('lobby.col_blinds')} value={`${coins(tb.smallBlind, locale)}/${coins(tb.bigBlind, locale)}`} />
        <Stat icon="layers" label={t('lobby.col_buyin')} value={`${coins(tb.minBuyIn, locale)}–${coins(tb.maxBuyIn, locale)}`} />
        <div>
          <dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-[color:var(--pkp-ink-3)]">
            <Icon name="users" size={12} /> {t('lobby.col_seats')}
          </dt>
          <dd className="mt-0.5 flex items-center gap-2">
            <span className="tabular-nums text-[color:var(--pkp-ink)]">{t('lobby.seats', { occupied: tb.occupiedSeats, capacity: tb.capacity })}</span>
            <SeatMeter occupied={tb.occupiedSeats} capacity={tb.capacity} />
          </dd>
        </div>
        <Stat
          icon="eye"
          label={t('lobby.col_type')}
          value={tb.allowSpectators ? t('lobby.spectators') : t('lobby.no_spectators')}
        />
      </dl>

      <div className="mt-4 flex items-center gap-2 border-t border-[color:var(--pkp-line)] pt-3">
        {tb.joinable ? (
          <button onClick={onJoin} className="pk-btn pk-btn-primary flex-1">
            <Icon name="play" size={16} /> {t('lobby.join')}
          </button>
        ) : (
          <span className="pk-btn pk-btn-secondary flex-1 cursor-default" title={t('lobby.full')} aria-disabled>
            {t('lobby.full')}
          </span>
        )}
        {tb.spectatable && (
          <Link href={`/games/poker/${tb.tableId}`} className="pk-btn pk-btn-secondary">
            <Icon name="eye" size={16} /> {t('lobby.watch')}
          </Link>
        )}
      </div>
    </li>
  )
}

function Stat({ icon, label, value }: { icon: 'coins' | 'layers' | 'eye'; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-[color:var(--pkp-ink-3)]">
        <Icon name={icon} size={12} /> {label}
      </dt>
      <dd className="mt-0.5 truncate tabular-nums text-[color:var(--pkp-ink)]">{value}</dd>
    </div>
  )
}

function JoinDialog({
  table,
  onClose,
  onEntered,
}: {
  table: LobbyTable
  onClose: () => void
  onEntered: (id: string) => void
}) {
  const t = useTranslations('games.poker')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (table.isPrivate) inputRef.current?.focus()
    else dialogRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [table.isPrivate, onClose])

  function submit() {
    setError(null)
    start(async () => {
      const res = await joinTable(table.tableId, table.isPrivate ? password : undefined)
      if (res.ok) onEntered(table.tableId)
      else setError(res.error)
    })
  }

  return (
    <div className="pk-dialog-backdrop place-items-center" role="presentation" onClick={onClose}>
      <div
        ref={dialogRef}
        className="pk-dialog pk-fade-up max-w-sm p-6"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pk-join-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className={`pk-ichip ${table.isPrivate ? 'pk-ichip-violet' : 'pk-ichip-ruby'} h-10 w-10`}>
            <Icon name={table.isPrivate ? 'lock' : 'play'} size={20} />
          </span>
          <h3 id="pk-join-title" className="font-serif text-lg font-semibold text-[color:var(--pkp-ink)]">
            {table.isPrivate ? t('join.title') : table.name}
          </h3>
        </div>

        {table.isPrivate && (
          <>
            <p className="mt-3 text-sm text-[color:var(--pkp-ink-2)]">{t('join.prompt')}</p>
            <input
              ref={inputRef}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={t('join.password_ph')}
              aria-label={t('join.password_ph')}
              className="pk-input mt-3"
            />
          </>
        )}

        {error && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-[color:var(--pkp-coral-tint)] px-3 py-2 text-sm text-[color:var(--pkp-coral-ink)]">
            <Icon name="alert" size={15} className="shrink-0" />
            {error === 'wrong_password'
              ? t('error.wrong_password')
              : error === 'table_not_open'
                ? t('error.table_not_open')
                : error === 'poker_joins_frozen'
                  ? t('error.poker_joins_frozen')
                  : error === 'poker_feature_off'
                    ? t('error.poker_feature_off')
                    : t('error.generic')}
          </p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="pk-btn pk-btn-ghost">
            {t('join.cancel')}
          </button>
          <button onClick={submit} disabled={pending || (table.isPrivate && !password)} className="pk-btn pk-btn-primary">
            {pending ? <Icon name="refresh" size={16} className="animate-spin" /> : <Icon name="play" size={16} />}
            {t('join.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
