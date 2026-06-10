'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { avatarSrc } from '@/lib/avatar'

export type UserRow = {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  provider: string
  createdAt: string
  lastSignIn: string | null
  isAdmin: boolean
  postCount: number
  placeCount: number
}

const PROVIDER_BADGE: Record<string, string> = {
  google:   'bg-blue-50 text-blue-700 border-blue-200',
  facebook: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  email:    'bg-paper text-muted border-line',
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', {
    timeZone: 'Asia/Tokyo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
}

const PAGE_SIZE = 20
const GRID = 'grid-cols-1 sm:grid-cols-[2fr_1fr_1.4fr_1.4fr_70px_70px_90px]'

type ProviderFilter = 'all' | 'email' | 'google' | 'facebook'
type RoleFilter     = 'all' | 'user' | 'admin'

export default function AdminUsersClient({ users }: { users: UserRow[] }) {
  const t = useTranslations('admin')

  const [search,         setSearch]         = useState('')
  const [filterProvider, setFilterProvider] = useState<ProviderFilter>('all')
  const [filterRole,     setFilterRole]     = useState<RoleFilter>('all')
  const [page,           setPage]           = useState(1)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter(u => {
      if (q && !u.displayName.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false
      if (filterProvider !== 'all' && u.provider !== filterProvider) return false
      if (filterRole === 'admin' && !u.isAdmin)  return false
      if (filterRole === 'user'  &&  u.isAdmin)  return false
      return true
    })
  }, [users, search, filterProvider, filterRole])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages)
  const pageUsers  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function handleSearch(v: string)            { setSearch(v);          setPage(1) }
  function handleProvider(v: ProviderFilter)  { setFilterProvider(v);  setPage(1) }
  function handleRole(v: RoleFilter)          { setFilterRole(v);      setPage(1) }

  const selectCls = 'text-[12.5px] px-3 py-2 rounded-xl border border-line bg-paper text-muted focus:outline-none focus:border-rose/50 cursor-pointer transition-colors'

  return (
    <div>
      {/* ── Search + filter bar ── */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => handleSearch(e.target.value)}
          placeholder={t('search_placeholder')}
          className="flex-1 min-w-[180px] text-[13px] px-3 py-2 rounded-xl border border-line bg-paper text-ink placeholder:text-muted/50 focus:outline-none focus:border-rose/50 focus:ring-1 focus:ring-rose/20 transition-all"
        />

        <select value={filterProvider} onChange={e => handleProvider(e.target.value as ProviderFilter)} className={selectCls}>
          <option value="all">{t('filter_all_providers')}</option>
          <option value="email">Email</option>
          <option value="google">Google</option>
          <option value="facebook">Facebook</option>
        </select>

        <select value={filterRole} onChange={e => handleRole(e.target.value as RoleFilter)} className={selectCls}>
          <option value="all">{t('filter_all_roles')}</option>
          <option value="user">{t('role_user')}</option>
          <option value="admin">Admin</option>
        </select>

        <span className="text-[12px] text-muted/50 flex-none tabular-nums">
          {filtered.length} / {users.length}
        </span>
      </div>

      {/* ── Table header ── */}
      <div className={`hidden sm:grid ${GRID} gap-3 px-4 py-2 text-[11.5px] font-semibold text-muted uppercase tracking-[0.5px] border-b border-line mb-1`}>
        <span>{t('col_users')}</span>
        <span>{t('col_provider')}</span>
        <span>{t('col_registered_date')}</span>
        <span>{t('col_last_signin')}</span>
        <span className="text-center">{t('col_posts')}</span>
        <span className="text-center">{t('col_places')}</span>
        <span className="text-center">{t('col_role')}</span>
      </div>

      {/* ── No results ── */}
      {pageUsers.length === 0 && (
        <div className="bg-paper border border-line rounded-2xl py-12 px-8 text-center">
          <div className="text-[36px] mb-2">🔍</div>
          <p className="text-[14px] text-muted">{t('no_users_found')}</p>
        </div>
      )}

      {/* ── User rows ── */}
      {pageUsers.length > 0 && (
        <div className="space-y-1.5">
          {pageUsers.map((u) => (
            <div
              key={u.id}
              className={`bg-paper border rounded-xl px-4 py-3.5 grid ${GRID} gap-2 sm:gap-3 sm:items-center transition-all hover:border-rose/25 hover:shadow-sm ${
                u.isAdmin ? 'border-amber-200 bg-amber-50/30' : 'border-line'
              }`}
            >
              {/* User */}
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full flex-none overflow-hidden bg-gradient-to-br from-rose/30 to-teal/30 grid place-items-center text-[14px] font-bold text-ink">
                  {u.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarSrc(u.avatarUrl)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    u.displayName[0]?.toUpperCase()
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-[13.5px] text-ink truncate leading-snug">{u.displayName}</div>
                  <div className="text-[11.5px] text-muted truncate">{u.email}</div>
                </div>
              </div>

              {/* Provider */}
              <div>
                <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-[3px] rounded-full border capitalize ${PROVIDER_BADGE[u.provider] ?? PROVIDER_BADGE.email}`}>
                  {u.provider}
                </span>
              </div>

              {/* Registered */}
              <div className="text-[11.5px] text-muted leading-snug">
                {fmt(u.createdAt)}
              </div>

              {/* Last login */}
              <div className="text-[11.5px] text-muted leading-snug">
                {u.lastSignIn
                  ? fmt(u.lastSignIn)
                  : <span className="text-muted/50 italic">{t('last_signin_none')}</span>
                }
              </div>

              {/* Posts */}
              <div className="text-center">
                <span className="text-[14px] font-bold text-ink">{u.postCount}</span>
                <div className="text-[10px] text-muted">{t('unit_posts')}</div>
              </div>

              {/* Places */}
              <div className="text-center">
                <span className="text-[14px] font-bold text-ink">{u.placeCount}</span>
                <div className="text-[10px] text-muted">{t('unit_places')}</div>
              </div>

              {/* Role */}
              <div className="text-center">
                {u.isAdmin ? (
                  <span className="inline-flex whitespace-nowrap text-[11px] font-semibold px-2 py-[3px] rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                    Admin
                  </span>
                ) : (
                  <span className="inline-flex whitespace-nowrap text-[11px] font-semibold px-2 py-[3px] rounded-full bg-paper text-muted border border-line">
                    {t('role_user')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-5 pt-4 border-t border-line/50">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="text-[13px] font-semibold px-4 py-2 rounded-xl border border-line bg-paper text-muted hover:bg-cream/60 hover:border-rose/30 hover:text-rose disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            ← {t('page_prev')}
          </button>

          <span className="text-[13px] text-muted tabular-nums">
            {t('page_label')} {safePage} / {totalPages}
          </span>

          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="text-[13px] font-semibold px-4 py-2 rounded-xl border border-line bg-paper text-muted hover:bg-cream/60 hover:border-rose/30 hover:text-rose disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {t('page_next')} →
          </button>
        </div>
      )}
    </div>
  )
}
