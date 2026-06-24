'use client'

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

export interface PhraseItem { ja: string; romaji?: string; vi?: string }

const isJaLang = (l?: string) => !!l && l.toLowerCase().replace('_', '-').startsWith('ja')

export default function PlacePhrases({ phrases }: { phrases: PhraseItem[] }) {
  const t = useTranslations('place_detail')
  const [hasSpeech, setHasSpeech] = useState(false)
  const [copied, setCopied] = useState<number | null>(null)
  const [unsupported, setUnsupported] = useState(false)
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])
  const primedRef = useRef(false)

  // Cache voices up-front. On mobile getVoices() is empty on first call and the
  // list arrives asynchronously via 'voiceschanged' — so we keep a live cache and
  // can read it synchronously inside the tap handler (required for iOS).
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    setHasSpeech(true)
    const synth = window.speechSynthesis
    const load = () => {
      const vs = synth.getVoices()
      if (vs.length) voicesRef.current = vs
    }
    load()
    synth.addEventListener?.('voiceschanged', load)
    return () => synth.removeEventListener?.('voiceschanged', load)
  }, [])

  if (!phrases.length) return null

  const copy = async (text: string, i: number) => {
    try { await navigator.clipboard.writeText(text); setCopied(i); setTimeout(() => setCopied((c) => (c === i ? null : c)), 1500) } catch { /* ignore */ }
  }

  // Speak MUST stay synchronous inside the tap handler — no await before speak()
  // or iOS Safari silently blocks it.
  const speak = (text: string) => {
    try {
      const synth = window.speechSynthesis
      // Prefer the live cache; fall back to a fresh read (covers the first tap on
      // iOS before 'voiceschanged' has fired).
      const voices = voicesRef.current.length ? voicesRef.current : synth.getVoices()

      // If the voice list is loaded but contains no Japanese voice, the device
      // genuinely can't read Japanese (common on Android without the JP TTS pack).
      // length === 0 means "not loaded yet" (typical on iOS first tap) — in that
      // case we still try, because iOS reads ja via its built-in default.
      if (voices.length > 0 && !voices.some(v => isJaLang(v.lang))) {
        setUnsupported(true)
        return
      }

      // Only cancel when something is actually queued/playing. An unconditional
      // cancel() immediately before the first speak() can drop that first
      // utterance on iOS; this still clears a stuck queue on later taps.
      if (synth.speaking || synth.pending) synth.cancel()

      const u = new SpeechSynthesisUtterance(text)
      u.lang = 'ja-JP'
      const ja = voices.find(v => v.lang.toLowerCase().replace('_', '-') === 'ja-jp') || voices.find(v => isJaLang(v.lang))
      if (ja) u.voice = ja // explicit voice is what makes Android Chrome reliable

      synth.speak(u)
      // iOS can leave the engine paused after a cancel — nudge it.
      if (synth.paused) synth.resume()
      primedRef.current = true
      if (unsupported) setUnsupported(false)
    } catch { setUnsupported(true) }
  }

  return (
    <div>
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
      {unsupported && (
        <p className="mt-2 text-[12.5px] text-muted">⚠️ {t('speak_unsupported')}</p>
      )}
    </div>
  )
}
