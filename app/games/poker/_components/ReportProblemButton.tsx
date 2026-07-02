'use client'

// In-game "Report a problem" flow for the Poker Alpha. Renders a trigger (floating
// pill, inline button, or text link) that opens a modal. On submit it merges the
// GAME-KNOWN context passed by the parent (table/hand/seat/street/state_version/…)
// with CLIENT-observable, non-sensitive context (build/browser/os/viewport/orientation/
// locale/connection/timestamp) and calls the server action. It NEVER has access to hole
// cards, the deck, tokens, or other players' state — only what the parent hands it plus
// public browser facts — so nothing sensitive can be attached.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { submitPokerBugReport } from '../alpha-actions'
import {
  BUG_SEVERITIES,
  REPORT_KINDS,
  UX_CATEGORIES,
  BETA_FEEDBACK_CATEGORIES,
  USABILITY_RATING_MIN,
  USABILITY_RATING_MAX,
  type BugSeverity,
  type ReportKind,
  type UxCategory,
  type BetaFeedbackCategory,
  type PokerBugContext,
} from '@/lib/games/poker/bugReport'
import { getUxTrailSummary } from '@/lib/games/poker/uxSignals'

type Variant = 'floating' | 'inline' | 'link'

// Map any server/exception error code to a known i18n leaf (fall back to generic).
const KNOWN_ERRORS = new Set(['not_authenticated', 'feature_off', 'rate_limited', 'validation', 'unavailable', 'db_error'])
function errorKey(code: string): string {
  return KNOWN_ERRORS.has(code) ? code : 'db_error'
}

interface Props {
  context?: Partial<PokerBugContext>
  variant?: Variant
  className?: string
}

