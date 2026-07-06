'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createTournament } from '../tournament-actions'

// Operator-only create form. Only the supported/audited fields are configurable; the server
// re-validates every value (validateTournamentConfig) and rejects negatives/excess/inconsistency.
export default function CreateTournamentForm() {
  const t = useTranslations('games.poker.tournaments')
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '', template: 'stt_6max' as 'stt_6max' | 'mtt',
    entryFee: 1000, startingStack: 5000, maxEntries: 6, seatsPerTable: 6, guaranteedPrizePool: 0,
  })
  const num = (v: string) => Math.max(0, Math.floor(Number(v) || 0))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    const res = await createTournament({
      title: form.title, template: form.template,
      entryFee: form.entryFee, startingStack: form.startingStack, maxEntries: form.maxEntries,
      seatsPerTable: form.seatsPerTable, guaranteedPrizePool: form.guaranteedPrizePool,
    })
    if (res.ok) { router.push(`/games/poker/tournaments/${res.id}`); return }
    setBusy(false)
    setError(res.error.startsWith('invalid_config') ? t('error.invalid_config')
      : res.error === 'not_operator' ? t('error.not_operator') : t('error.generic'))
  }

  const field = 'w-full rounded-lg border border-line bg-paper px-3 py-2 text-ink focus-visible:outline-2 focus-visible:outline-rose'
  const labelCls = 'block text-sm font-medium text-ink'

  return (
    <form onSubmit={submit} className="flex max-w-lg flex-col gap-4">
      <div>
        <label htmlFor="tn" className={labelCls}>{t('operator.name')}</label>
        <input id="tn" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
          className={field} maxLength={120} />
      </div>
      <div>
        <label htmlFor="tt" className={labelCls}>{t('operator.template')}</label>
        <select id="tt" value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value as 'stt_6max' | 'mtt' })} className={field}>
          <option value="stt_6max">{t('operator.template_stt')}</option>
          <option value="mtt">{t('operator.template_mtt')}</option>
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="ef" className={labelCls}>{t('operator.entry_fee')}</label>
          <input id="ef" type="number" min={1} value={form.entryFee} onChange={(e) => setForm({ ...form, entryFee: num(e.target.value) })} className={field} />
        </div>
        <div>
          <label htmlFor="ss" className={labelCls}>{t('operator.starting_stack')}</label>
          <input id="ss" type="number" min={1} value={form.startingStack} onChange={(e) => setForm({ ...form, startingStack: num(e.target.value) })} className={field} />
        </div>
        <div>
          <label htmlFor="me" className={labelCls}>{t('operator.max_entries')}</label>
          <input id="me" type="number" min={2} value={form.maxEntries} onChange={(e) => setForm({ ...form, maxEntries: num(e.target.value) })} className={field} />
        </div>
        <div>
          <label htmlFor="sp" className={labelCls}>{t('operator.seats_per_table')}</label>
          <input id="sp" type="number" min={2} max={10} value={form.seatsPerTable} onChange={(e) => setForm({ ...form, seatsPerTable: num(e.target.value) })} className={field} />
        </div>
        <div className="col-span-2">
          <label htmlFor="gp" className={labelCls}>{t('operator.guarantee')}</label>
          <input id="gp" type="number" min={0} value={form.guaranteedPrizePool} onChange={(e) => setForm({ ...form, guaranteedPrizePool: num(e.target.value) })} className={field} />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-rose">{error}</p>}
      <button type="submit" disabled={busy}
        className="inline-flex items-center justify-center rounded-lg bg-rose px-5 py-2.5 font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60">
        {busy ? t('operator.creating') : t('operator.create')}
      </button>
    </form>
  )
}
