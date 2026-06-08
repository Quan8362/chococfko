'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import JlptBadge from '@/components/japanese/JlptBadge'
import { upsertQuiz, toggleQuizPublished } from '../actions'
import type { AdminQuiz } from './page'

const INPUT = 'w-full px-3 py-2 text-[13px] border border-line rounded-xl bg-paper text-ink focus:outline-none focus:border-rose/50 transition-colors'
const JLPT = ['N5', 'N4', 'N3', 'N2', 'N1']
const CATEGORIES = ['vocabulary', 'kanji', 'grammar', 'reading', 'mixed']
const DIFFICULTIES = ['easy', 'medium', 'hard']

function getOptionText(q: AdminQuiz, key: string) {
  return (q.options as { key: string; text: string }[]).find(o => o.key === key)?.text ?? ''
}

export default function QuizClient({ initialQuizzes }: { initialQuizzes: AdminQuiz[] }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isOpen, setIsOpen] = useState(false)
  const [editItem, setEditItem] = useState<AdminQuiz | null>(null)
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)
  const [filterQ, setFilterQ] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'published' | 'hidden'>('all')

  const displayed = useMemo(() => {
    const q = filterQ.trim().toLowerCase()
    return initialQuizzes.filter(quiz => {
      if (q && !quiz.question.toLowerCase().includes(q) && !(quiz.question_vi ?? '').toLowerCase().includes(q)) return false
      if (filterLevel && quiz.jlpt_level !== filterLevel) return false
      if (filterCat && quiz.category !== filterCat) return false
      if (filterStatus === 'published' && !quiz.is_published) return false
      if (filterStatus === 'hidden' && quiz.is_published) return false
      return true
    })
  }, [initialQuizzes, filterQ, filterLevel, filterCat, filterStatus])

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg })
    setTimeout(() => setToast(null), 3000)
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await upsertQuiz(fd)
      if (res?.error) showToast('error', res.error)
      else { showToast('success', '✓ Đã lưu thành công'); setIsOpen(false); router.refresh() }
    })
  }

  function handleToggle(id: string, current: boolean) {
    startTransition(async () => {
      const res = await toggleQuizPublished(id, !current)
      if (res?.error) showToast('error', res.error)
      else { showToast('success', !current ? '✓ Đã hiển thị' : '✓ Đã ẩn'); router.refresh() }
    })
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-5 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <input value={filterQ} onChange={e => setFilterQ(e.target.value)}
            placeholder="Tìm câu hỏi..." className={`${INPUT} w-48`} />
          <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)} className={`${INPUT} w-28`}>
            <option value="">Tất cả cấp</option>
            {JLPT.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className={`${INPUT} w-36`}>
            <option value="">Tất cả loại</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as never)} className={`${INPUT} w-36`}>
            <option value="all">Tất cả</option>
            <option value="published">Xuất bản</option>
            <option value="hidden">Đã ẩn</option>
          </select>
        </div>
        <button onClick={() => { setEditItem(null); setIsOpen(true) }}
          className="flex items-center gap-1.5 bg-rose text-white text-[13px] font-semibold px-4 py-2 rounded-xl hover:bg-rose-deep transition-colors">
          + Thêm câu hỏi
        </button>
      </div>

      <p className="text-[12px] text-muted mb-3">{displayed.length} / {initialQuizzes.length} câu hỏi</p>

      {displayed.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl p-12 text-center text-muted">Không tìm thấy câu hỏi nào</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full text-[13px]">
            <thead className="bg-cream border-b border-line">
              <tr>
                {['Câu hỏi', 'JLPT', 'Loại', 'Đáp án đúng', 'Độ khó', 'Trạng thái', 'Hành động'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-muted font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/50">
              {displayed.map(q => (
                <tr key={q.id} className="bg-paper hover:bg-cream/60 transition-colors">
                  <td className="px-4 py-3 max-w-[260px]">
                    <p className="font-medium text-ink truncate" lang="ja">{q.question}</p>
                    {q.question_vi && <p className="text-[11px] text-muted truncate">{q.question_vi}</p>}
                  </td>
                  <td className="px-4 py-3">{q.jlpt_level ? <JlptBadge level={q.jlpt_level} /> : <span className="text-muted">—</span>}</td>
                  <td className="px-4 py-3 text-muted">{q.category}</td>
                  <td className="px-4 py-3">
                    <span className="font-bold text-rose">{q.correct_answer}</span>
                    <span className="text-muted ml-1 text-[11px] truncate max-w-[80px] inline-block align-middle">{getOptionText(q, q.correct_answer)}</span>
                  </td>
                  <td className="px-4 py-3 text-muted">{q.difficulty}</td>
                  <td className="px-4 py-3">
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${q.is_published ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                      {q.is_published ? 'Hiển thị' : 'Đã ẩn'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={() => { setEditItem(q); setIsOpen(true) }} className="text-[12px] font-semibold px-2.5 py-1 rounded-lg bg-cream border border-line text-ink hover:border-rose/40 hover:text-rose transition-colors">Sửa</button>
                      <button onClick={() => handleToggle(q.id, q.is_published)} disabled={isPending}
                        className={`text-[12px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${q.is_published ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'}`}>
                        {q.is_published ? 'Ẩn' : 'Hiện'}
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-8" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-line">
              <h2 className="font-bold text-[16px] text-ink">{editItem ? 'Chỉnh sửa câu hỏi' : 'Thêm câu hỏi mới'}</h2>
              <button onClick={() => setIsOpen(false)} className="text-muted hover:text-ink transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form key={editItem?.id ?? 'new'} onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              {editItem && <input type="hidden" name="id" value={editItem.id} />}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Cấp JLPT</label>
                  <select name="jlpt_level" defaultValue={editItem?.jlpt_level ?? ''} className={INPUT}>
                    <option value="">Chưa phân loại</option>
                    {JLPT.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Loại</label>
                  <select name="category" defaultValue={editItem?.category ?? 'mixed'} className={INPUT}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Độ khó</label>
                  <select name="difficulty" defaultValue={editItem?.difficulty ?? 'medium'} className={INPUT}>
                    {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Câu hỏi (Nhật) *</label>
                <input name="question" required lang="ja" defaultValue={editItem?.question ?? ''} className={INPUT} placeholder="＿に　なにを　いれますか。" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Furigana (reading)</label>
                  <input name="question_reading" lang="ja" defaultValue={editItem?.question_reading ?? ''} className={INPUT} placeholder="Reading..." />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Câu hỏi (Việt)</label>
                  <input name="question_vi" defaultValue={editItem?.question_vi ?? ''} className={INPUT} placeholder="Điền vào chỗ trống..." />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Question (English)</label>
                  <input name="question_en" defaultValue={editItem?.question_en ?? ''} className={INPUT} placeholder="Fill in the blank..." />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-2">Đáp án A / B / C / D *</label>
                {(['A', 'B', 'C', 'D'] as const).map(key => (
                  <div key={key} className="flex items-center gap-2 mb-2">
                    <span className="text-[13px] font-bold text-muted w-5 shrink-0">{key}</span>
                    <input name={`option_${key}`} required defaultValue={getOptionText(editItem!, key)} className={INPUT} placeholder={`Đáp án ${key}`} />
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-2">Đáp án đúng *</label>
                <div className="flex items-center gap-4">
                  {(['A', 'B', 'C', 'D'] as const).map(key => (
                    <label key={key} className="flex items-center gap-1.5 cursor-pointer text-[14px] font-bold text-ink">
                      <input type="radio" name="correct_answer" value={key} defaultChecked={editItem?.correct_answer === key || (!editItem && key === 'A')} className="accent-rose" />
                      {key}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Giải thích (Việt)</label>
                  <textarea name="explanation_vi" rows={2} defaultValue={editItem?.explanation_vi ?? ''} className={`${INPUT} resize-y`} placeholder="Vì..." />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">Explanation (English)</label>
                  <textarea name="explanation_en" rows={2} defaultValue={editItem?.explanation_en ?? ''} className={`${INPUT} resize-y`} placeholder="Because..." />
                </div>
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
