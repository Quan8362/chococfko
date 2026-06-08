'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import JlptBadge from '@/components/japanese/JlptBadge'
import { upsertKanji, toggleKanjiPublished } from '../actions'
import type { AdminKanji } from './page'

const INPUT = 'w-full px-3 py-2 text-[13px] border border-line rounded-xl bg-paper text-ink focus:outline-none focus:border-rose/50 transition-colors'
const JLPT = ['N5', 'N4', 'N3', 'N2', 'N1']

export default function KanjiClient({ initialKanji }: { initialKanji: AdminKanji[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)
  const [editItem, setEditItem] = useState<AdminKanji | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [filterQ, setFilterQ] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'hidden'>('all')

  const displayed = useMemo(() => {
    const q = filterQ.trim().toLowerCase()
    return initialKanji.filter(k => {
      if (q && !k.character.toLowerCase().includes(q) && !(k.meanings?.[0]?.vi ?? '').toLowerCase().includes(q)) return false
      if (filterLevel && k.jlpt_level !== filterLevel) return false
      if (filterStatus === 'published' && !k.is_published) return false
      if (filterStatus === 'hidden' && k.is_published) return false
      return true
    })
  }, [initialKanji, filterQ, filterLevel, filterStatus])

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await upsertKanji(fd)
      if (res?.error) showToast('error', res.error)
      else { showToast('success', '✓ Đã lưu thành công'); setIsOpen(false); router.refresh() }
    })
  }

  function handleToggle(id: string, current: boolean) {
    startTransition(async () => {
      const res = await toggleKanjiPublished(id, !current)
      if (res?.error) showToast('error', res.error)
      else { showToast('success', !current ? '✓ Đã hiển thị' : '✓ Đã ẩn'); router.refresh() }
    })
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <input value={filterQ} onChange={e => setFilterQ(e.target.value)}
            placeholder="Tìm kanji, nghĩa..." className={`${INPUT} w-48`} />
          <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} className={`${INPUT} w-36`}>
            <option value="">Tất cả cấp độ</option>
            {JLPT.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as never)} className={`${INPUT} w-36`}>
            <option value="all">Tất cả</option>
            <option value="published">Xuất bản</option>
            <option value="hidden">Đã ẩn</option>
          </select>
        </div>
        <button onClick={() => { setEditItem(null); setIsOpen(true) }}
          className="flex items-center gap-1.5 bg-rose text-white text-[13px] font-semibold px-4 py-2 rounded-xl hover:bg-rose-deep transition-colors">
          + Thêm Kanji
        </button>
      </div>

      <p className="text-[12px] text-muted mb-3">{displayed.length} / {initialKanji.length} kanji</p>

      {displayed.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl p-12 text-center text-muted">Không tìm thấy kanji nào</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-[13px]">
            <thead className="bg-cream border-b border-line">
              <tr>
                {['Chữ', 'JLPT', 'Onyomi', 'Kunyomi', 'Nghĩa (vi)', 'Nét', 'Trạng thái', 'Hành động'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-muted font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {displayed.map(k => (
                <tr key={k.id} className="bg-paper hover:bg-cream/60 transition-colors">
                  <td className="px-4 py-3 font-bold text-[28px] text-ink" lang="ja" style={{ fontFamily: "'Noto Serif JP', serif" }}>{k.character}</td>
                  <td className="px-4 py-3">{k.jlpt_level ? <JlptBadge level={k.jlpt_level} /> : <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-3 text-muted" lang="ja">{k.onyomi?.join('・') ?? '—'}</td>
                  <td className="px-4 py-3 text-muted" lang="ja">{k.kunyomi?.join('・') ?? '—'}</td>
                  <td className="px-4 py-3 text-muted max-w-[140px] truncate">{k.meanings?.[0]?.vi ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{k.stroke_count ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${k.is_published ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                      {k.is_published ? 'Hiển thị' : 'Đã ẩn'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={() => { setEditItem(k); setIsOpen(true) }} className="text-[12px] font-semibold px-2.5 py-1 rounded-lg bg-cream border border-line text-ink hover:border-rose/40 hover:text-rose transition-colors">Sửa</button>
                      <button onClick={() => handleToggle(k.id, k.is_published)} disabled={isPending}
                        className={`text-[12px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${k.is_published ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}`}>
                        {k.is_published ? 'Ẩn' : 'Hiện'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={e => { if (e.target === e.currentTarget) setIsOpen(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <h2 className="font-bold text-[16px] text-ink">{editItem ? 'Chỉnh sửa Kanji' : 'Thêm Kanji mới'}</h2>
              <button onClick={() => setIsOpen(false)} className="text-muted hover:text-ink transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form key={editItem?.id ?? 'new'} onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[78vh] overflow-y-auto">
              {editItem && <input type="hidden" name="id" value={editItem.id} />}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Chữ Kanji *</label>
                  <input name="character" required lang="ja" defaultValue={editItem?.character ?? ''} className={`${INPUT} text-[28px] font-bold`} placeholder="食" style={{ fontFamily: "'Noto Serif JP', serif" }} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Cấp JLPT</label>
                  <select name="jlpt_level" defaultValue={editItem?.jlpt_level ?? ''} className={INPUT}>
                    <option value="">Chưa phân loại</option>
                    {JLPT.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Onyomi (cách nhau bởi dấu phẩy)</label>
                  <input name="onyomi" lang="ja" defaultValue={editItem?.onyomi?.join(', ') ?? ''} className={INPUT} placeholder="ショク, ジキ" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Kunyomi (cách nhau bởi dấu phẩy)</label>
                  <input name="kunyomi" lang="ja" defaultValue={editItem?.kunyomi?.join(', ') ?? ''} className={INPUT} placeholder="た.べる" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Nghĩa tiếng Việt</label>
                  <input name="meaning_vi" defaultValue={editItem?.meanings?.[0]?.vi ?? ''} className={INPUT} placeholder="ăn" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Meaning (English)</label>
                  <input name="meaning_en" defaultValue={editItem?.meanings?.[0]?.en ?? ''} className={INPUT} placeholder="eat, food" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Số nét</label>
                  <input name="stroke_count" type="number" min="1" defaultValue={editItem?.stroke_count ?? ''} className={INPUT} placeholder="9" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Bộ thủ (Radical)</label>
                  <input name="radical" lang="ja" defaultValue={editItem?.radical ?? ''} className={INPUT} placeholder="食" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
                  Từ ví dụ (JSON) <span className="font-normal normal-case opacity-60">— {`[{"word":"","reading":"","vi":"","en":""}]`}</span>
                </label>
                <textarea name="examples_json" rows={4}
                  defaultValue={editItem?.examples ? JSON.stringify(editItem.examples, null, 2) : ''}
                  className={`${INPUT} resize-y font-mono text-[11px]`}
                  placeholder={'[\n  {"word":"食べ物","reading":"たべもの","vi":"Đồ ăn","en":"Food"}\n]'} />
              </div>

              <label className="flex items-center gap-2 text-[13px] text-ink cursor-pointer">
                <input type="checkbox" name="is_published" defaultChecked={editItem?.is_published ?? true} className="accent-rose" />
                Hiển thị công khai
              </label>

              <div className="flex items-center gap-3 justify-end pt-3 border-t border-line">
                <button type="button" onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-[13px] font-semibold text-muted border border-line rounded-xl hover:bg-cream transition-colors">
                  Hủy
                </button>
                <button type="submit" disabled={isPending}
                  className="px-5 py-2 text-[13px] font-semibold bg-rose text-white rounded-xl hover:bg-rose-deep transition-colors disabled:opacity-60">
                  {isPending ? 'Đang lưu…' : 'Lưu'}
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
