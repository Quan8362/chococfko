'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useSavedPlaces } from '@/components/SavedPlacesProvider'
import { getMyLists, createList, addPlaceToList, type ListRow } from '@/app/lists/actions'
import { getMyPlans, createPlan, addStop, type PlanRow } from '@/app/plans/actions'

/** "Add to list / plan" — the Phase-4 deferred action, now backed by Phase 5. */
export default function AddToCollection({ slug, variant = 'button' }: { slug: string; variant?: 'button' | 'menu' }) {
  const t = useTranslations('trips')
  const td = useTranslations('place_detail')
  const { loggedIn } = useSavedPlaces()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'lists' | 'plans'>('lists')
  const [lists, setLists] = useState<ListRow[]>([])
  const [plans, setPlans] = useState<PlanRow[]>([])
  const [done, setDone] = useState<Set<string>>(new Set())
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(false)
  const [, start] = useTransition()

  const load = async () => {
    setLoading(true)
    const [l, p] = await Promise.all([getMyLists(), getMyPlans()])
    setLists(l); setPlans(p); setLoading(false)
  }
  const openModal = () => { setOpen(true); setDone(new Set()); if (loggedIn) void load() }

  const addToList = (id: string) => start(async () => { await addPlaceToList(id, slug); setDone((d) => new Set(d).add(`l${id}`)) })
  const addToPlan = (id: string) => start(async () => { await addStop(id, slug); setDone((d) => new Set(d).add(`p${id}`)) })
  const createAndAdd = () => {
    const n = newName.trim(); if (!n) return
    start(async () => {
      if (tab === 'lists') { const r = await createList(n); if (r.ok && r.id) { await addPlaceToList(r.id, slug); setNewName(''); await load(); setDone((d) => new Set(d).add(`l${r.id}`)) } }
      else { const r = await createPlan(n); if (r.ok && r.id) { await addStop(r.id, slug); setNewName(''); await load(); setDone((d) => new Set(d).add(`p${r.id}`)) } }
    })
  }

  const trigger = variant === 'menu'
    ? <button type="button" onClick={openModal} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl text-[14px] text-ink hover:bg-cream text-left">➕ {t('add_to')}</button>
    : <button type="button" onClick={openModal} className="w-full flex items-center justify-center gap-2 font-semibold text-[14px] px-4 py-3 rounded-2xl bg-paper text-ink border border-line hover:border-rose/40 hover:text-rose transition-all">➕ {t('add_to')}</button>

  return (
    <>
      {trigger}
      {open && (
        <div className="fixed inset-0 z-[200] grid place-items-center p-5">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-paper border border-line rounded-2xl p-5 max-w-[400px] w-full shadow-2xl max-h-[80vh] overflow-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif font-bold text-[17px] text-ink">{t('add_to')}</h3>
              <button type="button" onClick={() => setOpen(false)} aria-label={td('close')} className="w-7 h-7 grid place-items-center rounded-full hover:bg-cream">✕</button>
            </div>

            {!loggedIn ? (
              <div className="text-center py-6">
                <p className="text-[13.5px] text-muted mb-4">{t('sign_in_required')}</p>
                <Link href="/login" className="font-semibold text-[13px] px-5 py-2 rounded-full bg-rose text-white">{t('sign_in')}</Link>
              </div>
            ) : (
              <>
                <div className="inline-flex rounded-full border border-line overflow-hidden mb-3">
                  <button type="button" onClick={() => setTab('lists')} className={`px-4 py-1.5 text-[13px] font-semibold ${tab === 'lists' ? 'bg-rose text-white' : 'text-muted'}`}>{t('lists')}</button>
                  <button type="button" onClick={() => setTab('plans')} className={`px-4 py-1.5 text-[13px] font-semibold ${tab === 'plans' ? 'bg-rose text-white' : 'text-muted'}`}>{t('plans')}</button>
                </div>

                <div className="flex gap-2 mb-3">
                  <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={tab === 'lists' ? t('name_ph') : t('plan_title_ph')} className="flex-1 text-[13.5px] px-3 py-2 border border-line rounded-lg bg-white" />
                  <button type="button" onClick={createAndAdd} disabled={!newName.trim()} className="text-[13px] font-semibold px-3 py-2 rounded-lg bg-rose text-white disabled:opacity-50">{t('create')}</button>
                </div>

                {loading ? (
                  <p className="text-[13px] text-muted py-3">…</p>
                ) : tab === 'lists' ? (
                  <ul className="space-y-1.5">
                    {lists.length === 0 && <li className="text-[13px] text-muted">{t('empty_lists')}</li>}
                    {lists.map((l) => (
                      <li key={l.id}>
                        <button type="button" onClick={() => addToList(l.id)} disabled={done.has(`l${l.id}`)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-line text-[13.5px] hover:bg-cream disabled:opacity-60">
                          <span>{l.title}</span>
                          <span className={done.has(`l${l.id}`) ? 'text-emerald-600' : 'text-rose'}>{done.has(`l${l.id}`) ? `✓ ${t('added')}` : '+'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <ul className="space-y-1.5">
                    {plans.length === 0 && <li className="text-[13px] text-muted">{t('empty_plans')}</li>}
                    {plans.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => addToPlan(p.id)} disabled={done.has(`p${p.id}`)}
                          className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-line text-[13.5px] hover:bg-cream disabled:opacity-60">
                          <span>{p.title}</span>
                          <span className={done.has(`p${p.id}`) ? 'text-emerald-600' : 'text-rose'}>{done.has(`p${p.id}`) ? `✓ ${t('added')}` : '+'}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
