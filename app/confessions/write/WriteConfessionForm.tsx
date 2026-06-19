'use client'

import dynamic from 'next/dynamic'
import { useFormState, useFormStatus } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { submitConfession, type ConfessionResult } from '../actions'
import type { Scope } from '@/lib/access'
import ScopeSelector from '@/components/access/ScopeSelector'
import AnonAvatar from '@/components/AnonAvatar'

const ConfessionEditor = dynamic(() => import('@/components/ConfessionEditor'), { ssr: false })

// ── Submit button ─────────────────────────────────────────────────────────────
function SubmitBtn({ label, loading }: { label: string; loading: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2.5 justify-center font-semibold text-[15px] px-9 py-3.5 rounded-full bg-rose text-white hover:bg-rose-deep hover:-translate-y-px transition-all disabled:opacity-60 disabled:cursor-not-allowed disabled:translate-y-0 shadow-[0_4px_20px_-4px_rgba(194,24,91,0.5)] hover:shadow-[0_6px_24px_-4px_rgba(194,24,91,0.55)] whitespace-nowrap"
    >
      {pending ? (
        <>
          <svg className="w-4 h-4 animate-spin flex-none" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
          {loading}
        </>
      ) : (
        <>
          <span>✨</span>
          {label}
        </>
      )}
    </button>
  )
}

const INIT: ConfessionResult = null

