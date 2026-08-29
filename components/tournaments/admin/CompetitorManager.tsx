'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import ConfirmDialog from './ConfirmDialog'
import TruncatedName from '@/components/tournaments/public/TruncatedName'
import {
  validateCompetitorInput,
  parseBulkCompetitors,
  doublesCompositionToken,
  DOUBLES_COMPOSITION_OPTIONS,
  type CompetitorFieldErrors,
  type CompetitorFieldErrorCode,
} from '@/lib/tournaments/competitorValidation'
import {
  createCompetitor,
  updateCompetitor,
  deleteCompetitor,
  reorderCompetitors,
  bulkCreateCompetitors,
} from '@/app/admin/giai-dau/[id]/noi-dung/actions'
import type { CompetitorRow, EventMutationError } from '@/lib/tournaments/admin/types'

const inputCls =
  'w-full text-[13.5px] px-2.5 py-1.5 rounded-lg bg-cream border border-line text-ink focus:outline-none focus:border-rose/50'

export default function CompetitorManager({
  tournamentId,
  eventId,
  competitors,
  locked,
  showSeed,
  showComposition = false,
}: {
  tournamentId: string
  eventId: string
  competitors: CompetitorRow[]
  locked: boolean
  showSeed: boolean
  showComposition?: boolean
}) {
  const t = useTranslations('admin_tournament_competitors')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<EventMutationError | null>(null)
  const [errorNames, setErrorNames] = useState<string[]>([])

  // ── Add-single form ──────────────────────────────────────────────────────
  const [addName, setAddName] = useState('')
  const [addShort, setAddShort] = useState('')
  const [addSeed, setAddSeed] = useState('')
  const [addComp, setAddComp] = useState('')
  const [addErrors, setAddErrors] = useState<CompetitorFieldErrors>({})

  // ── Bulk form ────────────────────────────────────────────────────────────
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const bulkPreview = useMemo(() => parseBulkCompetitors(bulkText), [bulkText])

  // ── Inline edit ──────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editShort, setEditShort] = useState('')
  const [editSeed, setEditSeed] = useState('')
  const [editComp, setEditComp] = useState('')
  const [editErrors, setEditErrors] = useState<CompetitorFieldErrors>({})

  const [confirmRow, setConfirmRow] = useState<CompetitorRow | null>(null)
  const [rows, setRows] = useState<CompetitorRow[]>(competitors)

  if (competitors !== rows && competitors.map((c) => c.id).join() !== rows.map((c) => c.id).join()) {
    setRows(competitors)
  }

  const fieldLabel = (code: CompetitorFieldErrorCode) => t(`field_${code}`)
  const clearBanner = () => {
    setError(null)
    setErrorNames([])
  }

  function handleResult(res: { ok: boolean; error?: EventMutationError; names?: string[] }, onOk: () => void) {
    if (res.ok) {
      onOk()
      router.refresh()
      return true
    }
    setError(res.error ?? 'unknown')
    setErrorNames(res.names ?? [])
    return false
  }

  function submitAdd() {
    clearBanner()
    const values = { name: addName, shortName: addShort, seed: addSeed, composition: addComp }
    const parsed = validateCompetitorInput(values)
    if (!parsed.ok) {
      setAddErrors(parsed.errors)
      return
    }
    setAddErrors({})
    startTransition(async () => {
      const res = await createCompetitor(tournamentId, eventId, values)
      if (res.ok) {
        setAddName('')
        setAddShort('')
        setAddSeed('')
        setAddComp('')
      } else if (res.fieldErrors) {
        setAddErrors(res.fieldErrors)
      }
      handleResult(res, () => {})
    })
  }

  function submitBulk() {
    clearBanner()
    startTransition(async () => {
      const res = await bulkCreateCompetitors(tournamentId, eventId, bulkText)
      if (handleResult(res, () => {
        setBulkText('')
        setBulkOpen(false)
      })) {
        // success handled in onOk
      }
    })
  }

  function startEdit(row: CompetitorRow) {
    clearBanner()
    setEditingId(row.id)
    setEditName(row.name)
    setEditShort(row.shortName ?? '')
    setEditSeed(row.seed != null ? String(row.seed) : '')
    setEditComp(doublesCompositionToken(row.composition))
    setEditErrors({})
  }

  function submitEdit(row: CompetitorRow) {
    const values = { name: editName, shortName: editShort, seed: editSeed, composition: editComp }
    const parsed = validateCompetitorInput(values)
    if (!parsed.ok) {
      setEditErrors(parsed.errors)
      return
    }
    setEditErrors({})
    startTransition(async () => {
      const res = await updateCompetitor(tournamentId, eventId, row.id, row.updatedAt, values)
      if (res.ok) setEditingId(null)
      else if (res.fieldErrors) setEditErrors(res.fieldErrors)
      handleResult(res, () => {})
    })
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir
    if (target < 0 || target >= rows.length) return
    const next = rows.slice()
    ;[next[index], next[target]] = [next[target], next[index]]
    setRows(next)
    clearBanner()
    startTransition(async () => {
      const res = await reorderCompetitors(tournamentId, eventId, next.map((c) => c.id))
      if (!res.ok) {
        setRows(rows)
        setError(res.error)
        return
      }
      router.refresh()
    })
  }

  function onDelete(row: CompetitorRow) {
    clearBanner()
    startTransition(async () => {
      const res = await deleteCompetitor(tournamentId, eventId, row.id)
      setConfirmRow(null)
      handleResult(res, () => {})
    })
  }

  const banner =
    error && (
      <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 mb-3">
        <p className="text-[13px] text-red-600">{t(`err_${error}`)}</p>
        {errorNames.length > 0 && (
          <p className="text-[12px] text-red-500 mt-1 break-words">{errorNames.join(', ')}</p>
        )}
      </div>
    )

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="font-serif font-bold text-[16px] text-ink">
          {t('section_title')}{' '}
          <span className="text-muted font-sans font-medium text-[13px]">
            ({t('total', { count: rows.length })})
          </span>
        </h2>
        {!locked && (
          <button
            type="button"
            onClick={() => {
              clearBanner()
              setBulkOpen((v) => !v)
            }}
            className="flex-none font-semibold text-[12.5px] px-4 py-2 rounded-full bg-teal-soft text-teal border border-teal/25 hover:bg-teal hover:text-white hover:border-teal transition-all"
          >
            {t('bulk_toggle')}
          </button>
        )}
      </div>

      {banner}

      {locked && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 mb-3">
          <p className="text-[13px] text-amber-700">{t('locked_notice')}</p>
        </div>
      )}

      {/* Bulk add */}
      {!locked && bulkOpen && (
        <div className="bg-paper border border-line rounded-2xl p-4 mb-4">
          <label className="block text-[12.5px] font-semibold text-[#5c4d44] mb-1.5">{t('bulk_label')}</label>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            rows={6}
            placeholder={t('bulk_ph')}
            className="w-full text-[13.5px] px-3 py-2 rounded-lg bg-cream border border-line text-ink focus:outline-none focus:border-rose/50 resize-y"
          />
          <div className="text-[12px] text-muted mt-1.5 space-y-0.5">
            <p>{t('bulk_preview', { count: bulkPreview.unique.length })}</p>
            {bulkPreview.tooMany && <p className="text-rose">{t('bulk_too_many_preview')}</p>}
            {bulkPreview.duplicateNames.length > 0 && (
              <p className="text-rose">
                {t('bulk_dup_preview')} {bulkPreview.duplicateNames.join(', ')}
              </p>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              disabled={pending || bulkPreview.unique.length === 0 || bulkPreview.tooMany || bulkPreview.duplicateNames.length > 0}
              onClick={submitBulk}
              className="font-semibold text-[13px] px-4 py-2 rounded-full bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-50"
            >
              {pending ? t('saving') : t('bulk_submit')}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setBulkText('')
                setBulkOpen(false)
              }}
              className="font-semibold text-[12.5px] px-4 py-2 rounded-full border border-line bg-cream text-[#5c4d44] hover:bg-line/60 transition-colors disabled:opacity-60"
            >
              {t('cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Add single */}
      {!locked && !bulkOpen && (
        <div className="bg-paper border border-line rounded-2xl p-4 mb-4">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-start">
            <div className={showSeed ? 'sm:col-span-5' : 'sm:col-span-7'}>
              <input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder={t('f_name_ph')}
                className={inputCls}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitAdd()
                }}
              />
              {addErrors.name && <p className="text-[12px] text-rose mt-1">{fieldLabel(addErrors.name)}</p>}
            </div>
            <div className="sm:col-span-4">
              <input
                value={addShort}
                onChange={(e) => setAddShort(e.target.value)}
                placeholder={t('f_short_ph')}
                className={inputCls}
              />
              {addErrors.shortName && (
                <p className="text-[12px] text-rose mt-1">{fieldLabel(addErrors.shortName)}</p>
              )}
            </div>
            {showSeed && (
              <div className="sm:col-span-3">
                <input
                  value={addSeed}
                  onChange={(e) => setAddSeed(e.target.value)}
                  inputMode="numeric"
                  placeholder={t('f_seed_ph')}
                  className={inputCls}
                />
                {addErrors.seed && <p className="text-[12px] text-rose mt-1">{fieldLabel(addErrors.seed)}</p>}
              </div>
            )}
          </div>
          {showComposition && (
            <div className="mt-2">
              <label className="block text-[12px] font-semibold text-[#5c4d44] mb-1">{t('composition_label')}</label>
              <select value={addComp} onChange={(e) => setAddComp(e.target.value)} className={inputCls}>
                <option value="">{t('comp_unset')}</option>
                {DOUBLES_COMPOSITION_OPTIONS.map((tok) => (
                  <option key={tok} value={tok}>{t(`comp_${tok}`)}</option>
                ))}
              </select>
              {addErrors.composition && (
                <p className="text-[12px] text-rose mt-1">{fieldLabel(addErrors.composition)}</p>
              )}
            </div>
          )}
          <button
            type="button"
            disabled={pending}
            onClick={submitAdd}
            className="mt-2.5 font-semibold text-[13px] px-4 py-2 rounded-full bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-50"
          >
            {pending ? t('saving') : t('add_cta')}
          </button>
        </div>
      )}

      {/* Roster */}
      {rows.length === 0 ? (
        <div className="bg-cream border border-line rounded-2xl py-8 px-6 text-center">
          <p className="text-[13px] text-muted">{t('empty')}</p>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((row, i) => (
            <li
              key={row.id}
              className="bg-paper border border-line rounded-xl px-2.5 py-2 flex items-center gap-2.5 min-h-[48px]"
            >
              {!locked && (
                <div className="flex flex-col gap-0.5 flex-none">
                  <button
                    type="button"
                    disabled={pending || i === 0}
                    onClick={() => move(i, -1)}
                    aria-label={t('move_up')}
                    className="w-6 h-6 grid place-items-center rounded-md border border-line bg-cream text-[11px] text-muted hover:text-rose disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={pending || i === rows.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label={t('move_down')}
                    className="w-6 h-6 grid place-items-center rounded-md border border-line bg-cream text-[11px] text-muted hover:text-rose disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    ↓
                  </button>
                </div>
              )}

              <span className="flex-none w-6 text-center text-[12px] font-semibold text-muted">{i + 1}</span>

              {editingId === row.id ? (
                <div className="flex-1 min-w-0">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className={showSeed ? 'sm:col-span-5' : 'sm:col-span-7'}>
                      <input value={editName} onChange={(e) => setEditName(e.target.value)} className={inputCls} />
                      {editErrors.name && (
                        <p className="text-[12px] text-rose mt-1">{fieldLabel(editErrors.name)}</p>
                      )}
                    </div>
                    <div className="sm:col-span-4">
                      <input
                        value={editShort}
                        onChange={(e) => setEditShort(e.target.value)}
                        placeholder={t('f_short_ph')}
                        className={inputCls}
                      />
                    </div>
                    {showSeed && (
                      <div className="sm:col-span-3">
                        <input
                          value={editSeed}
                          onChange={(e) => setEditSeed(e.target.value)}
                          inputMode="numeric"
                          placeholder={t('f_seed_ph')}
                          className={inputCls}
                        />
                      </div>
                    )}
                  </div>
                  {showComposition && (
                    <div className="mt-2">
                      <select value={editComp} onChange={(e) => setEditComp(e.target.value)} className={inputCls}>
                        <option value="">{t('comp_unset')}</option>
                        {DOUBLES_COMPOSITION_OPTIONS.map((tok) => (
                          <option key={tok} value={tok}>{t(`comp_${tok}`)}</option>
                        ))}
                      </select>
                      {editErrors.composition && (
                        <p className="text-[12px] text-rose mt-1">{fieldLabel(editErrors.composition)}</p>
                      )}
                    </div>
                  )}
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => submitEdit(row)}
                      className="font-semibold text-[12px] px-3 py-1.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-50"
                    >
                      {t('save')}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => setEditingId(null)}
                      className="font-semibold text-[12px] px-3 py-1.5 rounded-full border border-line bg-cream text-[#5c4d44] hover:bg-line/60 transition-colors disabled:opacity-60"
                    >
                      {t('cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0 flex items-center gap-2">
                    <TruncatedName name={row.name} className="min-w-0 flex-1 text-[14px] text-ink font-medium" />
                    {row.shortName && row.shortName !== row.name && (
                      <span className="hidden sm:inline text-[12px] text-muted truncate flex-none max-w-[30%]">· {row.shortName}</span>
                    )}
                    {showComposition && doublesCompositionToken(row.composition) && (
                      <span className="flex-none text-[11px] text-teal font-medium bg-teal-soft px-1.5 py-0.5 rounded-md">
                        {t(`comp_${doublesCompositionToken(row.composition)}`)}
                      </span>
                    )}
                  </div>
                  {row.seed != null && (
                    <span className="flex-none text-[11px] font-bold text-teal bg-teal-soft px-1.5 py-0.5 rounded-md tabular-nums">
                      {t('seed_label', { seed: row.seed })}
                    </span>
                  )}
                  {!locked && (
                    <div className="flex gap-1.5 flex-none">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => startEdit(row)}
                        className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg bg-cream text-[#5c4d44] border border-line hover:border-rose/35 hover:text-rose disabled:opacity-50 transition-all"
                      >
                        {t('edit')}
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          clearBanner()
                          setConfirmRow(row)
                        }}
                        className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-500 hover:text-white hover:border-transparent disabled:opacity-50 transition-all"
                      >
                        {t('delete')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmRow !== null}
        icon="🗑️"
        tone="danger"
        title={t('confirm_delete_title')}
        description={t('confirm_delete_desc', { name: confirmRow?.name ?? '' })}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        pending={pending}
        onConfirm={() => confirmRow && onDelete(confirmRow)}
        onCancel={() => setConfirmRow(null)}
      />
    </div>
  )
}
