'use client'

// Impact-preview + controlled RESET dialog (Prompt 11). Shown when an admin corrects a completed
// knockout result whose downstream is already completed. It lists — per round — exactly which matches
// will be reset, which scores/participants are cleared, whether the podium is invalidated and how the
// event status changes, then requires the admin to type the exact word RESET before the (not
// auto-undoable) reset runs. Never a bare browser confirm(). Keyboard accessible, not color-only.

import { useEffect, useRef, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { resetAffectedKnockoutPath } from '@/app/admin/giai-dau/[id]/noi-dung/actions'
import type { KnockoutImpactPreview, ResetPathError } from '@/lib/tournaments/admin/types'

const CONFIRM_WORD = 'RESET'

function useRoundLabel() {
  const tB = useTranslations('admin_knockout_bracket')
  return (token: string) => {
    const known = ['final', 'semifinal', 'quarterfinal', 'round_of_16', 'third_place']
    if (known.includes(token)) return tB(`label_${token}`)
    const m = /^round_(\d+)$/.exec(token)
    return m ? tB('label_generic', { n: m[1] }) : token
  }
}

export default function ImpactPreviewDialog({
  tournamentId,
  eventId,
  preview,
  games,
  onClose,
  onDone,
}: {
  tournamentId: string
  eventId: string
  preview: KnockoutImpactPreview
  games: { scoreA: number; scoreB: number }[]
  onClose: () => void
  onDone: () => void
}) {
  const t = useTranslations('admin_impact_preview')
  const tr = useTranslations('admin_downstream_reset')
  const roundLabel = useRoundLabel()
  const [pending, startTransition] = useTransition()
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState<ResetPathError | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, onClose])

  const canConfirm = confirmText === CONFIRM_WORD && !pending

  function doReset() {
    if (!canConfirm) return
    setError(null)
    startTransition(async () => {
      const res = await resetAffectedKnockoutPath(
        tournamentId,
        eventId,
        preview.upstreamMatchId,
        preview.upstreamMatchVersion,
        CONFIRM_WORD,
        games,
      )
      if (res.ok) onDone()
      else setError(res.error)
    })
  }

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center p-4 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="impact-title"
      onClick={() => !pending && onClose()}
    >
      <div
        className="w-full max-w-[540px] max-h-[90vh] overflow-y-auto bg-paper border border-line rounded-2xl shadow-xl p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="flex-none w-8 h-8 grid place-items-center rounded-lg bg-amber-100 text-amber-700" aria-hidden="true">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </span>
            <h3 id="impact-title" className="font-serif font-bold text-[17px] text-ink leading-snug">{t('title')}</h3>
          </div>
          <button
            type="button"
            onClick={() => !pending && onClose()}
            aria-label={t('close')}
            className="flex-none w-8 h-8 grid place-items-center rounded-lg text-muted hover:text-ink hover:bg-cream transition-colors"
          >
            ✕
          </button>
        </div>

        <p className="text-[13px] text-muted mb-4">{t('subtitle')}</p>

        {/* Winner change summary */}
        <div className="rounded-xl border border-line bg-cream px-3.5 py-3 mb-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">
            {roundLabel(preview.roundLabel)} · {preview.competitorAName} – {preview.competitorBName}
          </p>
          <div className="flex items-center gap-2 text-[13.5px]">
            <span className="text-ink line-through decoration-red-400">{t('winner')}: {preview.currentWinnerName}</span>
            <svg className="w-4 h-4 text-muted flex-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <span className="font-semibold text-teal">{preview.newWinnerName}</span>
          </div>
        </div>

        {/* Affected matches (by round) */}
        <div className="mb-4">
          <p className="text-[12.5px] font-semibold text-ink mb-2">
            {t('affected_heading', { count: preview.affected.length })}
          </p>
          {preview.affected.length === 0 ? (
            <p className="text-[12.5px] text-muted">{t('none_affected')}</p>
          ) : (
            <ul className="space-y-1.5">
              {preview.affected.map((m) => (
                <li
                  key={m.matchId}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg border border-line bg-paper px-3 py-2"
                >
                  <span className="text-[13px] font-medium text-ink">{roundLabel(m.roundLabel)}</span>
                  <span className="flex flex-wrap items-center gap-2 text-[11.5px]">
                    {m.willClearResult && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 text-red-600 border border-red-200 px-2 py-0.5">
                        {t('will_clear')}
                      </span>
                    )}
                    {m.gamesToDelete > 0 && (
                      <span className="text-muted">{t('games_deleted', { count: m.gamesToDelete })}</span>
                    )}
                    {m.participantNames.length > 0 && (
                      <span className="text-muted">{t('participants_reset', { names: m.participantNames.join(', ') })}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Consequences */}
        <dl className="grid grid-cols-1 gap-1.5 mb-4 text-[12.5px]">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{t('scores_deleted')}</dt>
            <dd className="font-semibold text-ink">{preview.totalGamesToDelete}</dd>
          </div>
          {preview.podiumWillClear && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">{t('podium')}</dt>
              <dd className="font-semibold text-red-600">{t('podium_cleared')}</dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted">{t('event_status')}</dt>
            <dd className="font-semibold text-ink">
              {tr(`status_${preview.eventStatusFrom}`)} → {tr(`status_${preview.eventStatusTo}`)}
            </dd>
          </div>
          {preview.branchesUnaffected.length > 0 && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted">{t('unaffected_branches')}</dt>
              <dd className="font-medium text-teal">
                {preview.branchesUnaffected.map((b) => tr(`bracket_${b}`)).join(', ')}
              </dd>
            </div>
          )}
        </dl>

        {/* Irreversibility notice */}
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 mb-4">
          <p className="text-[12.5px] text-amber-900">{t('no_undo')}</p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 mb-3" role="alert">
            <p className="text-[13px] text-red-600">{tr(`err_${error}`)}</p>
          </div>
        )}

        {/* Confirmation: type RESET */}
        <label htmlFor="reset-confirm" className="block text-[12.5px] text-ink mb-1.5">
          {tr('confirm_prompt', { word: CONFIRM_WORD })}
        </label>
        <input
          id="reset-confirm"
          ref={inputRef}
          type="text"
          autoComplete="off"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          placeholder={CONFIRM_WORD}
          aria-describedby="reset-confirm-hint"
          className="w-full text-[14px] px-3 py-2 rounded-lg border border-line bg-cream focus:outline-none focus:border-rose/50 tracking-widest"
        />
        <p id="reset-confirm-hint" className="sr-only">{tr('confirm_prompt', { word: CONFIRM_WORD })}</p>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={() => !pending && onClose()}
            disabled={pending}
            className="font-semibold text-[13px] px-4 py-2 rounded-full border border-line bg-cream text-[#5c4d44] hover:bg-line/60 transition-colors disabled:opacity-60"
          >
            {tr('cancel')}
          </button>
          <button
            type="button"
            onClick={doReset}
            disabled={!canConfirm}
            className="font-semibold text-[13px] px-5 py-2 rounded-full bg-red-600 text-white hover:bg-red-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {pending ? tr('resetting') : tr('confirm_reset')}
          </button>
        </div>
      </div>
    </div>
  )
}
