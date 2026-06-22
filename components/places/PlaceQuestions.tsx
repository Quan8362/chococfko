'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations, useLocale } from 'next-intl'
import UserAvatar from '@/components/UserAvatar'
import AuthorLink from '@/components/AuthorLink'
import { sortQuestions, type QaQuestion, type QaSort } from '@/lib/placeQa'
import { askQuestion, answerQuestion, markHelpful, hideComment, deleteQa, submitReport } from '@/app/places/qa-actions'

interface Props {
  slug: string
  questions: QaQuestion[]
  currentUserId: string | null
  isAdmin: boolean
}

export default function PlaceQuestions({ slug, questions, currentUserId, isAdmin }: Props) {
  const t = useTranslations('place_qa')
  const locale = useLocale()
  const router = useRouter()
  const [sort, setSort] = useState<QaSort>('newest')
  const [ask, setAsk] = useState('')
  const [answerFor, setAnswerFor] = useState<string | null>(null)
  const [answerText, setAnswerText] = useState('')
  const [, start] = useTransition()

  const sorted = useMemo(() => sortQuestions(questions, sort), [questions, sort])
  const rel = (iso: string) => { try { return new Date(iso).toLocaleDateString(locale) } catch { return '' } }
  const run = (fn: () => Promise<unknown>) => start(async () => { await fn(); router.refresh() })

  const doAsk = () => { const c = ask.trim(); if (!c) return; run(async () => { await askQuestion(slug, c); setAsk('') }) }
  const doAnswer = (qid: string) => { const c = answerText.trim(); if (!c) return; run(async () => { await answerQuestion(slug, qid, c); setAnswerText(''); setAnswerFor(null) }) }
  const reportContent = (snippet: string) => run(() => submitReport(slug, 'other', `Q&A report: ${snippet.slice(0, 120)}`))

  return (
    <section className="mt-12 border-t border-line pt-8">
      <div className="flex items-center justify-between gap-3 mb-1.5 flex-wrap">
        <h2 className="font-serif font-bold text-[22px] tracking-[-0.2px] text-ink">{t('q_title')}</h2>
        <div className="flex items-center gap-1.5 text-[12.5px]">
          <span className="text-muted">{t('sort_label')}:</span>
          <button type="button" onClick={() => setSort('newest')} className={sort === 'newest' ? 'font-semibold text-rose' : 'text-muted hover:text-rose'}>{t('sort_newest')}</button>
          <span className="text-line">·</span>
          <button type="button" onClick={() => setSort('helpful')} className={sort === 'helpful' ? 'font-semibold text-rose' : 'text-muted hover:text-rose'}>{t('sort_helpful')}</button>
        </div>
      </div>
      <p className="text-[13.5px] text-muted mb-5">{t('q_sub')}</p>

      {/* Ask */}
      {currentUserId ? (
        <div className="flex gap-2 mb-6">
          <input value={ask} onChange={(e) => setAsk(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doAsk()} placeholder={t('ask_ph')} className="flex-1 text-[14px] px-3.5 py-2.5 border border-line rounded-xl bg-paper" />
          <button type="button" onClick={doAsk} disabled={!ask.trim()} className="font-semibold text-[13.5px] px-5 py-2.5 rounded-full bg-rose text-white disabled:opacity-50">{t('ask_btn')}</button>
        </div>
      ) : (
        <div className="bg-gradient-to-br from-[#fdeef5] to-cream border border-rose/15 rounded-2xl px-5 py-4 flex items-center justify-between gap-3 flex-wrap mb-6">
          <p className="text-[14px] text-ink">{t('login_to_ask')}</p>
          <Link href="/login" className="font-semibold text-[13px] px-5 py-2 rounded-full bg-rose text-white">{t('login')}</Link>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-[14px] text-muted bg-paper border border-line rounded-2xl px-5 py-6 text-center">{t('q_empty')}</p>
      ) : (
        <ul className="space-y-4">
          {sorted.map((q) => {
            const canMark = isAdmin || currentUserId === q.user_id
            return (
              <li key={q.id} className="bg-paper border border-line rounded-2xl p-4">
                <div className="flex items-start gap-2.5">
                  <UserAvatar src={q.author_avatar} name={q.author_name ?? t('anonymous')} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <AuthorLink userId={q.user_id} name={q.author_name ?? t('anonymous')} className="font-semibold text-[13.5px] text-ink" />
                      <span className="text-[11.5px] text-muted">{rel(q.created_at)}</span>
                    </div>
                    <p className="text-[15px] text-ink mt-1 whitespace-pre-wrap break-words">{q.content}</p>
                    <div className="flex items-center gap-3 mt-2 text-[12px]">
                      {currentUserId && <button type="button" onClick={() => { setAnswerFor(answerFor === q.id ? null : q.id); setAnswerText('') }} className="font-semibold text-teal hover:underline">{t('answer_btn')}</button>}
                      <span className="text-muted">{t('answers_count', { count: q.answers.length })}</span>
                      {currentUserId && <button type="button" onClick={() => reportContent(q.content)} className="text-muted hover:text-rose">{t('report_content')}</button>}
                      {(isAdmin) && <button type="button" onClick={() => run(() => hideComment(slug, q.id))} className="text-muted hover:text-rose">{t('hide')}</button>}
                      {currentUserId === q.user_id && <button type="button" onClick={() => { if (confirm(t('confirm_delete'))) run(() => deleteQa(slug, q.id)) }} className="text-muted hover:text-rose">{t('delete')}</button>}
                    </div>

                    {/* answer composer */}
                    {answerFor === q.id && (
                      <div className="flex gap-2 mt-3">
                        <input value={answerText} onChange={(e) => setAnswerText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doAnswer(q.id)} placeholder={t('answer_ph')} className="flex-1 text-[13.5px] px-3 py-2 border border-line rounded-lg bg-white" />
                        <button type="button" onClick={() => doAnswer(q.id)} disabled={!answerText.trim()} className="font-semibold text-[12.5px] px-4 py-2 rounded-lg bg-rose text-white disabled:opacity-50">{t('answer_btn')}</button>
                      </div>
                    )}

                    {/* answers */}
                    {q.answers.length > 0 && (
                      <ul className="mt-3 space-y-2.5 pl-3 border-l-2 border-line">
                        {q.answers.map((a) => (
                          <li key={a.id} className="flex items-start gap-2.5">
                            <UserAvatar src={a.author_avatar} name={a.author_name ?? t('anonymous')} size={26} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <AuthorLink userId={a.user_id} name={a.author_name ?? t('anonymous')} className="font-semibold text-[13px] text-ink" />
                                <span className="text-[11px] text-muted">{rel(a.created_at)}</span>
                                {a.helpful && <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ {t('helpful_badge')}</span>}
                              </div>
                              <p className="text-[14px] text-[#3a2d22] mt-0.5 whitespace-pre-wrap break-words">{a.content}</p>
                              <div className="flex items-center gap-3 mt-1 text-[11.5px]">
                                {canMark && <button type="button" onClick={() => run(() => markHelpful(slug, a.id, !a.helpful))} className="font-semibold text-emerald-600 hover:underline">{a.helpful ? '✓' : t('mark_helpful')}</button>}
                                {currentUserId && <button type="button" onClick={() => reportContent(a.content)} className="text-muted hover:text-rose">{t('report_content')}</button>}
                                {isAdmin && <button type="button" onClick={() => run(() => hideComment(slug, a.id))} className="text-muted hover:text-rose">{t('hide')}</button>}
                                {currentUserId === a.user_id && <button type="button" onClick={() => { if (confirm(t('confirm_delete'))) run(() => deleteQa(slug, a.id)) }} className="text-muted hover:text-rose">{t('delete')}</button>}
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-5">
        <Link href="/community" className="text-[13px] font-semibold text-teal hover:underline">{t('open_community')} →</Link>
      </div>
    </section>
  )
}
