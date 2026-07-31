'use client'

// The admin RULE workspace (Prompt 15C-1) — the "Luật thi đấu" tab body for one event. Shared by the
// Site-Admin mount and the scoped /quan-ly-giai-dau mount (same component → same behaviour). It:
//   • shows the current snapshot (or an empty state offering: default rules / a preset / custom);
//   • lets an admin pick a preset + category, PREVIEW it, and apply it (with the handicap warning);
//   • edits an existing snapshot with optimistic concurrency + a version-conflict banner;
//   • enforces the conservative safety guard (locked / needs-schedule-reset) in the UI — the server
//     re-checks everything. Hiding a control is convenience only, never the security boundary.
//
// This is a Client Component: it imports the pure rule engine (types + validators) and the
// 'use server' rule actions ONLY — never the service-role client or any server-only query module.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import TieBreakOrderEditor from './TieBreakOrderEditor'
import ConfirmDialog from './ConfirmDialog'
import RuleChangeImpactModal from './RuleChangeImpactModal'
import {
  buildRuleSetFromEditorFields,
  ruleSetToEditorFields,
  validateTournamentRules,
  unsupportedTieBreakTokens,
  type RuleEditorFields,
  type MatchRuleFields,
  type RuleSet,
  type RulePresetPickerOption,
  type RuleMutationResult,
  type RuleSnapshotView,
  type RuleChangeImpactPreview,
} from '@/lib/tournaments/rules'
import {
  applyRulePresetAction,
  createCustomRuleSnapshotAction,
  updateRuleSnapshotAction,
  resetRuleSnapshotToPresetAction,
  deleteRuleSnapshotAction,
  previewEventRuleChangeImpactAction,
  applyRuleChangeWithResetAction,
} from '@/app/admin/giai-dau/[id]/noi-dung/rule-actions'

export type RuleGuardCode = 'event_rules_locked' | 'event_requires_schedule_reset' | null

export interface RuleWorkspaceProps {
  tournamentId: string
  eventId: string
  canManage: boolean
  guard: RuleGuardCode
  snapshot: RuleSnapshotView | null
  presets: RulePresetPickerOption[]
}

// A sensible default rule set (touch-21 group, knockout touch-21 win-by-2 cap 31, handicap off).
// Offered as the "use current default rules" empty-state choice — it makes the legacy scoring
// explicit as a custom snapshot without inventing any handicap numbers.
const DEFAULT_FIELDS: RuleEditorFields = {
  group: {
    games_to_win: 1,
    max_games: 1,
    points_to_win: 21,
    win_by: 1,
    points_cap: null,
    allow_tied_game: false,
    win_table_points: 1,
    loss_table_points: 0,
    tie_break_order: ['table_points', 'point_difference', 'points_for'],
  },
  knockout: { games_to_win: 1, max_games: 1, points_to_win: 21, win_by: 2, points_cap: 31, allow_tied_game: false },
  handicap: { enabled: false },
}

type Mode = 'view' | 'pick' | 'custom' | 'edit' | 'change'

