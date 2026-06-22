'use client'

import { useEffect, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { previewJp60Questions, type PreviewQuestion } from './actions'

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1', 'MIXED']

export function PreviewPanel() {
  const t = useTranslations('admin_jp60')
  const tg = useTranslations('games.jp60')
  const [level, setLevel] = useState('N5')
  const [questions, setQuestions] = useState<PreviewQuestion[]>([])
  const [pending, start] = useTransition()

  const load = (lv: string) => start(async () => {
    const res = await previewJp60Questions(lv, 8)
    setQuestions(res.ok ? res.questions ?? [] : [])
  })

  useEffect(() => { load(level) }, [level])

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label={t('preview_level')} className="border border-line rounded-lg px-3 py-2 text-[13px] bg-cream">
          {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <button onClick={() => load(level)} disabled={pending} className="text-[13px] px-3 py-2 rounded-lg bg-rose text-white disabled:opacity-50">{t('preview_generate')}</button>
      </div>

      {pending && questions.length === 0 ? (
        <p className="text-muted text-[13px] animate-pulse">…</p>
      ) : (
        <div className="space-y-3">
          {questions.map((q, i) => (
            <div key={i} className="bg-paper border border-line rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2 text-[11px]">
                <span className="font-bold text-rose bg-rose/10 px-2 py-0.5 rounded-full">{tg(`q_label_${labelOf(q.qType)}`)}</span>
                <span className="text-muted">{t('q_type')}: {q.qType}</span>
                <span className="text-muted">· {q.difficulty}</span>
                <span className="text-muted">· {q.sourceType}</span>
              </div>
              <p className="text-[13px] text-muted mb-1">{tg(`q_instr_${instrOf(q.qType)}`)}</p>
              <p className="font-serif font-bold text-[18px] text-ink mb-2" lang="ja">{q.prompt}</p>
              <div className="grid grid-cols-2 gap-1.5 mb-2">
                {q.options.map((o) => (
                  <span key={o.key} className={`text-[13px] px-2 py-1 rounded border ${o.key === q.correctKey ? 'border-teal bg-teal/10 text-ink font-semibold' : 'border-line text-muted'}`}>
                    {o.key}. {o.text}{o.key === q.correctKey ? ` ✓` : ''}
                  </span>
                ))}
              </div>
              {q.rawSource && (
                <p className="text-[11px] text-muted font-mono break-all bg-ink/5 rounded px-2 py-1">
                  {t('raw_source')}: {q.rawSource}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// qType → the suffix used in games.jp60 i18n keys.
function labelOf(qType: string): string {
  if (qType.startsWith('kanji')) return 'kanji'
  if (qType === 'vocab_reading') return 'reading'
  if (qType === 'grammar_blank') return 'sentence'
  if (qType.startsWith('grammar')) return 'grammar'
  return 'meaning'
}
function instrOf(qType: string): string {
  const map: Record<string, string> = {
    vocab_ja_to_meaning: 'ja_to_meaning', vocab_meaning_to_ja: 'meaning_to_ja', vocab_reading: 'reading',
    kanji_to_meaning: 'kanji_meaning', kanji_meaning_to_char: 'meaning_to_kanji', kanji_reading: 'kanji_reading',
    grammar_pattern_to_meaning: 'grammar_meaning', grammar_meaning_to_pattern: 'grammar_pattern', grammar_blank: 'sentence',
  }
  return map[qType] ?? 'ja_to_meaning'
}
