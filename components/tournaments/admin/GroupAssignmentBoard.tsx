'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import ConfirmDialog from './ConfirmDialog'
import RoundRobinPreviewPanel from './RoundRobinPreviewPanel'
import TruncatedName from '@/components/tournaments/public/TruncatedName'
import {
  UNASSIGNED,
  buildBoardState,
  containerOrder,
  findContainer,
  moveItem,
  toAssignmentPayload,
  type BoardState,
  type ContainerId,
} from '@/lib/tournaments/domain/group-board'
import { evaluateReadiness, type GroupStageFormat } from '@/lib/tournaments/domain/group-assignment'
import { effectiveQualifierCounts } from '@/lib/tournaments/domain/qualification'
import {
  initializeTournamentGroups,
  saveGroupAssignments,
  generateGroupMatches,
  regenerateGroupMatches,
} from '@/app/admin/giai-dau/[id]/noi-dung/actions'
import type { CompetitorRow, GroupMutationError, GroupRow } from '@/lib/tournaments/admin/types'

interface Props {
  tournamentId: string
  eventId: string
  format: GroupStageFormat
  version: number
  desiredGroupCount: number
  winnerQualifiersPerGroup: number
  consolationQualifiersPerGroup: number
  competitors: CompetitorRow[]
  groups: GroupRow[]
  memberships: Record<string, string[]>
  unassignedIds: string[]
  locked: boolean // group matches exist → assignment frozen (edit needs regenerate/reset)
  hasResults: boolean // a completed match or recorded score exists → regenerate blocked
  hasKnockout: boolean // knockout downstream exists → regenerate blocked
}