export default function RuleWorkspace({
  tournamentId,
  eventId,
  canManage,
  guard,
  snapshot,
  presets,
}: RuleWorkspaceProps) {
  const t = useTranslations('admin_event_rules')
  const router = useRouter()
  const [current, setCurrent] = useState<RuleSnapshotView | null>(snapshot)
  const [mode, setMode] = useState<Mode>(snapshot ? 'view' : 'pick')
  const [conflict, setConflict] = useState(false)
  const [dialog, setDialog] = useState<'reset' | 'delete' | null>(null)
  const [actionPending, setActionPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  // Controlled rule-change flow (Prompt 15D-2): the preview + the fields it was built from, held while
  // the impact modal is open. Cleared on close / apply.
  const [changePreview, setChangePreview] = useState<RuleChangeImpactPreview | null>(null)
  const [changeFields, setChangeFields] = useState<RuleEditorFields | null>(null)
  const [changeAck, setChangeAck] = useState(false)
  const [changePreviewing, setChangePreviewing] = useState(false)

  const locked = guard === 'event_rules_locked'
  const needsReset = guard === 'event_requires_schedule_reset'
  const editingDisabled = !canManage || locked || needsReset
  // Reset is only meaningful for a snapshot that came from a preset (a custom snapshot has nowhere to
  // reset to). Delete is offered whenever the event is still freely editable (guard ok).
  const canReset = !!current && current.source === 'preset' && !!current.presetKey
  const canDelete = !!current

  // §9 — adopt fresh server truth ONLY after a version conflict (i.e. the user clicked "reload"): when
  // the incoming server snapshot's version differs from what we hold, drop the stale draft and show the
  // authoritative rules. Guarded by `conflict` so an unrelated refresh never discards an in-flight edit.
  useEffect(() => {
    if (!conflict) return
    if (snapshot && (!current || snapshot.version !== current.version)) {
      setCurrent(snapshot)
      setMode('view')
      setConflict(false)
    }
  }, [conflict, snapshot, current])

  function onSaved(next: RuleSnapshotView) {
    setCurrent(next)
    setMode('view')
    setConflict(false)
  }

  async function doReset() {
    if (!current || actionPending) return
    setActionPending(true)
    setActionError(null)
    // The confirm dialog IS the acknowledgment; resetting to a still-pending preset re-writes a
    // requires_configuration snapshot, which the server audits as an acknowledgment.
    const res = await resetRuleSnapshotToPresetAction({
      tournamentId,
      eventId,
      snapshotId: current.id,
      expectedVersion: current.version,
      acknowledgeWarning: true,
    })
    setActionPending(false)
    if (res.ok) {
      setCurrent(res.snapshot)
      setDialog(null)
      setConflict(false)
      return
    }
    setDialog(null)
    if (res.error === 'version_conflict') setConflict(true)
    else setActionError(t(`error_${res.error}`))
  }

  async function doDelete() {
    if (!current || actionPending) return
    setActionPending(true)
    setActionError(null)
    const res = await deleteRuleSnapshotAction({
      tournamentId,
      eventId,
      snapshotId: current.id,
      expectedVersion: current.version,
    })
    setActionPending(false)
    if (res.ok) {
      setCurrent(null)
      setMode('pick')
      setDialog(null)
      setConflict(false)
      return
    }
    setDialog(null)
    if (res.error === 'version_conflict') setConflict(true)
    else setActionError(t(`error_${res.error}`))
  }

  // Controlled change: run the READ-ONLY impact preview, then open the reset/regenerate modal.
  async function doPreviewChange(fields: RuleEditorFields, ack: boolean) {
    if (changePreviewing) return
    setChangePreviewing(true)
    setActionError(null)
    const res = await previewEventRuleChangeImpactAction(tournamentId, eventId, fields)
    setChangePreviewing(false)
    if (res.ok) {
      setChangeFields(fields)
      setChangeAck(ack)
      setChangePreview(res.preview)
      return
    }
    setActionError(t(`error_${res.error}`))
  }

  function closeChange() {
    setChangePreview(null)
    setChangeFields(null)
    setChangeAck(false)
  }

  return (
    <section aria-labelledby="rules-heading">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h2 id="rules-heading" className="font-serif font-bold text-[18px] text-ink">
            {t('heading')}
          </h2>
          <p className="text-[12.5px] text-muted mt-0.5 max-w-prose">{t('intro')}</p>
        </div>
        {current && canManage && mode === 'view' && !editingDisabled && (
          <div className="flex-none flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setConflict(false)
                setActionError(null)
                setMode('edit')
              }}
              className="font-semibold text-[13px] px-4 py-2 rounded-full bg-teal-soft text-teal border border-teal/25 hover:bg-teal hover:text-white hover:border-teal transition-all"
            >
              {t('edit_rules')}
            </button>
            {canReset && (
              <button
                type="button"
                onClick={() => {
                  setActionError(null)
                  setDialog('reset')
                }}
                className="font-semibold text-[13px] px-4 py-2 rounded-full border border-line text-muted hover:text-ink hover:border-ink/30 transition-colors"
              >
                {t('reset_to_preset')}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={() => {
                  setActionError(null)
                  setDialog('delete')
                }}
                className="font-semibold text-[13px] px-4 py-2 rounded-full border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
              >
                {t('delete_snapshot')}
              </button>
            )}
          </div>
        )}
      </div>

      {conflict && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900 flex items-start gap-2 flex-wrap"
        >
          <WarnIcon />
          <span className="flex-1 min-w-[12rem]">{t('version_conflict')}</span>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="flex-none font-semibold text-[12px] px-3 py-1.5 rounded-full border border-amber-400 text-amber-900 hover:bg-amber-100 transition-colors"
          >
            {t('reload_snapshot')}
          </button>
        </div>
      )}

      {actionError && (
        <p role="alert" className="mb-4 text-[12.5px] text-rose">
          {actionError}
        </p>
      )}

      {(locked || needsReset) && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-line bg-cream/70 px-4 py-3 text-[12.5px] text-ink flex items-start gap-2 flex-wrap"
        >
          <WarnIcon />
          <span className="min-w-0 flex-1">{locked ? t('guard_locked') : t('guard_requires_reset')}</span>
          {canManage && current && mode !== 'change' && (
            <button
              type="button"
              onClick={() => {
                setConflict(false)
                setActionError(null)
                setMode('change')
              }}
              className="flex-none font-semibold text-[12.5px] px-3.5 py-1.5 rounded-full border border-rose/40 text-rose bg-rose/5 hover:bg-rose hover:text-white transition-colors"
            >
              {t('controlled_change')}
            </button>
          )}
        </div>
      )}

      {!canManage && (
        <p className="mb-4 rounded-xl border border-line bg-cream/60 px-4 py-3 text-[12.5px] text-muted">
          {t('readonly_notice')}
        </p>
      )}

      {/* Current snapshot summary (view mode) */}
      {current && mode === 'view' && <SnapshotSummary snapshot={current} />}

      {/* Empty state: no snapshot yet → three explicit choices (never auto-created). */}
      {!current && mode === 'pick' && (
        <EmptyStateChoices
          canManage={canManage}
          disabled={editingDisabled}
          onDefault={() => setMode('custom')}
          onCustom={() => setMode('custom')}
          presetsAvailable={presets.length > 0}
        />
      )}

      {/* Preset picker (empty-state or re-pick). Only when there are presets and the user may manage. */}
      {canManage && !editingDisabled && (mode === 'pick' || (mode === 'view' && current)) && presets.length > 0 && (
        <PresetPicker
          tournamentId={tournamentId}
          eventId={eventId}
          presets={presets}
          onApplied={onSaved}
          onConflict={() => setConflict(true)}
        />
      )}

      {/* Custom / default editor (create) */}
      {canManage && !editingDisabled && mode === 'custom' && !current && (
        <RuleEditorForm
          heading={t('custom_heading')}
          submitLabel={t('create_custom')}
          initial={DEFAULT_FIELDS}
          onCancel={() => setMode('pick')}
          onSubmit={(fields) =>
            createCustomRuleSnapshotAction({ tournamentId, eventId, fields })
          }
          onSaved={onSaved}
          onConflict={() => setConflict(true)}
        />
      )}

      {/* Edit existing snapshot */}
      {canManage && !editingDisabled && mode === 'edit' && current && (
        <RuleEditorForm
          heading={t('edit_heading')}
          submitLabel={t('save_changes')}
          initial={ruleSetToEditorFields(current.rules)}
          baseRules={current.rules}
          onCancel={() => setMode('view')}
          onSubmit={(fields, ack) =>
            updateRuleSnapshotAction({
              tournamentId,
              eventId,
              snapshotId: current.id,
              expectedVersion: current.version,
              fields,
              acknowledgeWarning: ack,
            })
          }
          onSaved={onSaved}
          onConflict={() => setConflict(true)}
        />
      )}

      {/* Controlled rule change (Prompt 15D-2): available even when the guard blocks a plain edit. The
          editor validates; "Xem tác động" runs the impact preview → the reset/regenerate modal. */}
      {canManage && mode === 'change' && current && (
        <RuleEditorForm
          heading={t('change_heading')}
          submitLabel={t('preview_impact')}
          previewLabel={t('preview_impact')}
          mode="change"
          initial={ruleSetToEditorFields(current.rules)}
          baseRules={current.rules}
          onCancel={() => setMode('view')}
          onSubmit={async () => ({ ok: false, error: 'unknown' }) as RuleMutationResult}
          onPreview={doPreviewChange}
          onSaved={onSaved}
          onConflict={() => setConflict(true)}
        />
      )}

      <RuleChangeImpactModal
        open={changePreview !== null}
        preview={changePreview}
        tournamentId={tournamentId}
        eventId={eventId}
        fields={changeFields}
        acknowledgeWarning={changeAck}
        apply={applyRuleChangeWithResetAction}
        onApplied={() => {
          closeChange()
          setMode('view')
          setConflict(false)
          router.refresh()
        }}
        onClose={closeChange}
      />

      <ConfirmDialog
        open={dialog === 'reset'}
        icon="↺"
        tone="warning"
        title={t('reset_confirm_title')}
        description={
          current?.requiresConfiguration
            ? t('reset_confirm_body_pending')
            : t('reset_confirm_body')
        }
        confirmLabel={t('reset_to_preset')}
        cancelLabel={t('cancel')}
        onConfirm={doReset}
        onCancel={() => setDialog(null)}
        pending={actionPending}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        icon="🗑"
        tone="danger"
        title={t('delete_confirm_title')}
        description={t('delete_confirm_body')}
        confirmLabel={t('delete_snapshot')}
        cancelLabel={t('cancel')}
        onConfirm={doDelete}
        onCancel={() => setDialog(null)}
        pending={actionPending}
      />
    </section>
  )
}