// ── Form ──────────────────────────────────────────────────────────────────────
export default function WriteConfessionForm({
  canPostInternal,
  initialScope,
}: {
  canPostInternal: boolean
  initialScope: Scope
}) {
  const t = useTranslations('confessions')
  const tAccess = useTranslations('access')
  const formRef = useRef<HTMLFormElement>(null)
  const [state, formAction] = useFormState(submitConfession, INIT)
  const [title, setTitle] = useState('')
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [scope, setScope] = useState<Scope>(initialScope)

  useEffect(() => {
    if (state?.ok) {
      try { localStorage.removeItem('confession-draft') } catch {}
    }
  }, [state])

  const errorMsg =
    state?.error === 'login_required'      ? t('loginToWrite')
    : state?.error === 'title_too_short'   ? t('titleMin')
    : state?.error === 'title_too_long'    ? t('titleMax')
    : state?.error === 'content_too_short' ? t('contentMin')
    : state?.error === 'content_too_long'  ? t('contentMax')
    : state?.error === 'content_empty'     ? t('editor.contentEmpty' as Parameters<typeof t>[0])
    : state?.error                         ? tAccess('error_generic')
    : null

  // ── Success state ─────────────────────────────────────────────────────────
  if (state?.ok) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-6 py-20">
        <div className="max-w-[500px] w-full text-center">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-emerald-100 animate-ping opacity-30" />
            <div className="relative w-20 h-20 rounded-full bg-emerald-50 border-2 border-emerald-200 grid place-items-center shadow-lg">
              <svg className="w-9 h-9 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          <h2 className="font-serif font-bold text-[28px] text-ink mb-3 tracking-[-0.3px]">
            {t('successHeading')}
          </h2>
          <p className="text-[15.5px] text-muted leading-relaxed mb-8">
            {t('successSub')}
          </p>

          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 mb-8 flex items-start gap-3 text-left">
            <span className="text-[18px] flex-none mt-0.5">⏳</span>
            <p className="text-[13.5px] text-amber-800 leading-relaxed">{t('pendingMessage')}</p>
          </div>

          <div className="flex gap-3 justify-center flex-wrap">
            <Link
              href="/confessions"
              className="inline-flex items-center gap-2 font-semibold text-[14px] px-6 py-3 rounded-full border border-line text-[#5c4d44] hover:bg-line transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {t('backToConfessions')}
            </Link>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 font-semibold text-[14px] px-6 py-3 rounded-full bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_4px_14px_-4px_rgba(194,24,91,0.45)]"
            >
              ✍️ {t('writeAnother')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Write form ────────────────────────────────────────────────────────────
  return (
    <div className="pb-20">

      {/* ── HERO HEADER ────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-b from-[#fdeef5] via-[#fdf6f9] to-cream border-b border-rose/10 mb-8">
        <div className="absolute -top-20 -right-16 w-72 h-72 rounded-full bg-rose/[0.07] pointer-events-none" />
        <div className="absolute top-8 -left-20 w-52 h-52 rounded-full bg-teal/[0.04] pointer-events-none" />
        <div className="absolute -bottom-10 right-1/3 w-40 h-40 rounded-full bg-rose/[0.04] pointer-events-none" />

        <div className="max-w-[900px] mx-auto px-6 pt-8 pb-10 relative z-[1]">
          <Link
            href="/confessions"
            className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-muted hover:text-rose transition-colors group mb-7"
          >
            <svg className="w-3.5 h-3.5 transition-transform group-hover:-translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {t('backToConfessions')}
          </Link>

          <div className="flex items-start gap-5">
            <div className="flex-1">
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3.5 py-1.5 rounded-full mb-4">
                🤫 FKO Confessions
              </span>

              <h1 className="font-serif font-bold text-[clamp(28px,4.5vw,46px)] leading-[1.12] tracking-[-0.6px] text-ink mb-3">
                {t('writeTitle')}
              </h1>

              <p className="text-[15px] text-muted leading-[1.72] max-w-[520px]">
                {t('subtitle')}
              </p>
            </div>

            <div className="hidden sm:flex flex-none items-center justify-center w-20 h-20 rounded-2xl bg-white/60 border border-rose/15 shadow-sm mt-1">
              <AnonAvatar size={52} />
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN CARD ──────────────────────────────────────────────────────── */}
      <div className="max-w-[900px] mx-auto px-5 sm:px-6">
        <div className="bg-paper rounded-2xl shadow-[0_4px_32px_-8px_rgba(36,26,23,0.12)] border border-line">

          <div className="h-[3px] bg-gradient-to-r from-transparent via-rose to-transparent rounded-t-2xl" />

          <div className="px-6 sm:px-9 py-8 space-y-7">

            {/* ── ANONYMOUS SECTION ──────────────────────────────────────── */}
            <button
              type="button"
              onClick={() => setIsAnonymous(!isAnonymous)}
              className={`w-full text-left rounded-2xl border px-5 py-4 transition-all ${
                isAnonymous
                  ? 'bg-gradient-to-br from-rose/8 to-[#fdeef5] border-rose/25 hover:border-rose/35'
                  : 'bg-cream/50 border-line hover:border-rose/20'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className={`flex-none w-11 h-11 rounded-xl grid place-items-center transition-all ${
                  isAnonymous ? 'bg-rose/10 ring-2 ring-rose/20' : 'bg-line/50'
                }`}>
                  <AnonAvatar size={34} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-semibold text-[14.5px] text-ink">{t('anonymousPost')}</span>
                    {isAnonymous && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose text-white uppercase tracking-wide">
                        ON
                      </span>
                    )}
                  </div>
                  <p className="text-[12.5px] text-muted leading-snug">
                    {t('anonymousDesc' as Parameters<typeof t>[0])}
                  </p>
                </div>

                <div
                  className={`flex-none w-12 h-6 rounded-full transition-colors relative ${
                    isAnonymous ? 'bg-rose' : 'bg-line'
                  }`}
                >
                  <div className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-md transition-transform ${
                    isAnonymous ? 'translate-x-6' : 'translate-x-0'
                  }`} />
                </div>
              </div>
            </button>

            <div className="border-t border-line/60" />

            {/* ── FORM ────────────────────────────────────────────────────── */}
            <form ref={formRef} action={formAction} className="space-y-6">
              <input type="hidden" name="is_anonymous" value={isAnonymous ? 'true' : 'false'} />
              <input type="hidden" name="scope" value={scope} />

              {/* Scope selector — internal members only */}
              {canPostInternal && (
                <ScopeSelector
                  value={scope}
                  onChange={setScope}
                  communityLabel={tAccess('scope_community')}
                  internalLabel={tAccess('scope_internal')}
                  hint={tAccess('scope_hint')}
                  legend={tAccess('scope_legend')}
                />
              )}

              <div>
                <label className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink mb-2">
                  {t('titleLabel')}
                  <span className="text-rose">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('titlePlaceholder')}
                  maxLength={120}
                  required
                  className="w-full text-[15px] px-4 py-3.5 border border-line rounded-xl bg-white focus:outline-none focus:border-rose/60 focus:ring-2 focus:ring-rose/10 placeholder:text-muted/45 text-ink transition-all"
                />
                <div className="flex justify-end mt-1.5">
                  <span className={`text-[11.5px] tabular-nums ${
                    title.length > 100 ? 'text-amber-600 font-semibold' : 'text-muted/60'
                  }`}>
                    {title.length} / 120
                  </span>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink mb-2">
                  {t('contentLabel')}
                  <span className="text-rose">*</span>
                </label>
                <ConfessionEditor
                  name="content"
                  placeholder={t('contentPlaceholder')}
                  minHeight="240px"
                />
              </div>

              {errorMsg && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3.5 text-[13.5px] text-red-700 flex items-start gap-2.5">
                  <svg className="w-4 h-4 flex-none mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                  </svg>
                  {errorMsg}
                </div>
              )}

              {state?.error === 'login_required' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3.5 flex items-center justify-between gap-4 flex-wrap">
                  <p className="text-[13.5px] text-amber-800 font-medium">{t('loginToWrite')}</p>
                  <Link
                    href="/login"
                    className="font-semibold text-[13px] px-5 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all whitespace-nowrap shadow-[0_2px_10px_-2px_rgba(194,24,91,0.4)]"
                  >
                    {t('loginButton')}
                  </Link>
                </div>
              )}

              <div className="border-t border-line/60" />

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
                <p className="text-[12.5px] text-muted/80 flex items-start gap-2 max-w-[380px] leading-[1.6]">
                  <span className="text-[14px] flex-none mt-px">🛡️</span>
                  <span>{t('privacyTip' as Parameters<typeof t>[0])}</span>
                </p>

                <div className="flex-none sm:ml-auto">
                  <SubmitBtn
                    label={t('submitBtn')}
                    loading={t('submitting')}
                  />
                </div>
              </div>

            </form>
          </div>
        </div>

        <div className="h-6" />
      </div>
    </div>
  )
}