function detectBrowser(ua: string): string {
  if (/edg\//i.test(ua)) return 'Edge'
  if (/opr\//i.test(ua) || /opera/i.test(ua)) return 'Opera'
  if (/crios/i.test(ua)) return 'Chrome iOS'
  if (/fxios/i.test(ua)) return 'Firefox iOS'
  if (/chrome/i.test(ua)) return 'Chrome'
  if (/firefox/i.test(ua)) return 'Firefox'
  if (/safari/i.test(ua)) return 'Safari'
  return 'Unknown'
}

function detectOs(ua: string): string {
  if (/windows/i.test(ua)) return 'Windows'
  if (/android/i.test(ua)) return 'Android'
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS'
  if (/mac os x/i.test(ua)) return 'macOS'
  if (/linux/i.test(ua)) return 'Linux'
  return 'Unknown'
}

export default function ReportProblemButton({ context, variant = 'floating', className }: Props) {
  const t = useTranslations('games.poker.bug_report')
  const locale = useLocale()
  const pathname = usePathname()

  const [open, setOpen] = useState(false)
  const [reportKind, setReportKind] = useState<ReportKind>('bug')
  const [uxCategory, setUxCategory] = useState<UxCategory>('confusing_action')
  const [feedbackCategory, setFeedbackCategory] = useState<BetaFeedbackCategory>('other')
  const [usabilityRating, setUsabilityRating] = useState<number>(0)
  const [description, setDescription] = useState('')
  const [expected, setExpected] = useState('')
  const [actual, setActual] = useState('')
  const [severity, setSeverity] = useState<BugSeverity>('major')
  const [contactOk, setContactOk] = useState(false)
  const [screenshotUrl, setScreenshotUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<'ok' | string | null>(null)

  // Collect non-sensitive client context lazily (needs window/navigator).
  const collectClientContext = useCallback((): PokerBugContext => {
    const nav = typeof navigator !== 'undefined' ? navigator : ({ userAgent: '', onLine: true } as Navigator)
    const ua = nav.userAgent || ''
    const w = typeof window !== 'undefined' ? window.innerWidth : 0
    const h = typeof window !== 'undefined' ? window.innerHeight : 0
    const orientation = w && h ? (w >= h ? 'landscape' : 'portrait') : undefined
    const build =
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
      process.env.NEXT_PUBLIC_BUILD_ID ||
      'dev'
    return {
      buildVersion: build,
      browser: detectBrowser(ua),
      os: detectOs(ua),
      userAgent: ua.slice(0, 300),
      viewport: w && h ? `${w}x${h}` : undefined,
      orientation,
      locale,
      connectionState: nav.onLine === false ? 'offline' : 'online',
      path: pathname,
      timestamp: new Date().toISOString(),
    }
  }, [locale, pathname])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const reset = () => {
    setReportKind('bug'); setUxCategory('confusing_action'); setFeedbackCategory('other'); setUsabilityRating(0)
    setDescription(''); setExpected(''); setActual(''); setSeverity('major')
    setContactOk(false); setScreenshotUrl(''); setResult(null)
  }

  const submit = async () => {
    if (busy) return
    if (!description.trim()) { setResult('validation'); return }
    setBusy(true); setResult(null)
    // Game-known context wins over client-observed on overlapping keys. The UX-feedback fields and
    // the recent usability-signal breadcrumb (a bounded "name:count" string — never card data) are
    // attached last so a confused-tester report arrives with its interaction context already on it.
    const uxTrail = getUxTrailSummary()
    const merged: PokerBugContext = {
      ...collectClientContext(),
      ...(context ?? {}),
      reportKind,
      ...(reportKind === 'ux_feedback'
        ? { uxCategory, ...(usabilityRating > 0 ? { usabilityRating } : {}) }
        : { feedbackCategory }),
      ...(uxTrail ? { uxTrail } : {}),
    }
    try {
      const res = await submitPokerBugReport({
        description, expected, actual, severity, contactOk,
        screenshotUrl: screenshotUrl.trim() || undefined,
        context: merged,
      })
      if (res.ok) { setResult('ok') }
      else { setResult(res.error) }
    } catch {
      setResult('db_error')
    } finally {
      setBusy(false)
    }
  }

  const triggerCls = useMemo(() => {
    if (variant === 'floating') {
      return 'fixed bottom-3 right-3 z-[115] rounded-full bg-black/80 px-3 py-2 text-[12px] font-semibold text-white shadow-lg backdrop-blur hover:bg-black'
    }
    if (variant === 'link') {
      return 'text-[13px] font-medium text-rose underline underline-offset-2 hover:opacity-80'
    }
    return 'rounded-lg border border-line bg-paper px-3 py-2 text-[13px] font-medium text-ink hover:bg-cream'
  }, [variant])

  return (
    <>
      <button type="button" onClick={() => { reset(); setOpen(true) }} className={`${triggerCls} ${className ?? ''}`}>
        <span aria-hidden>🐞 </span>{t('trigger')}
      </button>

      {open && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 text-ink shadow-xl sm:rounded-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-serif text-lg font-bold text-ink">{t('title')}</h2>
                <p className="text-[12px] text-muted">{t('subtitle')}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-muted hover:bg-cream" aria-label={t('close')}>✕</button>
            </div>

            {result === 'ok' ? (
              <div className="space-y-4 py-4 text-center">
                <div className="text-3xl" aria-hidden>✅</div>
                <p className="text-[14px] font-medium text-ink">{t('thanks')}</p>
                <div className="flex justify-center gap-2">
                  <button type="button" onClick={() => { reset(); }} className="rounded-lg border border-line px-3 py-2 text-[13px] hover:bg-cream">{t('report_another')}</button>
                  <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-rose px-3 py-2 text-[13px] font-medium text-white">{t('done')}</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Report kind — a functional bug vs a UX-usability observation. */}
                <div role="radiogroup" aria-label={t('report_kind_label')} className="flex gap-2">
                  {REPORT_KINDS.map((k) => {
                    const activeKind = reportKind === k
                    return (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={activeKind}
                        onClick={() => setReportKind(k)}
                        className={`flex-1 rounded-lg border px-3 py-2 text-[13px] font-medium transition ${
                          activeKind ? 'border-rose bg-rose/10 text-rose' : 'border-line bg-paper text-muted hover:bg-cream'
                        }`}
                      >
                        {t(`report_kind.${k}`)}
                      </button>
                    )
                  })}
                </div>

                {reportKind === 'ux_feedback' && (
                  <label className="block">
                    <span className="text-[12px] font-medium text-ink">{t('field_rating')}</span>
                    <div role="radiogroup" aria-label={t('field_rating')} className="mt-1 flex gap-1.5">
                      {Array.from({ length: USABILITY_RATING_MAX - USABILITY_RATING_MIN + 1 }, (_, i) => USABILITY_RATING_MIN + i).map((n) => {
                        const activeRating = usabilityRating === n
                        return (
                          <button
                            key={n}
                            type="button"
                            role="radio"
                            aria-checked={activeRating}
                            aria-label={t('rating_value', { n })}
                            onClick={() => setUsabilityRating(activeRating ? 0 : n)}
                            className={`h-10 flex-1 rounded-lg border text-[14px] font-semibold tabular-nums transition ${
                              activeRating ? 'border-rose bg-rose text-white' : 'border-line bg-cream/40 text-ink hover:bg-cream'
                            }`}
                          >
                            {n}
                          </button>
                        )
                      })}
                    </div>
                    <span className="mt-1 block text-[11px] text-muted">{t('rating_hint')}</span>
                  </label>
                )}

                <label className="block">
                  <span className="text-[12px] font-medium text-ink">
                    {reportKind === 'ux_feedback' ? t('field_description_ux') : t('field_description')} *
                  </span>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                    className="mt-1 w-full rounded-lg border border-line bg-cream/40 p-2 text-[14px] outline-none focus:border-rose"
                    placeholder={reportKind === 'ux_feedback' ? t('ph_description_ux') : t('ph_description')} maxLength={4000} />
                </label>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[12px] font-medium text-ink">{t('field_expected')}</span>
                    <textarea value={expected} onChange={(e) => setExpected(e.target.value)} rows={2}
                      className="mt-1 w-full rounded-lg border border-line bg-cream/40 p-2 text-[13px] outline-none focus:border-rose"
                      placeholder={t('ph_expected')} maxLength={2000} />
                  </label>
                  <label className="block">
                    <span className="text-[12px] font-medium text-ink">{t('field_actual')}</span>
                    <textarea value={actual} onChange={(e) => setActual(e.target.value)} rows={2}
                      className="mt-1 w-full rounded-lg border border-line bg-cream/40 p-2 text-[13px] outline-none focus:border-rose"
                      placeholder={t('ph_actual')} maxLength={2000} />
                  </label>
                </div>

                {reportKind === 'bug' && (
                  <label className="block">
                    <span className="text-[12px] font-medium text-ink">{t('field_category')}</span>
                    <select value={feedbackCategory} onChange={(e) => setFeedbackCategory(e.target.value as BetaFeedbackCategory)}
                      className="mt-1 w-full rounded-lg border border-line bg-cream/40 p-2 text-[13px] outline-none focus:border-rose">
                      {BETA_FEEDBACK_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{t(`feedback_category.${c}`)}</option>
                      ))}
                    </select>
                  </label>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {reportKind === 'ux_feedback' ? (
                    <label className="block">
                      <span className="text-[12px] font-medium text-ink">{t('field_ux_category')}</span>
                      <select value={uxCategory} onChange={(e) => setUxCategory(e.target.value as UxCategory)}
                        className="mt-1 w-full rounded-lg border border-line bg-cream/40 p-2 text-[13px] outline-none focus:border-rose">
                        {UX_CATEGORIES.map((c) => (
                          <option key={c} value={c}>{t(`ux_category.${c}`)}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="block">
                      <span className="text-[12px] font-medium text-ink">{t('field_severity')}</span>
                      <select value={severity} onChange={(e) => setSeverity(e.target.value as BugSeverity)}
                        className="mt-1 w-full rounded-lg border border-line bg-cream/40 p-2 text-[13px] outline-none focus:border-rose">
                        {BUG_SEVERITIES.map((s) => (
                          <option key={s} value={s}>{t(`severity.${s}`)}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  <label className="block">
                    <span className="text-[12px] font-medium text-ink">{t('field_screenshot')}</span>
                    <input type="url" value={screenshotUrl} onChange={(e) => setScreenshotUrl(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-line bg-cream/40 p-2 text-[13px] outline-none focus:border-rose"
                      placeholder={t('ph_screenshot')} maxLength={2000} />
                  </label>
                </div>

                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={contactOk} onChange={(e) => setContactOk(e.target.checked)} className="mt-0.5" />
                  <span className="text-[12px] text-muted">{t('contact_ok')}</span>
                </label>

                <p className="rounded-lg bg-cream/60 px-3 py-2 text-[11px] text-muted">{t('privacy_note')}</p>

                {result && result !== 'ok' && (
                  <p className="text-[12px] font-medium text-red-600">{t(`error.${errorKey(result)}`)}</p>
                )}

                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-line px-3 py-2 text-[13px] hover:bg-cream">{t('cancel')}</button>
                  <button type="button" onClick={submit} disabled={busy || !description.trim()}
                    className="rounded-lg bg-rose px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50">
                    {busy ? t('sending') : t('send')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
