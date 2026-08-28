'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { saveGroupMatchResult, clearGroupMatchResult } from '@/app/admin/giai-dau/[id]/noi-dung/actions'
import type { MatchView, ScoreMutationError } from '@/lib/tournaments/admin/types'
import type { EventScoringRuleView, HandicapRuleView, StageRuleView } from '@/lib/tournaments/rules'
import ScoreRuleBanner from './ScoreRuleBanner'
import TruncatedName from '@/components/tournaments/public/TruncatedName'

// Modal for entering / editing the game scores of ONE group match. The client only does OPTIMISTIC
// UX validation (integer, non-negative, no per-game tie, at least one game, games won not equal) and
// a games-won tally for display — the authoritative winner is derived on the server via the pure
// engine (validateMatchScores → deriveMatchOutcome). Never trusts the client's tally.
interface Row {
  a: string
  b: string
}

export default function ScoreEditor({
  tournamentId,
  eventId,
  match,
  nameA,
  nameB,
  rule,
  ruleSource,
  handicapBlocked = false,
  handicap,
  onClose,
}: {
  tournamentId: string
  eventId: string
  match: MatchView
  nameA: string
  nameB: string
  rule?: StageRuleView | null
  ruleSource?: EventScoringRuleView['source']
  handicapBlocked?: boolean
  handicap?: HandicapRuleView | null
  onClose: () => void
}) {
  const t = useTranslations('admin_match_scores')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<ScoreMutationError | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const wasCompleted = match.status === 'completed'
  const [rows, setRows] = useState<Row[]>(
    match.games.length > 0
      ? match.games.map((g) => ({ a: String(g.scoreA), b: String(g.scoreB) }))
      : [{ a: '', b: '' }],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, onClose])

  const parsed = useMemo(
    () =>
      rows.map((r) => {
        const a = Number(r.a)
        const b = Number(r.b)
        const filled = r.a.trim() !== '' && r.b.trim() !== ''
        const valid =
          filled && Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a !== b
        return { a, b, filled, valid }
      }),
    [rows],
  )

  const allValid = parsed.length > 0 && parsed.every((p) => p.valid)
  const wonA = parsed.filter((p) => p.valid && p.a > p.b).length
  const wonB = parsed.filter((p) => p.valid && p.b > p.a).length
  const decisive = wonA !== wonB
  const canSave = allValid && decisive && !pending && !handicapBlocked

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r, k) => (k === i ? { ...r, ...patch } : r)))
  const addRow = () => setRows((prev) => [...prev, { a: '', b: '' }])
  const removeRow = (i: number) => setRows((prev) => (prev.length > 1 ? prev.filter((_, k) => k !== i) : prev))

  function doSave() {
    setError(null)
    const games = parsed.map((p) => ({ scoreA: p.a, scoreB: p.b }))
    startTransition(async () => {
      const res = await saveGroupMatchResult(tournamentId, eventId, match.id, match.version, games)
      if (res.ok) {
        onClose()
        router.refresh()
      } else {
        setError(res.error)
      }
    })
  }

  function doClear() {
    setError(null)
    startTransition(async () => {
      const res = await clearGroupMatchResult(tournamentId, eventId, match.id, match.version)
      if (res.ok) {
        onClose()
        router.refresh()
      } else {
        setConfirmClear(false)
        setError(res.error)
      }
    })
  }

  const winnerName = !decisive ? null : wonA > wonB ? nameA : nameB

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('editor_title')}
      onClick={() => {
        if (!pending) onClose()
      }}
    >
      <div
        className="w-full max-w-[440px] max-h-[90vh] overflow-y-auto bg-paper border border-line rounded-2xl shadow-xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h3 className="font-serif font-bold text-[17px] text-ink leading-snug">{t('editor_title')}</h3>
            <p className="text-[12.5px] text-muted mt-0.5">
              {t('match_label', { number: match.matchNumber })}
            </p>
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

        {/* Competitor header — names stay on one truncated line so the modal keeps its width; the full
            name is reachable via the shared TruncatedName tooltip (hover OR keyboard focus, rendered in
            a portal above the modal so it is never clipped) plus a native title/aria-label fallback. */}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 mb-3 text-center">
          <TruncatedName name={nameA} className="text-[13.5px] font-semibold text-ink" />
          <span className="text-[11px] text-muted">{t('vs')}</span>
          <TruncatedName name={nameB} className="text-[13.5px] font-semibold text-ink" />
        </div>

        <ScoreRuleBanner rule={rule} source={ruleSource} handicapBlocked={handicapBlocked} handicap={handicap} />

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 mb-3" role="alert">
            <p className="text-[13px] text-red-600">{t(`err_${error}`)}</p>
          </div>
        )}

        {/* Game rows */}
        <div className="space-y-2">
          {rows.map((r, i) => {
            const invalid = (r.a.trim() !== '' || r.b.trim() !== '') && !parsed[i].valid
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="flex-none w-14 text-[11.5px] text-muted">{t('game_n', { number: i + 1 })}</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={r.a}
                  onChange={(e) => setRow(i, { a: e.target.value })}
                  aria-label={t('score_of', { name: nameA, game: i + 1 })}
                  className={`flex-1 min-w-0 text-center text-[14px] px-2 py-1.5 rounded-lg border bg-cream focus:outline-none focus:border-rose/50 ${
                    invalid ? 'border-red-300' : 'border-line'
                  }`}
                />
                <span className="flex-none text-muted">–</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={r.b}
                  onChange={(e) => setRow(i, { b: e.target.value })}
                  aria-label={t('score_of', { name: nameB, game: i + 1 })}
                  className={`flex-1 min-w-0 text-center text-[14px] px-2 py-1.5 rounded-lg border bg-cream focus:outline-none focus:border-rose/50 ${
                    invalid ? 'border-red-300' : 'border-line'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  disabled={rows.length <= 1}
                  aria-label={t('remove_game', { number: i + 1 })}
                  className="flex-none w-7 h-7 grid place-items-center rounded-md border border-line bg-paper text-muted hover:text-red-600 disabled:opacity-30 transition-colors"
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>

        <button
          type="button"
          onClick={addRow}
          className="mt-2 text-[12.5px] font-semibold text-teal hover:text-teal/80 transition-colors"
        >
          + {t('add_game')}
        </button>

        {/* Live tally (optimistic; server is authoritative) */}
        <div className="mt-4 flex items-center justify-between gap-2 rounded-lg bg-cream border border-line px-3 py-2">
          <span className="text-[12.5px] text-muted">{t('games_won')}</span>
          <span className="text-[14px] font-bold text-ink">
            {wonA}–{wonB}
          </span>
          <span className="text-[12.5px] text-muted truncate">
            {winnerName ? t('winner_preview', { name: winnerName }) : t('no_winner_yet')}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-2 mt-5">
          <div>
            {wasCompleted && !confirmClear && (
              <button
                type="button"
                onClick={() => setConfirmClear(true)}
                disabled={pending}
                className="font-semibold text-[13px] px-3 py-2 rounded-full border border-red-200 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white hover:border-transparent transition-all disabled:opacity-50"
              >
                {t('clear_result')}
              </button>
            )}
            {wasCompleted && confirmClear && (
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] text-muted">{t('confirm_clear')}</span>
                <button
                  type="button"
                  onClick={doClear}
                  disabled={pending}
                  className="font-semibold text-[12px] px-3 py-1.5 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {pending ? '⏳' : t('confirm_clear_yes')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  disabled={pending}
                  className="font-semibold text-[12px] px-3 py-1.5 rounded-full border border-line bg-cream text-[#5c4d44] hover:bg-line/60 transition-colors disabled:opacity-50"
                >
                  {t('cancel')}
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => !pending && onClose()}
              disabled={pending}
              className="font-semibold text-[13px] px-4 py-2 rounded-full border border-line bg-cream text-[#5c4d44] hover:bg-line/60 transition-colors disabled:opacity-60"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={doSave}
              disabled={!canSave}
              title={!decisive ? t('need_decisive') : undefined}
              className="font-semibold text-[13px] px-5 py-2 rounded-full bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {pending ? t('saving') : wasCompleted ? t('update_result') : t('save_result')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
