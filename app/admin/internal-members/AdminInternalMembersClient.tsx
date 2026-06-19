'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import UserAvatar from '@/components/UserAvatar'
import { changeMembership } from './actions'

export type MemberRow = {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  status: 'active' | 'community' | 'revoked'
  approvedAt: string | null
  approvedByEmail: string | null
  revokedAt: string | null
  isAdmin: boolean
}

const PAGE = 30

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default function AdminInternalMembersClient({ rows }: { rows: MemberRow[] }) {
  const t = useTranslations('access')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'community' | 'revoked'>('all')
  const [limit, setLimit] = useState(PAGE)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false
      if (!needle) return true
      return (
        r.displayName.toLowerCase().includes(needle) ||
        r.email.toLowerCase().includes(needle) ||
        r.id.toLowerCase().includes(needle)
      )
    })
  }, [rows, q, filter])

  const shown = filtered.slice(0, limit)

  const badge = (status: MemberRow['status']) => {
    if (status === 'active') return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    if (status === 'revoked') return 'bg-red-50 text-red-600 border border-red-200'
    return 'bg-cream text-muted border border-line'
  }
  const statusLabel = (status: MemberRow['status']) =>
    status === 'active' ? t('status_active') : status === 'revoked' ? t('status_revoked') : t('status_community')

  return (
    <div>
      {/* Search + filter */}
      <div className="flex gap-2.5 flex-wrap mb-5">
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }}
          placeholder={t('admin_search_placeholder')}
          className="flex-1 min-w-[220px] px-4 py-2.5 rounded-full border border-line bg-paper text-[14px] focus:outline-none focus:border-rose/50 focus:ring-2 focus:ring-rose/10"
        />
        <div className="flex gap-1.5">
          {(['all', 'active', 'community', 'revoked'] as const).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setLimit(PAGE) }}
              className={`text-[12.5px] font-semibold px-3.5 py-2 rounded-full border transition-all ${
                filter === f ? 'border-rose bg-rose/10 text-rose' : 'border-line bg-paper text-muted hover:border-rose/30'
              }`}
            >
              {f === 'all' ? t('filter_all') : statusLabel(f)}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl py-14 text-center text-[14px] text-muted">
          {t('admin_no_results')}
        </div>
      ) : (
        <div className="space-y-2.5">
          {shown.map((r) => (
            <div key={r.id} className="bg-paper border border-line rounded-2xl p-4 flex items-center gap-4 flex-wrap">
              <UserAvatar src={r.avatarUrl} name={r.displayName} size={40} className="ring-2 ring-white flex-none" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-[14px] text-ink truncate">{r.displayName}</span>
                  {r.isAdmin && (
                    <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Admin</span>
                  )}
                  <span className={`text-[10.5px] font-bold px-2 py-0.5 rounded-full ${badge(r.status)}`}>{statusLabel(r.status)}</span>
                </div>
                <div className="text-[12px] text-muted truncate">{r.email}</div>
                <div className="text-[11px] text-muted/80 mt-0.5">
                  {r.status === 'active' && (
                    <>{t('admin_granted_on')} {fmtDate(r.approvedAt)}{r.approvedByEmail ? ` · ${t('admin_by')} ${r.approvedByEmail}` : ''}</>
                  )}
                  {r.status === 'revoked' && <>{t('admin_revoked_on')} {fmtDate(r.revokedAt)}</>}
                </div>
              </div>

              <div className="flex gap-2 flex-none">
                {r.status === 'active' ? (
                  <form action={changeMembership}>
                    <input type="hidden" name="user_id" value={r.id} />
                    <input type="hidden" name="action" value="revoke" />
                    <button className="text-[12.5px] font-semibold px-4 py-2 rounded-full border border-red-200 text-red-500 hover:bg-red-50 transition-all">
                      {t('admin_revoke')}
                    </button>
                  </form>
                ) : (
                  <form action={changeMembership}>
                    <input type="hidden" name="user_id" value={r.id} />
                    <input type="hidden" name="action" value={r.status === 'revoked' ? 'reactivate' : 'grant'} />
                    <button className="text-[12.5px] font-semibold px-4 py-2 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition-all">
                      {r.status === 'revoked' ? t('admin_reactivate') : t('admin_grant')}
                    </button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {filtered.length > limit && (
        <div className="text-center mt-6">
          <button
            onClick={() => setLimit((n) => n + PAGE)}
            className="text-[13px] font-semibold px-6 py-2.5 rounded-full border border-line bg-paper hover:border-rose/30 transition-all text-ink"
          >
            {t('admin_load_more')}
          </button>
        </div>
      )}
    </div>
  )
}
