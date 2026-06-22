'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { createList, deleteList, duplicateList, type ListRow } from './actions'

export default function ListsClient({ lists }: { lists: ListRow[] }) {
  const t = useTranslations('trips')
  const router = useRouter()
  const [name, setName] = useState('')
  const [pending, start] = useTransition()

  const create = () => {
    const n = name.trim(); if (!n) return
    start(async () => { const r = await createList(n); setName(''); if (r.ok && r.id) router.push(`/lists/${r.id}`); else router.refresh() })
  }

  return (
    <div>
      <div className="flex gap-2 mb-7 max-w-[480px]">
        <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()}
          placeholder={t('name_ph')} className="flex-1 text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-paper" />
        <button type="button" onClick={create} disabled={pending || !name.trim()}
          className="font-semibold text-[14px] px-5 py-2.5 rounded-xl bg-rose text-white disabled:opacity-50">{t('new_list')}</button>
      </div>

      {lists.length === 0 ? (
        <p className="text-[14px] text-muted bg-paper border border-line rounded-2xl p-6">{t('empty_lists')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lists.map((l) => (
            <div key={l.id} className="bg-paper border border-line rounded-2xl p-4 flex flex-col">
              <Link href={`/lists/${l.id}`} className="flex-1">
                <h3 className="font-serif font-bold text-[17px] text-ink leading-snug hover:text-rose transition-colors">{l.title}</h3>
                {l.description && <p className="text-[13px] text-muted line-clamp-2 mt-1">{l.description}</p>}
                <p className="text-[12px] text-muted mt-2">{t('items_count', { count: l.item_count })}{l.is_shareable ? ' · 🔗' : ''}</p>
              </Link>
              <div className="flex gap-2 mt-3 pt-3 border-t border-line">
                <Link href={`/lists/${l.id}`} className="text-[12.5px] font-semibold text-teal hover:underline">{t('open')}</Link>
                <button type="button" onClick={() => start(async () => { await duplicateList(l.id); router.refresh() })} className="text-[12.5px] text-muted hover:text-rose">{t('duplicate')}</button>
                <button type="button" onClick={() => { if (confirm(t('confirm_delete'))) start(async () => { await deleteList(l.id); router.refresh() }) }} className="text-[12.5px] text-muted hover:text-rose ml-auto">{t('delete')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
