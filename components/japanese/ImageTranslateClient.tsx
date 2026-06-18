'use client'

import { useEffect, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import CopyButton from '@/components/japanese/CopyButton'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 5 * 1024 * 1024
const TARGETS = ['vi', 'en', 'ja', 'ko', 'zh'] as const

type Target = (typeof TARGETS)[number]
type ErrCode =
  | 'invalid_type' | 'too_large' | 'no_file' | 'decode_failed'
  | 'ocr_failed' | 'translate_failed' | 'rate_limited' | 'network' | 'empty'

interface Result {
  sourceText: string
  translation: string
  blocks: { text: string }[]
  ocrConfigured: boolean
  translateConfigured: boolean
  target: Target
}

export default function ImageTranslateClient() {
  const t = useTranslations('japanese')
  const locale = useLocale()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string>('')
  const [file, setFile] = useState<File | null>(null)
  const [target, setTarget] = useState<Target>(
    (TARGETS.includes(locale as Target) ? locale : 'vi') as Target,
  )
  const [dragOver, setDragOver] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<ErrCode | ''>('')
  const [result, setResult] = useState<Result | null>(null)

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview) }
  }, [preview])

  function acceptFile(f: File): boolean {
    if (!ALLOWED_TYPES.includes(f.type)) { setError('invalid_type'); return false }
    if (f.size > MAX_BYTES) { setError('too_large'); return false }
    setError('')
    setResult(null)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(URL.createObjectURL(f))
    setFile(f)
    return true
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) acceptFile(f)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) acceptFile(f)
  }

  // Paste image from clipboard.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'))
      const f = item?.getAsFile()
      if (f) acceptFile(f)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview])

  function reset() {
    if (preview) URL.revokeObjectURL(preview)
    setPreview('')
    setFile(null)
    setResult(null)
    setError('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function translate() {
    if (!file) return
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const fd = new FormData()
      fd.append('image', file)
      const res = await fetch(`/api/japanese/image-translate?target=${target}`, { method: 'POST', body: fd })
      const data = await res.json()

      if (res.status === 429) { setError('rate_limited'); return }
      if (data.error && !data.source_text) { setError(data.error as ErrCode); return }
      if (data.ocr_configured === false) {
        setResult({ sourceText: '', translation: '', blocks: [], ocrConfigured: false, translateConfigured: !!data.translate_configured, target })
        return
      }
      if (!data.source_text) { setError('empty'); return }

      setResult({
        sourceText: data.source_text ?? '',
        translation: data.translation ?? '',
        blocks: Array.isArray(data.blocks) ? data.blocks : [],
        ocrConfigured: data.ocr_configured !== false,
        translateConfigured: data.translate_configured !== false,
        target,
      })
      if (data.error === 'translate_failed') setError('translate_failed')
    } catch {
      setError('network')
    } finally {
      setLoading(false)
    }
  }

  const errorText = error ? t(`it_err_${error}` as Parameters<typeof t>[0]) : ''

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      {/* ── Left: upload + controls ─────────────────────────── */}
      <div className="flex flex-col gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={onInputChange}
        />

        {preview ? (
          <div className="relative rounded-2xl overflow-hidden border border-line bg-cream/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt={t('it_preview_alt')} className="w-full max-h-[320px] object-contain" />
            <button
              type="button"
              onClick={reset}
              className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 text-[12px] bg-white/90 text-red-600 font-semibold px-2.5 py-1 rounded-full hover:bg-white transition-colors"
            >
              {t('it_reset')}
            </button>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            aria-label={t('it_upload_label')}
            onClick={() => fileRef.current?.click()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click() } }}
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            className={`flex flex-col items-center justify-center text-center gap-2 rounded-2xl border-2 border-dashed px-6 py-12 cursor-pointer transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 ${
              dragOver ? 'border-rose/60 bg-rose-soft/50' : 'border-line/70 bg-cream/40 hover:border-rose/50 hover:bg-rose-soft/40'
            }`}
          >
            <div className="w-12 h-12 rounded-xl bg-rose/10 grid place-items-center text-rose">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-[14px] font-semibold text-[#5c4d44]">{t('it_drop_here')}</p>
            <p className="text-[12.5px] text-muted">{t('it_or_click')}</p>
            <p className="text-[11.5px] text-muted/70">{t('it_paste_hint')}</p>
            <p className="text-[11.5px] text-muted/70">{t('it_file_hint')}</p>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <label htmlFor="it-target" className="text-[12.5px] text-muted">{t('it_target_label')}</label>
          <select
            id="it-target"
            value={target}
            onChange={e => setTarget(e.target.value as Target)}
            className="text-[13px] px-3 py-2 border border-line rounded-xl bg-white focus:outline-none focus:border-rose text-ink"
          >
            {TARGETS.map(tg => (
              <option key={tg} value={tg}>{t(`it_lang_${tg}` as Parameters<typeof t>[0])}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={translate}
          disabled={!file || loading}
          className="inline-flex items-center justify-center gap-2 bg-rose text-white font-semibold text-[14.5px] py-3 rounded-xl hover:bg-rose-deep transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? t('it_translating') : t('it_translate')}
        </button>

        <p className="text-[11.5px] text-muted/70 leading-relaxed">{t('it_privacy')}</p>

        {errorText && (
          <p className="text-[13px] text-red-600 bg-red-50 border border-red-200 rounded-xl p-3">{errorText}</p>
        )}
      </div>

      {/* ── Right: results ──────────────────────────────────── */}
      <div className="flex flex-col gap-4">
        {result && !result.ocrConfigured && (
          <p className="text-[13px] text-muted bg-cream border border-line rounded-xl p-4">{t('it_provider_unconfigured')}</p>
        )}

        {result?.ocrConfigured && (
          <>
            <div className="bg-paper border border-line rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-[12px] font-bold text-muted uppercase tracking-wide">{t('it_source_text')}</h2>
                {result.sourceText && (
                  <CopyButton text={result.sourceText} label={t('it_copy')} copiedLabel={t('copied')} />
                )}
              </div>
              <p lang="ja" className="text-[15px] text-ink leading-relaxed whitespace-pre-wrap break-words">
                {result.sourceText || t('it_no_text')}
              </p>
            </div>

            <div className="bg-paper border border-line rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-[12px] font-bold text-muted uppercase tracking-wide">{t('it_translated_text')}</h2>
                {result.translation && (
                  <CopyButton text={result.translation} label={t('it_copy')} copiedLabel={t('copied')} />
                )}
              </div>
              {result.translation ? (
                <p className="text-[15px] text-ink leading-relaxed whitespace-pre-wrap break-words">{result.translation}</p>
              ) : (
                <p className="text-[13px] text-muted">
                  {result.translateConfigured ? t('it_err_translate_failed') : t('it_translate_unconfigured')}
                </p>
              )}
            </div>
          </>
        )}

        {!result && !loading && (
          <div className="hidden lg:flex flex-col items-center justify-center text-center h-full text-muted/70 border border-dashed border-line rounded-2xl p-8">
            <p className="text-[13.5px]">{t('it_result_placeholder')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
