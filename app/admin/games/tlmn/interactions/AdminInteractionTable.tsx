'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { upsertInteractionCatalog } from './actions'

export type AdminRow = {
  key: string
  kind: 'phrase' | 'throwable'
  emoji: string
  category: string | null
  coin_cost: number
  free_daily_limit: number
  cooldown_ms: number
  is_enabled: boolean
  sort_order: number
  seeded: boolean
}

// Editable catalog table. Each row saves independently (upsert); a fresh row (not yet in the
// DB) is created on first save. No code deploy needed to retune the economy or disable an item.
export default function AdminInteractionTable({ rows }: { rows: AdminRow[] }) {
  const t = useTranslations('admin_tlmn_react')
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-[13px] min-w-[760px]">
        <thead className="bg-cream text-ink">
          <tr className="text-left">
            <th className="px-3 py-2 font-bold">{t('col_item')}</th>
            <th className="px-3 py-2 font-bold">{t('col_kind')}</th>
            <th className="px-3 py-2 font-bold">{t('col_cost')}</th>
            <th className="px-3 py-2 font-bold">{t('col_free')}</th>
            <th className="px-3 py-2 font-bold">{t('col_cooldown')}</th>
            <th className="px-3 py-2 font-bold">{t('col_sort')}</th>
            <th className="px-3 py-2 font-bold">{t('col_enabled')}</th>
            <th className="px-3 py-2 font-bold" />
          </tr>
        </thead>
        <tbody>
          {rows.map(r => <Row key={r.key} row={r} t={t} />)}
        </tbody>
      </table>
    </div>
  )
}

function Row({ row, t }: { row: AdminRow; t: ReturnType<typeof useTranslations> }) {
  const [cost, setCost] = useState(String(row.coin_cost))
  const [free, setFree] = useState(String(row.free_daily_limit))
  const [cooldown, setCooldown] = useState(String(row.cooldown_ms))
  const [sort, setSort] = useState(String(row.sort_order))
  const [enabled, setEnabled] = useState(row.is_enabled)
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [pending, start] = useTransition()

  const save = () => {
    setStatus('idle')
    start(async () => {
      const res = await upsertInteractionCatalog({
        key: row.key, kind: row.kind, category: row.category,
        coin_cost: Number(cost) || 0,
        free_daily_limit: Number(free) || 0,
        cooldown_ms: Number(cooldown) || 0,
        is_enabled: enabled,
        sort_order: Number(sort) || 0,
      })
      setStatus(res.ok ? 'saved' : 'error')
    })
  }

  const num = 'w-16 rounded-md border border-line px-2 py-1 text-[12.5px] bg-paper'
  return (
    <tr className="border-t border-line/70">
      <td className="px-3 py-2 whitespace-nowrap">
        <span aria-hidden className="text-[16px] mr-1.5">{row.emoji}</span>
        <span className="font-semibold text-ink">{row.key}</span>
        {!row.seeded && <span className="ml-1.5 text-[10px] text-amber-700 bg-amber-100 rounded px-1 py-0.5">{t('not_seeded')}</span>}
      </td>
      <td className="px-3 py-2 text-muted">{row.kind}</td>
      <td className="px-3 py-2"><input className={num} inputMode="numeric" value={cost} onChange={e => setCost(e.target.value)} /></td>
      <td className="px-3 py-2"><input className={num} inputMode="numeric" value={free} onChange={e => setFree(e.target.value)} /></td>
      <td className="px-3 py-2"><input className={num} inputMode="numeric" value={cooldown} onChange={e => setCooldown(e.target.value)} /></td>
      <td className="px-3 py-2"><input className={num} inputMode="numeric" value={sort} onChange={e => setSort(e.target.value)} /></td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={() => setEnabled(v => !v)}
          aria-pressed={enabled}
          className={`text-[11px] font-bold rounded-full px-2.5 py-1 ${enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-rose/10 text-rose'}`}
        >
          {enabled ? t('enabled') : t('disabled')}
        </button>
      </td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="text-[12px] font-bold rounded-lg bg-rose text-white px-3 py-1.5 disabled:opacity-50"
        >
          {pending ? '…' : t('save')}
        </button>
        {status === 'saved' && <span className="ml-2 text-[11px] text-emerald-600">{t('saved')}</span>}
        {status === 'error' && <span className="ml-2 text-[11px] text-rose">{t('error')}</span>}
      </td>
    </tr>
  )
}
