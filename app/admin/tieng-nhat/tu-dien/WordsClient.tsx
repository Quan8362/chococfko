'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import JlptBadge from '@/components/japanese/JlptBadge'
import { upsertWord, toggleWordPublished } from '../actions'
import type { AdminWord } from './page'

const INPUT = 'w-full px-3 py-2 text-[13px] border border-line rounded-xl bg-paper text-ink focus:outline-none focus:border-rose/50 transition-colors'
const JLPT = ['N5', 'N4', 'N3', 'N2', 'N1']
const POS_VALUES = ['verb', 'noun', 'adjective', 'adverb', 'particle', 'conjunction', 'interjection'] as const
const POS_PREFIX: Record<string, string> = {
  verb: '動', noun: '名', adjective: '形', adverb: '副', particle: '助', conjunction: '接', interjection: '感',
}

export default function WordsClient({ initialWords }: { initialWords: AdminWord[] }) {
  const t = useTranslations('admin_jp')
  const POS = POS_VALUES.map(value => ({ value, label: `${POS_PREFIX[value]} ${t(`pos_${value}` as Parameters<typeof t>[0])}` }))
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)
  const [editItem, setEditItem] = useState<AdminWord | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [filterQ, setFilterQ] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'hidden'>('all')

  const displayed = useMemo(() => {
    const q = filterQ.trim().toLowerCase()
    return initialWords.filter(w => {
      if (q && !w.word.toLowerCase().includes(q) && !(w.reading ?? '').toLowerCase().includes(q) && !(w.romaji ?? '').toLowerCase().includes(q)) return false
      if (filterLevel && w.jlpt_level !== filterLevel) return false
      if (filterStatus === 'published' && !w.is_published) return false
      if (filterStatus === 'hidden' && w.is_published) return false
      return true
    })
  }, [initialWords, filterQ, filterLevel, filterStatus])

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  function openAdd() { setEditItem(null); setIsOpen(true) }
  function openEdit(w: AdminWord) { setEditItem(w); setIsOpen(true) }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await upsertWord(fd)
      if (res?.error) showToast('error', res.error)
      else { showToast('success', t('toast_saved')); setIsOpen(false); router.refresh() }
    })
  }

  function handleToggle(id: string, current: boolean) {
    startTransition(async () => {
      const res = await toggleWordPublished(id, !current)
      if (res?.error) showToast('error', res.error)
      else { showToast('success', !current ? t('toast_shown') : t('toast_hidden')); router.refresh() }
    })
  }

  const getMeaning = (item: AdminWord, i: number, lang: 'vi' | 'en') =>
    (item.meanings as { vi: string; en: string }[] | null)?.[i]?.[lang] ?? ''

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap gap-3 mb-5 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <input value={filterQ} onChange={e => setFilterQ(e.target.value)}
            placeholder={t('filter_search_word_ph')} className={`${INPUT} w-48`} />
          <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} className={`${INPUT} w-36`}>
            <option value="">{t('filter_all_levels')}</option>
            {JLPT.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as never)} className={`${INPUT} w-36`}>
            <option value="all">{t('filter_all')}</option>
            <option value="published">{t('stat_published')}</option>
            <option value="hidden">{t('stat_hidden')}</option>
          </select>
        </div>
        <button onClick={openAdd}
          className="flex items-center gap-1.5 bg-rose text-white text-[13px] font-semibold px-4 py-2 rounded-xl hover:bg-rose-deep transition-colors">
          + {t('add_word')}
        </button>
      </div>

      <p className="text-[12px] text-muted mb-3">{t('count_words', { shown: displayed.length, total: initialWords.length })}</p>

      {displayed.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl p-12 text-center text-muted">{t('no_words_found')}</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-[13px]">
            <thead className="bg-cream border-b border-line">
              <tr>
                {[t('col_word'), 'Reading', 'JLPT', t('col_pos'), t('col_meaning_vi'), t('col_status'), t('col_actions')].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-muted font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {displayed.map(w => (
                <tr key={w.id} className="bg-paper hover:bg-cream/60 transition-colors">
                  <td className="px-4 py-3 font-bold text-[16px] text-ink" lang="ja">{w.word}</td>
                  <td className="px-4 py-3 text-muted" lang="ja">{w.reading ?? '—'}</td>
                  <td className="px-4 py-3">{w.jlpt_level ? <JlptBadge level={w.jlpt_level} /> : <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-3 text-muted">{w.pos?.slice(0, 2).join(', ') ?? '—'}</td>
                  <td className="px-4 py-3 text-muted max-w-[160px] truncate">{getMeaning(w, 0, 'vi') || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${w.is_published ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                      {w.is_published ? t('status_shown') : t('stat_hidden')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={() => openEdit(w)} className="text-[12px] font-semibold px-2.5 py-1 rounded-lg bg-cream border border-line text-ink hover:border-rose/40 hover:text-rose transition-colors">{t('btn_edit')}</button>
                      <button onClick={() => handleToggle(w.id, w.is_published)} disabled={isPending}
                        className={`text-[12px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${w.is_published ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}`}>
                        {w.is_published ? t('btn_hide') : t('btn_show')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={e => { if (e.target === e.currentTarget) setIsOpen(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <h2 className="font-bold text-[16px] text-ink">{editItem ? t('modal_edit_word') : t('add_word')}</h2>
              <button onClick={() => setIsOpen(false)} className="text-muted hover:text-ink transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form key={editItem?.id ?? 'new'} onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[78vh] overflow-y-auto">
              {editItem && <input type="hidden" name="id" value={editItem.id} />}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">{t('field_word_required')}</label>
                  <input name="word" required lang="ja" defaultValue={editItem?.word ?? ''} className={INPUT} placeholder="食べる" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Reading</label>
                  <input name="reading" lang="ja" defaultValue={editItem?.reading ?? ''} className={INPUT} placeholder="たべる" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Romaji</label>
                  <input name="romaji" defaultValue={editItem?.romaji ?? ''} className={INPUT} placeholder="taberu" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">{t('field_jlpt')}</label>
                  <select name="jlpt_level" defaultValue={editItem?.jlpt_level ?? ''} className={INPUT}>
                    <option value="">{t('jlpt_unclassified')}</option>
                    {JLPT.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-2">{t('col_pos')}</label>
                <div className="flex flex-wrap gap-3">
                  {POS.map(p => (
                    <label key={p.value} className="flex items-center gap-1.5 text-[12px] text-ink cursor-pointer">
                      <input type="checkbox" name={`pos_${p.value}`} defaultChecked={editItem?.pos?.includes(p.value)} className="accent-rose" />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-2">{t('field_meanings')}</label>
                {[0, 1, 2].map(i => (
                  <div key={i} className="grid grid-cols-2 gap-2 mb-2">
                    <input name={`meaning_${i}_vi`} defaultValue={getMeaning(editItem!, i, 'vi')} className={INPUT} placeholder={t('meaning_vi_ph', { n: i + 1 })} />
                    <input name={`meaning_${i}_en`} defaultValue={getMeaning(editItem!, i, 'en')} className={INPUT} placeholder={t('meaning_en_ph', { n: i + 1 })} />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
                  {t('field_examples_json')} <span className="font-normal normal-case opacity-60">— {`[{"ja":"","reading":"","vi":"","en":""}]`}</span>
                </label>
                <textarea name="examples_json" rows={4}
                  defaultValue={editItem?.examples ? JSON.stringify(editItem.examples, null, 2) : ''}
                  className={`${INPUT} resize-y font-mono text-[11px]`}
                  placeholder={'[\n  {"ja":"ご飯を食べる","reading":"ごはんをたべる","vi":"Ăn cơm","en":"To eat rice"}\n]'} />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">{t('field_tags')}</label>
                  <input name="tags" defaultValue={editItem?.tags?.join(', ') ?? ''} className={INPUT} placeholder="food, action" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Frequency</label>
                  <input name="frequency" type="number" min="0" defaultValue={editItem?.frequency ?? 0} className={INPUT} />
                </div>
              </div>

              <label className="flex items-center gap-2 text-[13px] text-ink cursor-pointer">
                <input type="checkbox" name="is_published" defaultChecked={editItem?.is_published ?? true} className="accent-rose" />
                {t('publish_public')}
              </label>

              <div className="flex items-center gap-3 justify-end pt-3 border-t border-line">
                <button type="button" onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-[13px] font-semibold text-muted border border-line rounded-xl hover:bg-cream transition-colors">
                  {t('btn_cancel')}
                </button>
                <button type="submit" disabled={isPending}
                  className="px-5 py-2 text-[13px] font-semibold bg-rose text-white rounded-xl hover:bg-rose-deep transition-colors disabled:opacity-60">
                  {isPending ? t('btn_saving') : t('btn_save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-5 right-5 z-[60] px-4 py-3 rounded-xl shadow-lg text-[13px] font-medium ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