// ── Warning icon ──────────────────────────────────────────────────────────────────────────────
function WarnIcon() {
  return (
    <svg className="w-4 h-4 flex-none mt-0.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  )
}

// ── Empty-state choices (§6) ──────────────────────────────────────────────────────────────────
function EmptyStateChoices({
  canManage,
  disabled,
  onDefault,
  onCustom,
  presetsAvailable,
}: {
  canManage: boolean
  disabled: boolean
  onDefault: () => void
  onCustom: () => void
  presetsAvailable: boolean
}) {
  const t = useTranslations('admin_event_rules')
  return (
    <div className="rounded-xl border border-line bg-cream/50 px-4 py-4">
      <p className="text-[13px] font-semibold text-ink mb-1">{t('empty_title')}</p>
      <p className="text-[12.5px] text-muted mb-3">{t('empty_body')}</p>
      {canManage && !disabled ? (
        <ul className="grid gap-2 sm:grid-cols-3">
          <li>
            <button
              type="button"
              onClick={onDefault}
              className="w-full text-left rounded-lg border border-line bg-paper px-3 py-2.5 hover:border-rose/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
            >
              <span className="block text-[13px] font-semibold text-ink">{t('choice_default')}</span>
              <span className="block text-[11.5px] text-muted mt-0.5">{t('choice_default_hint')}</span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={() => {
                document.getElementById('preset-picker')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                document.getElementById('preset-select')?.focus()
              }}
              disabled={!presetsAvailable}
              className="w-full text-left rounded-lg border border-line bg-paper px-3 py-2.5 hover:border-rose/40 transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
            >
              <span className="block text-[13px] font-semibold text-ink">{t('choice_preset')}</span>
              <span className="block text-[11.5px] text-muted mt-0.5">
                {presetsAvailable ? t('choice_preset_hint') : t('choice_preset_none')}
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              onClick={onCustom}
              className="w-full text-left rounded-lg border border-line bg-paper px-3 py-2.5 hover:border-rose/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
            >
              <span className="block text-[13px] font-semibold text-ink">{t('choice_custom')}</span>
              <span className="block text-[11.5px] text-muted mt-0.5">{t('choice_custom_hint')}</span>
            </button>
          </li>
        </ul>
      ) : (
        <p className="text-[12.5px] text-muted">{t('empty_readonly')}</p>
      )}
    </div>
  )
}

// ── Snapshot summary (view) ───────────────────────────────────────────────────────────────────
function SnapshotSummary({ snapshot }: { snapshot: RuleSnapshotView }) {
  const ts = useTranslations('admin_rule_snapshot')
  const tp = useTranslations('admin_rule_presets')
  return (
    <div className="rounded-xl border border-line bg-paper px-4 py-4">
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">{ts('current_source')}</span>
        <span className="text-[12px] font-semibold text-ink">{ts(`source_${snapshot.source}`)}</span>
        {snapshot.category && (
          <span className="text-[11.5px] rounded-full bg-cream px-2 py-0.5 text-ink">
            {categoryLabel(tp, snapshot.category)}
          </span>
        )}
        {snapshot.requiresConfiguration && (
          <span className="inline-flex items-center gap-1 text-[11.5px] rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
            <WarnIcon />
            {ts('needs_config_badge')}
          </span>
        )}
        <span className="text-[11px] text-muted ml-auto">{ts('snapshot_version', { n: snapshot.snapshotVersion })}</span>
      </div>
      <RulePreview rules={snapshot.rules} />
    </div>
  )
}

// ── Preset picker + preview (§7, §8, §9, §15) ─────────────────────────────────────────────────
function PresetPicker({
  tournamentId,
  eventId,
  presets,
  onApplied,
  onConflict,
}: {
  tournamentId: string
  eventId: string
  presets: RulePresetPickerOption[]
  onApplied: (s: RuleSnapshotView) => void
  onConflict: () => void
}) {
  const t = useTranslations('admin_event_rules')
  const tp = useTranslations('admin_rule_presets')
  const tw = useTranslations('admin_handicap_warning')

  const [presetKey, setPresetKey] = useState(presets[0]?.presetKey ?? '')
  const preset = presets.find((p) => p.presetKey === presetKey) ?? presets[0]
  const [category, setCategory] = useState(preset?.variants[0]?.category ?? '')
  const variant = preset?.variants.find((v) => v.category === category) ?? preset?.variants[0]

  const [ack, setAck] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requiresConfig = !!variant && requiresConfiguration(variant.rules)

  async function apply() {
    if (!preset || !variant || pending) return
    if (requiresConfig && !ack) return
    setPending(true)
    setError(null)
    const res = await applyRulePresetAction({
      tournamentId,
      eventId,
      presetKey: preset.presetKey,
      presetVersion: preset.version,
      category: variant.category,
      acknowledgeWarning: ack,
    })
    setPending(false)
    handleResult(res, onApplied, onConflict, setError, t)
  }

  if (!preset) return null

  return (
    <div id="preset-picker" className="mt-4 rounded-xl border border-line bg-paper px-4 py-4">
      <h3 className="font-serif font-bold text-[15px] text-ink mb-3">{tp('picker_heading')}</h3>

      <div className="grid gap-3 sm:grid-cols-2 mb-3">
        <div>
          <label htmlFor="preset-select" className="block text-[12px] font-medium text-ink mb-1">
            {tp('preset_label')}
          </label>
          <select
            id="preset-select"
            value={presetKey}
            onChange={(e) => {
              const next = presets.find((p) => p.presetKey === e.target.value)
              setPresetKey(e.target.value)
              setCategory(next?.variants[0]?.category ?? '')
              setAck(false)
            }}
            className="w-full text-[13px] rounded-md border border-line bg-paper px-2.5 py-2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
          >
            {presets.map((p) => (
              <option key={`${p.presetKey}@${p.version}`} value={p.presetKey}>
                {p.label} · v{p.version}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted mt-1">{tp('not_default_note')}</p>
        </div>
        <div>
          <label htmlFor="category-select" className="block text-[12px] font-medium text-ink mb-1">
            {tp('category_label')}
          </label>
          <select
            id="category-select"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value)
              setAck(false)
            }}
            className="w-full text-[13px] rounded-md border border-line bg-paper px-2.5 py-2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
          >
            {preset.variants.map((v) => (
              <option key={v.category} value={v.category}>
                {categoryLabel(tp, v.category)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {variant && (
        <div className="rounded-lg border border-line bg-cream/50 px-3 py-3 mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-2">{tp('preview_heading')}</p>
          <RulePreview rules={variant.rules} />
        </div>
      )}

      {requiresConfig && (
        <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 mb-3">
          <p className="flex items-start gap-2 text-[12.5px] font-semibold text-amber-900">
            <WarnIcon />
            {tw('title')}
          </p>
          <ul className="mt-1.5 ml-6 list-disc space-y-0.5 text-[12px] text-amber-900">
            <li>{tw('line_incomplete')}</li>
            <li>{tw('line_needs_organizer')}</li>
            <li>{tw('line_no_runtime')}</li>
            <li>{tw('line_requires_config_flag')}</li>
          </ul>
          <label className="mt-2 flex items-center gap-2 text-[12.5px] text-amber-900">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="accent-amber-600" />
            {tw('acknowledge')}
          </label>
        </div>
      )}

      {error && (
        <p role="alert" className="text-[12px] text-rose mb-2">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={apply}
        disabled={pending || (requiresConfig && !ack)}
        className="font-semibold text-[13px] px-5 py-2.5 rounded-full bg-rose text-white hover:bg-rose/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
      >
        {pending ? t('applying') : t('apply_preset')}
      </button>
    </div>
  )
}

// ── Rule editor form (custom-create + edit) ───────────────────────────────────────────────────
function RuleEditorForm({
  heading,
  submitLabel,
  initial,
  baseRules,
  onCancel,
  onSubmit,
  onSaved,
  onConflict,
  mode = 'save',
  onPreview,
  previewLabel,
}: {
  heading: string
  submitLabel: string
  initial: RuleEditorFields
  baseRules?: RuleSet
  onCancel: () => void
  onSubmit: (fields: RuleEditorFields, acknowledgeWarning: boolean) => Promise<RuleMutationResult>
  onSaved: (s: RuleSnapshotView) => void
  onConflict: () => void
  // Controlled rule-change mode (Prompt 15D-2): instead of committing, hand the validated fields to
  // onPreview so the parent can run the impact preview → reset/regenerate modal. No commit happens here.
  mode?: 'save' | 'change'
  onPreview?: (fields: RuleEditorFields, acknowledgeWarning: boolean) => void
  previewLabel?: string
}) {
  const t = useTranslations('admin_event_rules')
  const te = useTranslations('admin_rule_editor')
  const tw = useTranslations('admin_handicap_warning')

  const [fields, setFields] = useState<RuleEditorFields>(initial)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ack, setAck] = useState(false)
  const [errorPaths, setErrorPaths] = useState<Set<string>>(new Set())
  const formRef = useRef<HTMLFormElement>(null)

  const rules = useMemo(() => buildRuleSetFromEditorFields(fields, baseRules ?? null), [fields, baseRules])
  const validation = useMemo(() => validateTournamentRules(rules), [rules])
  const manualTokens = unsupportedTieBreakTokens(fields.group.tie_break_order)
  const willRequireConfig = requiresConfiguration(rules)

  function setGroup(patch: Partial<RuleEditorFields['group']>) {
    setFields((f) => ({ ...f, group: { ...f.group, ...patch } }))
  }
  function setKnockout(patch: Partial<MatchRuleFields>) {
    setFields((f) => ({ ...f, knockout: { ...f.knockout, ...patch } }))
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (pending) return
    if (!validation.ok) {
      const paths = new Set(validation.issues.map((i) => i.path))
      setErrorPaths(paths)
      const first = validation.issues[0]?.path
      if (first) formRef.current?.querySelector<HTMLElement>(`[data-path="${cssEscape(first)}"]`)?.focus()
      return
    }
    if (willRequireConfig && !ack) return
    setErrorPaths(new Set())
    // Controlled-change mode: don't commit — hand off to the impact-preview flow.
    if (mode === 'change' && onPreview) {
      onPreview(fields, ack)
      return
    }
    setPending(true)
    setError(null)
    const res = await onSubmit(fields, ack)
    setPending(false)
    if (!res.ok && res.error === 'validation_failed' && res.issues) {
      setErrorPaths(new Set(res.issues.map((i) => i.path)))
    }
    handleResult(res, onSaved, onConflict, setError, t)
  }

  return (
    <form ref={formRef} onSubmit={submit} className="mt-4 rounded-xl border border-line bg-paper px-4 py-4" noValidate>
      <h3 className="font-serif font-bold text-[15px] text-ink mb-3">{heading}</h3>

      <Fieldset legend={te('group_legend')} hint={te('group_hint')}>
        <MatchFields prefix="group" fields={fields.group} errorPaths={errorPaths} onChange={setGroup} disabled={pending} />
        <div className="grid gap-3 sm:grid-cols-2 mt-3">
          <NumberField
            path="group.win_table_points"
            label={te('win_table_points')}
            hint={te('win_table_points_hint')}
            value={fields.group.win_table_points}
            onChange={(n) => setGroup({ win_table_points: n })}
            invalid={hasPath(errorPaths, 'group.win_table_points')}
            disabled={pending}
          />
          <NumberField
            path="group.loss_table_points"
            label={te('loss_table_points')}
            value={fields.group.loss_table_points}
            onChange={(n) => setGroup({ loss_table_points: n })}
            invalid={hasPath(errorPaths, 'group.win_table_points')}
            disabled={pending}
          />
        </div>
        <div className="mt-3">
          <p className="text-[12px] font-medium text-ink mb-1.5" data-path="group.tie_break_order">
            {te('tie_break_order')}
          </p>
          <p className="text-[11.5px] text-muted mb-2">{te('tie_break_order_hint')}</p>
          <TieBreakOrderEditor
            value={fields.group.tie_break_order}
            onChange={(next) => setGroup({ tie_break_order: next })}
            disabled={pending}
            invalid={Array.from(errorPaths).some((p) => p.startsWith('group.tie_break_order'))}
          />
          {manualTokens.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-[11.5px] text-amber-700" role="note">
              <WarnIcon />
              {te('tie_manual_warning')}
            </p>
          )}
        </div>
      </Fieldset>

      <Fieldset legend={te('knockout_legend')} hint={te('knockout_hint')}>
        <MatchFields prefix="knockout" fields={fields.knockout} errorPaths={errorPaths} onChange={setKnockout} disabled={pending} />
      </Fieldset>

      <Fieldset legend={te('handicap_legend')} hint={te('handicap_hint')}>
        <label className="flex items-center gap-2 text-[13px] text-ink">
          <input
            type="checkbox"
            checked={fields.handicap.enabled}
            onChange={(e) => setFields((f) => ({ ...f, handicap: { enabled: e.target.checked } }))}
            disabled={pending}
            className="accent-rose"
          />
          {te('handicap_enabled')}
        </label>
        {willRequireConfig && (
          <div role="alert" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
            <p className="text-[12px] text-amber-900">{tw('line_incomplete')}</p>
            <label className="mt-1.5 flex items-center gap-2 text-[12.5px] text-amber-900">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="accent-amber-600" />
              {tw('acknowledge')}
            </label>
          </div>
        )}
      </Fieldset>

      {!validation.ok && errorPaths.size > 0 && (
        <p role="alert" className="text-[12px] text-rose mb-2">
          {t('fix_errors')}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[12px] text-rose mb-2">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || (willRequireConfig && !ack)}
          className="font-semibold text-[13px] px-5 py-2.5 rounded-full bg-rose text-white hover:bg-rose/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
        >
          {pending ? t('saving') : mode === 'change' ? previewLabel ?? submitLabel : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="font-semibold text-[13px] px-4 py-2.5 rounded-full border border-line text-muted hover:text-ink transition-colors"
        >
          {t('cancel')}
        </button>
      </div>
    </form>
  )
}

// ── Match-rule fieldset (shared group + knockout) ─────────────────────────────────────────────
function MatchFields({
  prefix,
  fields,
  errorPaths,
  onChange,
  disabled,
}: {
  prefix: 'group' | 'knockout'
  fields: MatchRuleFields
  errorPaths: Set<string>
  onChange: (patch: Partial<MatchRuleFields>) => void
  disabled: boolean
}) {
  const te = useTranslations('admin_rule_editor')
  const capEnabled = fields.points_cap !== null
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <NumberField
        path={`${prefix}.match.points_to_win`}
        label={te('points_to_win')}
        hint={te('points_to_win_hint')}
        value={fields.points_to_win}
        onChange={(n) => onChange({ points_to_win: n })}
        invalid={hasPath(errorPaths, `${prefix}.match.points_to_win`)}
        disabled={disabled}
      />
      <NumberField
        path={`${prefix}.match.win_by`}
        label={te('win_by')}
        hint={te('win_by_hint')}
        value={fields.win_by}
        onChange={(n) => onChange({ win_by: n })}
        invalid={hasPath(errorPaths, `${prefix}.match.win_by`)}
        disabled={disabled}
      />
      <NumberField
        path={`${prefix}.match.games_to_win`}
        label={te('games_to_win')}
        hint={te('games_to_win_hint')}
        value={fields.games_to_win}
        onChange={(n) => onChange({ games_to_win: n })}
        invalid={hasPath(errorPaths, `${prefix}.match.games_to_win`)}
        disabled={disabled}
      />
      <NumberField
        path={`${prefix}.match.max_games`}
        label={te('max_games')}
        hint={te('max_games_hint')}
        value={fields.max_games}
        onChange={(n) => onChange({ max_games: n })}
        invalid={hasPath(errorPaths, `${prefix}.match.max_games`)}
        disabled={disabled}
      />
      <div>
        <span className="block text-[12px] font-medium text-ink mb-1">{te('points_cap')}</span>
        <label className="flex items-center gap-2 text-[12.5px] text-muted mb-1.5">
          <input
            type="checkbox"
            checked={capEnabled}
            onChange={(e) => onChange({ points_cap: e.target.checked ? Math.max(fields.points_to_win, fields.points_to_win + 10) : null })}
            disabled={disabled}
            className="accent-rose"
          />
          {te('points_cap_enable')}
        </label>
        {capEnabled && (
          <input
            type="number"
            inputMode="numeric"
            data-path={`${prefix}.match.points_cap`}
            value={fields.points_cap ?? ''}
            onChange={(e) => onChange({ points_cap: e.target.value === '' ? null : Number(e.target.value) })}
            disabled={disabled}
            className={`w-full text-[13px] rounded-md border bg-paper px-2.5 py-2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 ${
              hasPath(errorPaths, `${prefix}.match.points_cap`) ? 'border-rose' : 'border-line'
            }`}
          />
        )}
        <p className="text-[11px] text-muted mt-1">{te('points_cap_hint')}</p>
      </div>
      <label className="flex items-center gap-2 text-[12.5px] text-ink self-end pb-1">
        <input
          type="checkbox"
          checked={fields.allow_tied_game}
          onChange={(e) => onChange({ allow_tied_game: e.target.checked })}
          disabled={disabled}
          className="accent-rose"
        />
        {te('allow_tied_game')}
      </label>
    </div>
  )
}

// ── Small presentational helpers ──────────────────────────────────────────────────────────────
function Fieldset({ legend, hint, children }: { legend: string; hint?: string; children: React.ReactNode }) {
  return (
    <fieldset className="mb-4 border-t border-line pt-3">
      <legend className="text-[13px] font-semibold text-ink px-0">{legend}</legend>
      {hint && <p className="text-[11.5px] text-muted mb-2">{hint}</p>}
      {children}
    </fieldset>
  )
}

function NumberField({
  path,
  label,
  hint,
  value,
  onChange,
  invalid,
  disabled,
}: {
  path: string
  label: string
  hint?: string
  value: number
  onChange: (n: number) => void
  invalid?: boolean
  disabled?: boolean
}) {
  return (
    <div>
      <label htmlFor={`rf-${path}`} className="block text-[12px] font-medium text-ink mb-1">
        {label}
      </label>
      <input
        id={`rf-${path}`}
        data-path={path}
        type="number"
        inputMode="numeric"
        value={Number.isFinite(value) ? value : ''}
        onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        className={`w-full text-[13px] rounded-md border bg-paper px-2.5 py-2 text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 ${
          invalid ? 'border-rose' : 'border-line'
        }`}
      />
      {hint && <p className="text-[11px] text-muted mt-1">{hint}</p>}
    </div>
  )
}

// A pure, presentational rule PREVIEW (§8). No JSON — human labels only.
function RulePreview({ rules }: { rules: RuleSet }) {
  const t = useTranslations('admin_rule_presets')
  const te = useTranslations('admin_rule_editor')
  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-line/50 last:border-b-0">
      <span className="text-[12px] text-muted">{label}</span>
      <span className="text-[12.5px] font-medium text-ink text-right">{value}</span>
    </div>
  )
  const cap = (c: number | null) => (c === null ? t('no_cap') : String(c))
  return (
    <div className="grid gap-x-6 sm:grid-cols-2">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1">{t('preview_group')}</p>
        {row(te('points_to_win'), rules.group.match.points_to_win)}
        {row(te('win_by'), rules.group.match.win_by)}
        {row(te('points_cap'), cap(rules.group.match.points_cap))}
        {row(te('win_table_points'), rules.group.win_table_points)}
        {row(te('loss_table_points'), rules.group.loss_table_points)}
        {row(
          te('tie_break_order'),
          <span className="text-[11.5px]">
            {rules.group.tie_break_order.map((tok) => te(`tie_token_${tok}`)).join(' → ')}
          </span>,
        )}
      </div>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted mb-1 mt-3 sm:mt-0">
          {t('preview_knockout')}
        </p>
        {row(te('points_to_win'), rules.knockout.match.points_to_win)}
        {row(te('win_by'), rules.knockout.match.win_by)}
        {row(te('points_cap'), cap(rules.knockout.match.points_cap))}
        {row(
          t('preview_handicap'),
          rules.handicap.enabled
            ? rules.handicap.requires_configuration
              ? t('handicap_pending')
              : t('handicap_on')
            : t('handicap_off'),
        )}
      </div>
    </div>
  )
}

// ── local utilities ───────────────────────────────────────────────────────────────────────────
function hasPath(paths: Set<string>, path: string): boolean {
  return paths.has(path)
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, '\\$&')
}

function categoryLabel(tp: ReturnType<typeof useTranslations>, category: string): string {
  const known = ['beginner', 'standard']
  return known.includes(category) ? tp(`category_${category}`) : category
}

// Local mirror of the pure engine's requiresConfiguration (a handicap that is enabled but pending or
// entry-less). Kept inline so the preview/gate work without importing a server module.
function requiresConfiguration(rules: RuleSet): boolean {
  const h = rules.handicap
  return h.enabled && (h.requires_configuration || h.entries.length === 0)
}

// Map a rule mutation result to the UI: success → onSaved; version_conflict → onConflict; else set a
// localized error message. Keeps every action call-site consistent.
function handleResult(
  res: RuleMutationResult,
  onSaved: (s: RuleSnapshotView) => void,
  onConflict: () => void,
  setError: (m: string | null) => void,
  t: ReturnType<typeof useTranslations>,
) {
  if (res.ok) {
    onSaved(res.snapshot)
    return
  }
  if (res.error === 'version_conflict') {
    onConflict()
    return
  }
  setError(t(`error_${res.error}`))
}