export default function GroupAssignmentBoard(props: Props) {
  const t = useTranslations('admin_group_assignment')
  const tm = useTranslations('admin_group_matches')
  const tg = useTranslations('admin_tournament_groups')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<GroupMutationError | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)

  const groupIds = useMemo(() => props.groups.map((g) => g.id), [props.groups])
  const order = useMemo(() => containerOrder(groupIds), [groupIds])

  const initialState = useMemo(
    () =>
      buildBoardState(
        props.groups.map((g) => ({ groupId: g.id, competitorIds: props.memberships[g.id] ?? [] })),
        props.unassignedIds,
      ),
    [props.groups, props.memberships, props.unassignedIds],
  )
  const [state, setState] = useState<BoardState>(initialState)
  // Re-sync when the server data changes identity (after a refresh).
  const [seed, setSeed] = useState(initialState)
  if (seed !== initialState) {
    setSeed(initialState)
    setState(initialState)
  }

  const nameOf = useMemo(() => {
    const map = new Map(props.competitors.map((c) => [c.id, c.shortName || c.name]))
    return (id: string | null) => (id ? map.get(id) ?? id : '—')
  }, [props.competitors])
  const groupNameOf = useMemo(() => {
    const map = new Map(props.groups.map((g) => [g.id, g.name]))
    return (id: string) => map.get(id) ?? id
  }, [props.groups])

  const payload = useMemo(() => toAssignmentPayload(state, groupIds), [state, groupIds])
  const readiness = useMemo(
    () =>
      evaluateReadiness(payload, {
        format: props.format,
        winnerQualifiersPerGroup: props.winnerQualifiersPerGroup,
        consolationQualifiersPerGroup: props.consolationQualifiersPerGroup,
      }),
    [payload, props.format, props.winnerQualifiersPerGroup, props.consolationQualifiersPerGroup],
  )
  const dirty = useMemo(
    () => JSON.stringify(toAssignmentPayload(state, groupIds)) !== JSON.stringify(toAssignmentPayload(seed, groupIds)),
    [state, seed, groupIds],
  )

  // Non-blocking note (group_knockout only): groups holding fewer competitors than the configured
  // Serie A + Serie B maximums still qualify by real standing — Serie A first, then Serie B — so we
  // explain the effective split rather than warning. Purely informational; never blocks a save.
  const effectiveNotes = useMemo(() => {
    if (props.format !== 'group_knockout') return []
    return payload.groups
      .filter((g) => g.competitorIds.length >= 2
        && g.competitorIds.length < props.winnerQualifiersPerGroup + props.consolationQualifiersPerGroup)
      .map((g) => {
        const { effectiveWinner, effectiveConsolation } = effectiveQualifierCounts(
          g.competitorIds.length,
          props.winnerQualifiersPerGroup,
          props.consolationQualifiersPerGroup,
        )
        return { groupId: g.groupId, size: g.competitorIds.length, a: effectiveWinner, b: effectiveConsolation }
      })
  }, [payload.groups, props.format, props.winnerQualifiersPerGroup, props.consolationQualifiersPerGroup])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const resolveContainer = (id: string): ContainerId | null =>
    id in state ? (id as ContainerId) : findContainer(state, id)

  function handleDragOver(e: DragOverEvent) {
    const { active, over } = e
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    const from = findContainer(state, activeId)
    const to = resolveContainer(overId)
    if (!from || !to || from === to) return
    setState((prev) => {
      const overItems = prev[to] ?? []
      const idx = overId in prev ? overItems.length : overItems.indexOf(overId)
      return moveItem(prev, activeId, to, idx >= 0 ? idx : overItems.length)
    })
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    const from = findContainer(state, activeId)
    const to = resolveContainer(overId)
    if (from && to && from === to && activeId !== overId) {
      const items = state[from]
      const newIndex = overId in state ? items.length - 1 : items.indexOf(overId)
      if (newIndex >= 0) setState((prev) => moveItem(prev, activeId, from, newIndex))
    }
  }

  function run(fn: () => Promise<{ ok: boolean; error?: GroupMutationError }>, onOk?: () => void) {
    setError(null)
    startTransition(async () => {
      const res = await fn()
      if (res.ok) {
        onOk?.()
        router.refresh()
      } else {
        setError(res.error ?? 'unknown')
      }
    })
  }

  const doInitialize = () =>
    run(() => initializeTournamentGroups(props.tournamentId, props.eventId, props.version))

  const doSave = () =>
    run(() => saveGroupAssignments(props.tournamentId, props.eventId, props.version, payload))

  const doGenerate = () =>
    run(() => generateGroupMatches(props.tournamentId, props.eventId, props.version))

  const doRegenerate = () =>
    run(
      () => regenerateGroupMatches(props.tournamentId, props.eventId, props.version, true),
      () => setConfirmRegen(false),
    )

  // ── Accessible move handlers (shared with drag-and-drop via the pure reducer) ───────────────
  const move = (id: string, mutate: (s: BoardState) => BoardState) => setState((prev) => mutate(prev))

  const banner = error && (
    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 mb-3" role="alert">
      <p className="text-[13px] text-red-600">{t(`err_${error}`)}</p>
    </div>
  )

  // ── State 1: no groups yet → initialize ─────────────────────────────────────────────────────
  if (props.groups.length === 0) {
    return (
      <div>
        {banner}
        <div className="bg-cream border border-line rounded-2xl py-10 px-6 text-center">
          <p className="text-[13.5px] text-ink font-medium mb-1">{tg('none_title')}</p>
          <p className="text-[12.5px] text-muted mb-4">
            {tg('none_hint', { count: props.desiredGroupCount })}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={doInitialize}
            className="font-semibold text-[13px] px-5 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-50"
          >
            {pending ? tg('working') : tg('create_cta', { count: props.desiredGroupCount })}
          </button>
        </div>
      </div>
    )
  }

  const groupCountMismatch = props.groups.length !== props.desiredGroupCount && !props.locked

  return (
    <div>
      {banner}

      {props.locked && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 mb-3">
          <p className="text-[13px] text-amber-700">{t('locked_notice')}</p>
        </div>
      )}

      {groupCountMismatch && (
        <div className="rounded-lg bg-cream border border-line px-3 py-2.5 mb-3 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[12.5px] text-muted">
            {tg('count_mismatch', { current: props.groups.length, desired: props.desiredGroupCount })}
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={doInitialize}
            className="flex-none font-semibold text-[12px] px-3 py-1.5 rounded-full border border-teal/25 bg-teal-soft text-teal hover:bg-teal hover:text-white transition-all disabled:opacity-50"
          >
            {tg('rebuild_cta')}
          </button>
        </div>
      )}

      {/* Validation summary. The "unassigned" case can carry up to 32 names, so it is a prominent
          count with the full roster tucked into an expandable panel rather than a long paragraph. */}
      {!props.locked && !readiness.ok && (() => {
        type Issue = (typeof readiness.issues)[number]
        const unassigned = readiness.issues.find(
          (x): x is Extract<Issue, { code: 'unassigned_remaining' }> => x.code === 'unassigned_remaining',
        )
        const others = readiness.issues.filter((x) => x.code !== 'unassigned_remaining')
        return (
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-3 mb-3 space-y-2.5" role="alert">
            {unassigned && (
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-md">
                  <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full bg-amber-500 text-white text-[12px] font-bold tabular-nums">
                    {unassigned.competitorIds.length}
                  </span>
                  <span className="text-[12.5px] font-semibold text-amber-800">
                    {t('unassigned_remaining_count', { count: unassigned.competitorIds.length })}
                  </span>
                  <span className="ml-auto flex-none inline-flex items-center gap-1 text-[11.5px] font-semibold text-amber-700">
                    {t('unassigned_view_list')}
                    <svg className="w-3.5 h-3.5 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </span>
                </summary>
                <p className="mt-2 pl-[32px] text-[12px] text-amber-700 break-words leading-relaxed">
                  {unassigned.competitorIds.map((id) => nameOf(id)).join(', ')}
                </p>
              </details>
            )}
            {others.length > 0 && (
              <ul className="space-y-1">
                {others.map((issue, i) => (
                  <li key={i} className="text-[12.5px] text-amber-700 flex items-start gap-1.5">
                    <span aria-hidden="true" className="flex-none mt-[3px] w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span>
                      {issue.code === 'empty_group'
                        ? t('issue_empty_group', { name: groupNameOf(issue.groupId) })
                        : issue.code === 'group_too_small'
                          ? t('issue_too_small', { name: groupNameOf(issue.groupId) })
                          : t('issue_no_groups')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })()}

      {/* Non-blocking effective-qualification note for short group_knockout groups. Neutral tone —
          this is information, not a warning: the group is valid and its qualifiers scale to reality. */}
      {!props.locked && effectiveNotes.length > 0 && (
        <div className="rounded-xl bg-cream border border-line px-3 py-3 mb-3 space-y-1.5">
          <ul className="space-y-1">
            {effectiveNotes.map((n) => (
              <li key={n.groupId} className="text-[12.5px] text-muted flex items-start gap-1.5">
                <span aria-hidden="true" className="flex-none mt-[3px] w-1.5 h-1.5 rounded-full bg-teal/60" />
                <span>{t('info_effective_split', { name: groupNameOf(n.groupId), size: n.size, a: n.a, b: n.b })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Board */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragOver={props.locked ? undefined : handleDragOver}
        onDragEnd={props.locked ? undefined : handleDragEnd}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <Column
            id={UNASSIGNED}
            title={t('unassigned_title')}
            count={state[UNASSIGNED]?.length ?? 0}
            tone="neutral"
            itemIds={state[UNASSIGNED] ?? []}
          >
            {(state[UNASSIGNED] ?? []).map((id) => (
              <Chip
                key={id}
                id={id}
                label={nameOf(id)}
                container={UNASSIGNED}
                order={order}
                locked={props.locked}
                labelFor={(c) => (c === UNASSIGNED ? t('unassigned_short') : groupNameOf(c))}
                onMoveTo={(c) => move(id, (s) => moveItem(s, id, c))}
                moveLabels={t}
              />
            ))}
          </Column>

          {props.groups.map((g) => (
            <Column
              key={g.id}
              id={g.id}
              title={t('group_col', { name: g.name })}
              count={state[g.id]?.length ?? 0}
              tone="group"
              itemIds={state[g.id] ?? []}
            >
              {(state[g.id] ?? []).map((id) => (
                <Chip
                  key={id}
                  id={id}
                  label={nameOf(id)}
                  container={g.id}
                  order={order}
                  locked={props.locked}
                  labelFor={(c) => (c === UNASSIGNED ? t('unassigned_short') : groupNameOf(c))}
                  onMoveTo={(c) => move(id, (s) => moveItem(s, id, c))}
                  moveLabels={t}
                />
              ))}
            </Column>
          ))}
        </div>
      </DndContext>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
        {!props.locked && (
          <>
            <button
              type="button"
              disabled={pending || !dirty}
              onClick={doSave}
              className="font-semibold text-[13px] px-5 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-50"
            >
              {pending ? t('saving') : t('save_cta')}
            </button>
            <button
              type="button"
              disabled={pending || !readiness.ok}
              onClick={() => setShowPreview(true)}
              className="font-semibold text-[13px] px-4 py-2.5 rounded-full border border-teal/25 bg-teal-soft text-teal hover:bg-teal hover:text-white transition-all disabled:opacity-50"
            >
              {t('preview_cta')}
            </button>
            <button
              type="button"
              disabled={pending || !readiness.ok || dirty}
              title={dirty ? t('save_first') : undefined}
              onClick={doGenerate}
              className="font-semibold text-[13px] px-5 py-2.5 rounded-full bg-teal text-white hover:opacity-90 transition-all disabled:opacity-50"
            >
              {tm('generate_cta')}
            </button>
            {dirty && <span className="text-[12px] text-muted">{t('unsaved')}</span>}
          </>
        )}

        {props.locked && (
          <button
            type="button"
            disabled={pending || props.hasResults || props.hasKnockout}
            title={
              props.hasResults ? tm('regen_blocked_results') : props.hasKnockout ? tm('regen_blocked_knockout') : undefined
            }
            onClick={() => setConfirmRegen(true)}
            className="font-semibold text-[13px] px-5 py-2.5 rounded-full border border-red-200 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white hover:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {tm('regenerate_cta')}
          </button>
        )}
      </div>
      {props.locked && (props.hasResults || props.hasKnockout) && (
        <p className="text-[12px] text-muted mt-2">
          {props.hasResults ? tm('regen_blocked_results') : tm('regen_blocked_knockout')}
        </p>
      )}

      {showPreview && (
        <RoundRobinPreviewPanel
          groups={props.groups.map((g) => ({
            groupId: g.id,
            competitors: (state[g.id] ?? []).map((id) => ({ id, name: nameOf(id) })),
          }))}
          nameOf={(id) => nameOf(id)}
          groupNameOf={groupNameOf}
          onClose={() => setShowPreview(false)}
        />
      )}

      <ConfirmDialog
        open={confirmRegen}
        icon="♻️"
        tone="warning"
        title={tm('confirm_regen_title')}
        description={tm('confirm_regen_desc')}
        confirmLabel={tm('regenerate_cta')}
        cancelLabel={t('cancel')}
        pending={pending}
        onConfirm={doRegenerate}
        onCancel={() => setConfirmRegen(false)}
      />
    </div>
  )
}

// ── Column (droppable) ─────────────────────────────────────────────────────────────────────
function Column({
  id,
  title,
  count,
  tone,
  itemIds,
  children,
}: {
  id: string
  title: string
  count: number
  tone: 'neutral' | 'group'
  itemIds: readonly string[]
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      className={`rounded-2xl border p-3 min-h-[132px] transition-colors ${
        tone === 'group' ? 'bg-paper border-line' : 'bg-cream/60 border-dashed border-line'
      } ${isOver ? 'ring-2 ring-rose/50 border-rose/40' : ''}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <span className="font-serif font-bold text-[13.5px] text-ink truncate">{title}</span>
        <span
          className={`flex-none inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded-full text-[11.5px] font-bold tabular-nums ${
            tone === 'group' ? 'bg-teal-soft text-teal' : 'bg-cream text-muted border border-line'
          }`}
        >
          {count}
        </span>
      </div>
      <div ref={setNodeRef} className="space-y-1.5 min-h-[64px]">
        <SortableContext items={itemIds as string[]} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
      </div>
    </div>
  )
}

// ── Chip (sortable item + accessible move control) ───────────────────────────────────────────
// Drag-and-drop is the primary interaction (pointer + keyboard via dnd-kit). The single "move to"
// <select> is the accessible, unambiguous alternative — it replaces the old cluster of tiny ↑ ↓ ◀ ▶
// arrow buttons (which read as noise and never said where a competitor would land).
function Chip({
  id,
  label,
  container,
  order,
  locked,
  labelFor,
  onMoveTo,
  moveLabels,
}: {
  id: string
  label: string
  container: ContainerId
  order: ContainerId[]
  locked: boolean
  labelFor: (c: ContainerId) => string
  onMoveTo: (c: ContainerId) => void
  moveLabels: (key: string, values?: Record<string, string | number>) => string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: locked,
  })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-cream border rounded-xl px-2 py-1.5 flex items-center gap-2 min-h-[40px] ${
        isDragging ? 'border-rose/50 shadow-md' : 'border-line'
      }`}
    >
      {!locked && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={moveLabels('drag_handle', { name: label })}
          className="flex-none w-7 h-7 grid place-items-center rounded-md text-muted hover:text-rose focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 cursor-grab active:cursor-grabbing touch-none"
        >
          ⠿
        </button>
      )}
      <TruncatedName name={label} className="flex-1 min-w-0 text-[13px] text-ink font-medium" />

      {!locked && (
        <label className="flex-none">
          <span className="sr-only">{moveLabels('move_to')}</span>
          <select
            value={container}
            onChange={(e) => onMoveTo(e.target.value as ContainerId)}
            aria-label={moveLabels('move_to_named', { name: label })}
            className="text-[11.5px] px-1.5 py-1 rounded-md border border-line bg-paper text-ink max-w-[104px] focus:outline-none focus:border-rose/50 focus-visible:ring-2 focus-visible:ring-rose/40"
          >
            {order.map((c) => (
              <option key={c} value={c}>
                {labelFor(c)}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
