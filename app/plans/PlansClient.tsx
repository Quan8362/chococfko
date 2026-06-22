'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createPlan, deletePlan, type PlanRow } from './actions'

export default function PlansClient({ plans }: { plans: PlanRow[] }) {
  const t = useTranslations('trips')
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [pending, start] = useTransition()

  const create = () => {
    const n = title.trim(); if (!n) return
    start(async () => { const r = await createPlan(n); setTitle(''); if (r.ok && r.id) router.push(`/plans/${r.id}`); else router.refresh() })
  }

  return (
    <div>
      <div className="flex gap-2 mb-7 max-w-[480px]">
        <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder={t('plan_title_ph')} className="flex-1 text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-paper" />
        <button type="button" onClick={create} disabled={pending || !title.trim()} className="font-semibold text-[14px] px-5 py-2.5 rounded-xl bg-rose text-white disabled:opacity-50">{t('new_plan')}</button>
      </div>

      {plans.length === 0 ? (
        <p className="text-[14px] text-muted bg-paper border border-line rounded-2xl p-6">{t('empty_plans')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((p) => (
            <div key={p.id} className="bg-paper border border-line rounded-2xl p-4 flex flex-col">
              <Link href={`/plans/${p.id}`} className="flex-1">
                <h3 className="font-serif font-bold text-[17px] text-ink leading-snug hover:text-rose transition-colors">{p.title}</h3>
                <p className="text-[12px] text-muted mt-1">{p.plan_date ? `${p.plan_date} · ` : ''}{t('stops_count', { count: p.stop_count })}{p.is_shareable ? ' · 🔗' : ''}</p>
              </Link>
              <div className="flex gap-2 mt-3 pt-3 border-t border-line">
                <Link href={`/plans/${p.id}`} className="text-[12.5px] font-semibold text-teal hover:underline">{t('open')}</Link>
                <button type="button" onClick={() => { if (confirm(t('confirm_delete'))) start(async () => { await deletePlan(p.id); router.refresh() }) }} className="text-[12.5px] text-muted hover:text-rose ml-auto">{t('delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
