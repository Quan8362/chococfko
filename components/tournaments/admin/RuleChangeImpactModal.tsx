'use client'

// Controlled RULE-CHANGE impact modal (Prompt 15D-2). Opened from the "Luật thi đấu" tab when the
// safety guard blocks a naive edit and the admin has chosen the controlled path. It shows the counts a
// reset would touch (never identities), the destructive warning, the reset + regenerate choices and —
// when results exist — an explicit confirmation phrase, then applies the change through ONE atomic
// server action. Accessible (role=dialog, labelled/described, focus + Escape), no window.confirm, no
// double-submit. All authorization / atomicity / staleness is re-checked server-side; this UI is
// convenience only.

import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  RULE_CHANGE_CONFIRM_PHRASE,
  type RuleChangeImpactPreview,
  type RuleChangeApplyInput,
  type RuleChangeApplyResult,
  type RuleEditorFields,
  type RuleResetMode,
  type RegenerateMode,
} from '@/lib/tournaments/rules'

export interface RuleChangeImpactModalProps {
  open: boolean
  preview: RuleChangeImpactPreview | null
  tournamentId: string
  eventId: string
  fields: RuleEditorFields | null
  acknowledgeWarning: boolean
  apply: (input: RuleChangeApplyInput) => Promise<RuleChangeApplyResult>
  onApplied: () => void
  onClose: () => void
}

export default function RuleChangeImpactModal({
  open,
  preview,
  tournamentId,
  eventId,
  fields,
  acknowledgeWarning,
  apply,
  onApplied,
  onClose,
}: RuleChangeImpactModalProps) {
  const t = useTranslations('admin_rule_change')
  const titleId = useId()
  const descId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)

  const requiredScope: RuleResetMode =
    preview?.requiredResetScope === 'all_results_and_downstream' ? 'all_results_and_downstream' : 'schedule_only'
  const [resetMode, setResetMode] = useState<RuleResetMode>(requiredScope)
  const [regenerateMode, setRegenerateMode] = useState<RegenerateMode>('none')
  const [confirmText, setConfirmText] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset the local form whenever a new preview is opened.
  useEffect(() => {
    if (!open || !preview) return
    setResetMode(preview.requiredResetScope === 'all_results_and_downstream' ? 'all_results_and_downstream' : 'schedule_only')
    const modes = preview.summary.regenerateModes
    setRegenerateMode(modes.includes('round_robin') ? 'round_robin' : 'none')
    setConfirmText('')
    setError(null)
    setPending(false)
  }, [open, preview])

  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  useEffect(() => {
    if (!open) return
    const opener = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pendingRef.current) onCloseRef.current()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [open])

  if (!open || !preview || !fields) return null

  const s = preview.summary
  const destructive = preview.requiresDestructiveConfirmation
  const confirmBlocked = destructive && confirmText.trim().toUpperCase() !== RULE_CHANGE_CONFIRM_PHRASE

  async function onApply() {
    if (pending || confirmBlocked || !preview || !fields) return
    setPending(true)
    setError(null)
    const res = await apply({
      tournamentId,
      eventId,
      snapshotId: preview.snapshotId,
      expectedSnapshotVersion: preview.snapshotVersion,
      expectedEventVersion: preview.eventVersion,
      fields,
      expectedImpactToken: preview.impactToken,
      resetMode,
      regenerateMode,
      acknowledgeWarning,
      confirmation: destructive ? confirmText.trim().toUpperCase() : undefined,
    })
    setPending(false)
    if (res.ok) {
      onApplied()
      return
    }
    setError(t(`error.${res.error}`))
  }

  const counts: Array<{ key: string; value: number }> = [
    { key: 'group_matches', value: s.groupMatches },
    { key: 'championship_matches', value: s.championshipMatches },
    { key: 'consolation_matches', value: s.consolationMatches },
    { key: 'scored_games', value: s.scoredGames },
    { key: 'completed_matches', value: s.completedMatches },
    { key: 'qualification_overrides', value: s.qualificationOverrides },
    { key: 'podium_rows', value: s.podiumRows },
  ].filter((c) => c.value > 0)

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClick={() => {
        if (!pending) onClose()
      }}
    >
      <div
        className="w-full max-w-[520px] max-h-[85vh] overflow-y-auto bg-paper border border-line rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="font-serif font-bold text-[17px] text-ink leading-snug">
          {t('title')}
        </h3>
        <p id={descId} className="text-[13px] text-muted mt-1 leading-relaxed">
          {t(`severity.${preview.classification.severity}`)}
        </p>

        {destructive && (
          <div role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[12.5px] text-red-900">
            {t('destructive_warning')}
          </div>
        )}

        <div className="mt-4 rounded-xl border border-line bg-cream/60 px-4 py-3">
          <p className="text-[12px] font-semibold text-ink mb-2">{t('affected_heading')}</p>
          {counts.length === 0 ? (
            <p className="text-[12.5px] text-muted">{t('affected_none')}</p>
          ) : (
            <ul className="grid gap-1 sm:grid-cols-2">
              {counts.map((c) => (
                <li key={c.key} className="flex items-center justify-between text-[12.5px] text-ink">
                  <span className="text-muted">{t(`count.${c.key}`)}</span>
                  <span className="font-semibold tabular-nums">{c.value}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Reset scope — forced to full when results exist (§6). */}
        <label className="block mt-4 text-[12.5px] text-ink">
          <span className="font-semibold">{t('reset_mode_label')}</span>
          <select
            value={resetMode}
            onChange={(e) => setResetMode(e.target.value as RuleResetMode)}
            disabled={pending || destructive}
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-[13px]"
          >
            <option value="schedule_only">{t('reset_mode.schedule_only')}</option>
            <option value="all_results_and_downstream">{t('reset_mode.all_results_and_downstream')}</option>
          </select>
        </label>

        {/* Regeneration choice. */}
        <label className="block mt-3 text-[12.5px] text-ink">
          <span className="font-semibold">{t('regenerate_mode_label')}</span>
          <select
            value={regenerateMode}
            onChange={(e) => setRegenerateMode(e.target.value as RegenerateMode)}
            disabled={pending}
            className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-[13px]"
          >
            {s.regenerateModes.map((m) => (
              <option key={m} value={m}>
                {t(`regenerate_mode.${m}`)}
              </option>
            ))}
          </select>
          {!s.canAutoRegenerate && <span className="mt-1 block text-[11.5px] text-amber-700">{t('regenerate_manual_note')}</span>}
        </label>

        {destructive && (
          <label className="block mt-3 text-[12.5px] text-ink">
            <span className="font-semibold">{t('confirm_label', { phrase: RULE_CHANGE_CONFIRM_PHRASE })}</span>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={pending}
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 text-[13px]"
              placeholder={RULE_CHANGE_CONFIRM_PHRASE}
            />
          </label>
        )}

        {error && (
          <p role="alert" className="mt-3 text-[12px] text-rose">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end mt-5">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={pending}
            className="font-semibold text-[13px] px-4 py-2 rounded-full border border-line bg-cream text-[#5c4d44] hover:bg-line/60 transition-colors disabled:opacity-60"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={pending || confirmBlocked}
            className="font-semibold text-[13px] px-4 py-2 rounded-full text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {pending ? '⏳' : t('apply')}
          </button>
        </div>
      </div>
    </div>
  )
}
