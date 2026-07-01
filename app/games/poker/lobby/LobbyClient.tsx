'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import type { LobbyTable } from '@/lib/games/poker/lifecycle'
import { listLobby, joinTable } from '../actions'
import QuickPlayButton from '../_eco/QuickPlayButton'
import { coins } from '../_eco/format'

export default function LobbyClient({ initialTables }: { initialTables: LobbyTable[] | null }) {
  const t = useTranslations('games.poker')
  const locale = useLocale()
  const router = useRouter()
  const [tables, setTables] = useState<LobbyTable[] | null>(initialTables)
  const [error, setError] = useState(initialTables === null)
  const [loading, setLoading] = useState(false)
  const [join, setJoin] = useState<LobbyTable | null>(null)

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

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold">{t('lobby.title')}</h1>
          <p className="text-sm text-muted">{t('lobby.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <QuickPlayButton
            className="inline-flex items-center justify-center rounded-lg bg-rose px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          />
          <Link
            href="/games/poker/create"
            className="inline-flex items-center justify-center rounded-lg border border-line bg-paper px-4 py-2 text-sm font-medium hover:border-rose"
          >
            {t('lobby.create')}
          </Link>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center justify-center rounded-lg border border-line bg-paper px-3 py-2 text-sm hover:border-rose disabled:opacity-60"
          >
            {t('lobby.refresh')}
          </button>
        </div>
      </div>

      {error ? (
        <EmptyBox title={t('lobby.error_title')}>
          <button onClick={refresh} className="mt-3 rounded-lg bg-rose px-4 py-2 text-sm font-medium text-white">
            {t('lobby.retry')}
          </button>
        </EmptyBox>
      ) : tables === null ? (
        <p className="py-16 text-center text-muted">{t('lobby.loading')}</p>
      ) : tables.length === 0 ? (
        <EmptyBox title={t('lobby.empty_title')}>
          <p className="mt-1 text-sm text-muted">{t('lobby.empty_hint')}</p>
        </EmptyBox>
      ) : (
        <ul className="space-y-2">
          {tables.map((tb) => (
            <TableRow key={tb.tableId} tb={tb} locale={locale} onJoin={() => setJoin(tb)} />
          ))}
        </ul>
      )}

      {join && (
        <JoinDialog
          table={join}
          onClose={() => setJoin(null)}
          onEntered={(id) => router.push(`/games/poker/${id}`)}
        />
      )}
    </div>
  )
}

function EmptyBox({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line bg-paper/60 px-6 py-16 text-center">
      <p className="font-serif text-lg font-semibold">{title}</p>
      {children}
    </div>
  )
}

function TableRow({ tb, locale, onJoin }: { tb: LobbyTable; locale: string; onJoin: () => void }) {
  const t = useTranslations('games.poker')
  const statusLabel =
    tb.status === 'open' ? t('lobby.status_open') : tb.status === 'closing' ? t('lobby.status_closing') : t('lobby.status_closed')

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {tb.isPrivate && <span aria-hidden title={t('lobby.type_private')}>🔒</span>}
          <p className="truncate font-medium">{tb.name}</p>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              tb.status === 'open' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {statusLabel}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted">
          {t('lobby.col_blinds')} {coins(tb.smallBlind, locale)}/{coins(tb.bigBlind, locale)} ·{' '}
          {t('lobby.col_buyin')} {coins(tb.minBuyIn, locale)}–{coins(tb.maxBuyIn, locale)} ·{' '}
          {t('lobby.seats', { occupied: tb.occupiedSeats, capacity: tb.capacity })} ·{' '}
          {tb.allowSpectators ? t('lobby.spectators') : t('lobby.no_spectators')}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {tb.joinable ? (
          <button onClick={onJoin} className="rounded-lg bg-rose px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            {t('lobby.join')}
          </button>
        ) : (
          <span className="rounded-lg bg-line px-4 py-2 text-sm text-muted">{t('lobby.full')}</span>
        )}
        {tb.spectatable && (
          <Link
            href={`/games/poker/${tb.tableId}`}
            className="rounded-lg border border-line px-4 py-2 text-sm hover:border-rose"
          >
            {t('lobby.watch')}
          </Link>
        )}
      </div>
    </li>
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

  function submit() {
    setError(null)
    start(async () => {
      const res = await joinTable(table.tableId, table.isPrivate ? password : undefined)
      if (res.ok) onEntered(table.tableId)
      else setError(res.error)
    })
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl bg-paper p-6 shadow-xl">
        <h3 className="font-serif text-lg font-semibold">{table.isPrivate ? t('join.title') : table.name}</h3>
        {table.isPrivate && (
          <>
            <p className="mt-1 text-sm text-muted">{t('join.prompt')}</p>
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={t('join.password_ph')}
              className="mt-3 w-full rounded-lg border border-line bg-cream px-3 py-2 outline-none focus:border-rose"
            />
          </>
        )}
        {error && (
          <p className="mt-2 text-sm text-rose">
            {error === 'wrong_password'
              ? t('error.wrong_password')
              : error === 'table_not_open'
                ? t('error.table_not_open')
                : t('error.generic')}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-line px-4 py-2 text-sm hover:border-rose">
            {t('join.cancel')}
          </button>
          <button
            onClick={submit}
            disabled={pending || (table.isPrivate && !password)}
            className="rounded-lg bg-rose px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {t('join.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
