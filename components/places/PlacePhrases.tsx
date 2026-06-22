'use client'

import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

export interface PhraseItem { ja: string; romaji?: string; vi?: string }

export default function PlacePhrases({ phrases }: { phrases: PhraseItem[] }) {
  const t = useTranslations('place_detail')
  const [hasSpeech, setHasSpeech] = useState(false)
  const [copied, setCopied] = useState<number | null>(null)

  useEffect(() => { setHasSpeech(typeof window !== 'undefined' && 'speechSynthesis' in window) }, [])

  if (!phrases.length) return null

  const copy = async (text: string, i: number) => {
    try { await navigator.clipboard.writeText(text); setCopied(i); setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500) } catch { /* ignore */ }
  }
  const speak = (text: string) => {
    try {
      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'ja-JP'
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(u)
    } catch { /* ignore */ }
  }

  return (
    <ul className="divide-y divide-line border border-line rounded-2xl overflow-hidden">
      {phrases.map((ph, i) => (
        <li key={`${ph.ja}-${i}`} className="px-4 py-3 bg-paper flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-serif text-[16px] text-ink">{ph.ja}</p>
            {ph.romaji && <p className="text-[12.5px] text-muted italic">{ph.romaji}</p>}
            {ph.vi && <p className="text-[13.5px] text-[#3a2d22] mt-0.5">{ph.vi}</p>}
          </div>
          <div className="flex-none flex items-center gap-1.5">
            <button type="button" onClick={() => copy(ph.ja, i)} title={t('copy')} aria-label={t('copy')}
              className="text-[11.5px] font-semibold px-2.5 py-1.5 rounded-lg border border-line text-muted hover:text-rose hover:border-rose/40 transition-colors">
              {copied === i ? t('copied') : t('copy')}
            </button>
            {hasSpeech && (
              <button type="button" onClick={() => speak(ph.ja)} title={t('speak')} aria-label={t('speak')}
                className="text-[14px] w-8 h-8 grid place-items-center rounded-lg border border-line text-muted hover:text-rose hover:border-rose/40 transition-colors">
                🔊
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}
