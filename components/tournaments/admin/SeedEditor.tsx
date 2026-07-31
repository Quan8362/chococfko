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
import KnockoutPreviewPanel from './KnockoutPreviewPanel'
import {
  UNASSIGNED,
  buildBoardState,
  findContainer,
  moveItem,
  shiftContainer,
  nudgeWithin,
  type BoardState,
  type ContainerId,
} from '@/lib/tournaments/domain/group-board'
import { evaluateSeedReadiness } from '@/lib/tournaments/domain/knockout-seed'
import {
  saveKnockoutSeeds,
  clearKnockoutSeeds,
  generateKnockoutBracket,
  resetKnockoutBracket,
} from '@/app/admin/giai-dau/[id]/noi-dung/actions'
import type { CompetitorRow, KnockoutMutationError } from '@/lib/tournaments/admin/types'

// The seed editor reuses the pure group-board reducer with exactly TWO containers: the unassigned
// pool and a single ordered "seeds" list. Drag == keyboard == fallback buttons all funnel through
// the same reducer, so the SAVE payload (seed slot order = the seeds array order) is deterministic.
const SEEDS: ContainerId = 'seeds'
const ORDER: ContainerId[] = [UNASSIGNED, SEEDS]

interface Props {
  tournamentId: string
  eventId: string
  version: number
  thirdPlaceEnabled: boolean
  competitors: CompetitorRow[]
  seededIds: string[]
  unassignedIds: string[]
  hasBracket: boolean // bracket generated → seeds frozen; only Reset (guarded) is offered
  hasResults: boolean // a completed knockout result exists → reset is blocked
}

export default function SeedEditor(props: Props) {
  const t = useTranslations('admin_knockout_seeding')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<KnockoutMutationError | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)

  const initialState = useMemo(
    () => buildBoardState([{ groupId: SEEDS, competitorIds: props.seededIds }], props.unassignedIds),
    [props.seededIds, props.unassignedIds],
  )
  const [state, setState] = useState<BoardState>(initialState)
  const [seed, setSeed] = useState(initialState)
  if (seed !== initialState) {
    setSeed(initialState)
    setState(initialState)
  }

  const nameOf = useMemo(() => {
    const map = new Map(props.competitors.map((c) => [c.id, c.shortName || c.name]))
    return (id: string) => map.get(id) ?? id
  }, [props.competitors])

  const seededIds = useMemo(() => [...(state[SEEDS] ?? [])], [state])
  const unassignedIds = useMemo(() => [...(state[UNASSIGNED] ?? [])], [state])
  const readiness = useMemo(
    () => evaluateSeedReadiness({ seededIds, unassignedIds }),
    [seededIds, unassignedIds],
  )
  const dirty = useMemo(
    () => JSON.stringify(state[SEEDS]) !== JSON.stringify(seed[SEEDS]),
    [state, seed],
  )

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

  function run(fn: () => Promise<{ ok: boolean; error?: KnockoutMutationError }>, onOk?: () => void) {
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

  const doSave = () =>
    run(() => saveKnockoutSeeds(props.tournamentId, props.eventId, props.version, { seededIds, unassignedIds }))
  const doClear = () => run(() => clearKnockoutSeeds(props.tournamentId, props.eventId, props.version))
  const doGenerate = () => run(() => generateKnockoutBracket(props.tournamentId, props.eventId, props.version))
  const doReset = () =>
    run(
      () => resetKnockoutBracket(props.tournamentId, props.eventId, props.version, true),
      () => setConfirmReset(false),
    )

  const move = (mutate: (s: BoardState) => BoardState) => setState((prev) => mutate(prev))
  const containerLabel = (c: ContainerId) => (c === UNASSIGNED ? t('unassigned_short') : t('seeds_short'))

  const banner = error && (
    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 mb-3" role="alert">
      <p className="text-[13px] text-red-600">{t(`err_${error}`)}</p>
    </div>
  )

  // ── Bracket already generated → seeds frozen; offer a guarded reset. ─────────────────────────
  if (props.hasBracket) {
    return (
      <div>
        {banner}
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 mb-3">
          <p className="text-[13px] text-amber-700">{t('bracket_locked_notice')}</p>
        </div>
        <div className="bg-cream border border-line rounded-2xl p-5">
          <h3 className="font-serif font-bold text-[14px] text-ink mb-1">{t('reset_heading')}</h3>
          <p className="text-[12.5px] text-muted mb-3 leading-relaxed">
            {props.hasResults ? t('reset_blocked_results') : t('reset_hint')}
          </p>
          <button
            type="button"
            disabled={pending || props.hasResults}
            title={props.hasResults ? t('reset_blocked_results') : undefined}
            onClick={() => setConfirmReset(true)}
            className="font-semibold text-[13px] px-5 py-2.5 rounded-full border border-red-200 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white hover:border-transparent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('reset_cta')}
          </button>
        </div>

        <ConfirmDialog
          open={confirmReset}
          icon="♻️"
          tone="warning"
          title={t('confirm_reset_title')}
          description={t('confirm_reset_desc')}
          confirmLabel={t('reset_cta')}
          cancelLabel={t('cancel')}
          pending={pending}
          onConfirm={doReset}
          onCancel={() => setConfirmReset(false)}
        />
      </div>
    )
  }

  return (
    <div>
      {banner}

      {/* Bracket summary */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-cream border border-line px-3 py-2.5 mb-3">
        <Stat label={t('total_competitors')} value={props.competitors.length} />
        <Stat label={t('bracket_size')} value={readiness.bracketSize} />
        <Stat label={t('bye_count')} value={readiness.byes} />
      </div>

      {/* Validation summary */}
      {!readiness.ok && (
        <ul className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 mb-3 space-y-1">
          {readiness.issues.map((issue, i) => (
            <li key={i} className="text-[12.5px] text-amber-700">
              {issue.code === 'not_enough_competitors'
                ? t('issue_not_enough')
                : t('issue_unseeded', { names: issue.competitorIds.map((id) => nameOf(id)).join(', ') })}
            </li>
          ))}
        </ul>
      )}

      {/* Board: unassigned pool + ordered seeds */}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Column id={UNASSIGNED} title={t('unassigned_title')} count={unassignedIds.length} tone="neutral" itemIds={unassignedIds}>
            {unassignedIds.map((id) => (
              <Chip
                key={id}
                id={id}
                label={nameOf(id)}
                container={UNASSIGNED}
                onPrev={() => move((s) => shiftContainer(s, id, -1, ORDER))}
                onNext={() => move((s) => shiftContainer(s, id, 1, ORDER))}
                onUp={() => move((s) => nudgeWithin(s, id, -1))}
                onDown={() => move((s) => nudgeWithin(s, id, 1))}
                onMoveTo={(c) => move((s) => moveItem(s, id, c))}
                containerLabel={containerLabel}
                labels={t}
              />
            ))}
          </Column>

          <Column id={SEEDS} title={t('seeds_title')} count={seededIds.length} tone="seeds" itemIds={seededIds}>
            {seededIds.map((id, i) => (
              <Chip
                key={id}
                id={id}
                label={nameOf(id)}
                slot={i + 1}
                container={SEEDS}
                onPrev={() => move((s) => shiftContainer(s, id, -1, ORDER))}
                onNext={() => move((s) => shiftContainer(s, id, 1, ORDER))}
                onUp={() => move((s) => nudgeWithin(s, id, -1))}
                onDown={() => move((s) => nudgeWithin(s, id, 1))}
                onMoveTo={(c) => move((s) => moveItem(s, id, c))}
                containerLabel={containerLabel}
                labels={t}
              />
            ))}
          </Column>
        </div>
      </DndContext>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2 mt-4">
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
          disabled={pending || seededIds.length < 2}
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
          {t('generate_cta')}
        </button>
        {seededIds.length > 0 && !dirty && (
          <button
            type="button"
            disabled={pending}
            onClick={doClear}
            className="font-semibold text-[12.5px] px-3 py-2 rounded-full border border-line bg-cream text-muted hover:text-red-600 transition-colors disabled:opacity-50"
          >
            {t('clear_cta')}
          </button>
        )}
        {dirty && <span className="text-[12px] text-muted">{t('unsaved')}</span>}
      </div>

      {showPreview && (
        <KnockoutPreviewPanel
          seededIds={seededIds}
          thirdPlaceEnabled={props.thirdPlaceEnabled}
          nameOf={nameOf}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <span className="text-[12.5px] text-muted">
      {label}: <span className="font-bold text-ink">{value}</span>
    </span>
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
  tone: 'neutral' | 'seeds'
  itemIds: readonly string[]
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div
      className={`rounded-2xl border p-3 min-h-[120px] transition-colors ${
        tone === 'seeds' ? 'bg-paper border-line' : 'bg-cream/60 border-line'
      } ${isOver ? 'ring-2 ring-rose/40' : ''}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-2 px-1">
        <span className="font-serif font-bold text-[13.5px] text-ink">{title}</span>
        <span className="text-[11.5px] text-muted">{count}</span>
      </div>
      <div ref={setNodeRef} className="space-y-1.5">
        <SortableContext items={itemIds as string[]} strategy={verticalListSortingStrategy}>
          {children}
        </SortableContext>
      </div>
    </div>
  )
}

// ── Chip (sortable item + accessible controls) ───────────────────────────────────────────────
function Chip({
  id,
  label,
  slot,
  container,
  onPrev,
  onNext,
  onUp,
  onDown,
  onMoveTo,
  containerLabel,
  labels,
}: {
  id: string
  label: string
  slot?: number
  container: ContainerId
  onPrev: () => void
  onNext: () => void
  onUp: () => void
  onDown: () => void
  onMoveTo: (c: ContainerId) => void
  containerLabel: (c: ContainerId) => string
  labels: (key: string, values?: Record<string, string | number>) => string
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  const idx = ORDER.indexOf(container)

  return (
    <div ref={setNodeRef} style={style} className="bg-cream border border-line rounded-xl px-2 py-1.5 flex items-center gap-1.5">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={labels('drag_handle', { name: label })}
        className="flex-none w-6 h-6 grid place-items-center rounded-md text-muted hover:text-rose cursor-grab active:cursor-grabbing touch-none"
      >
        ⠿
      </button>
      {slot !== undefined && (
        <span className="flex-none w-6 text-center text-[11px] font-bold text-teal">{slot}</span>
      )}
      <span className="flex-1 min-w-0 text-[13px] text-ink font-medium truncate">{label}</span>

      <div className="flex-none flex items-center gap-0.5">
        <button type="button" onClick={onUp} aria-label={labels('move_up')} className="w-6 h-6 grid place-items-center rounded-md border border-line bg-paper text-[11px] text-muted hover:text-rose transition-colors">↑</button>
        <button type="button" onClick={onDown} aria-label={labels('move_down')} className="w-6 h-6 grid place-items-center rounded-md border border-line bg-paper text-[11px] text-muted hover:text-rose transition-colors">↓</button>
        <button type="button" onClick={onPrev} disabled={idx <= 0} aria-label={labels('move_prev')} className="w-6 h-6 grid place-items-center rounded-md border border-line bg-paper text-[11px] text-muted hover:text-rose disabled:opacity-30 transition-colors">◀</button>
        <button type="button" onClick={onNext} disabled={idx >= ORDER.length - 1} aria-label={labels('move_next')} className="w-6 h-6 grid place-items-center rounded-md border border-line bg-paper text-[11px] text-muted hover:text-rose disabled:opacity-30 transition-colors">▶</button>
        <select
          value={container}
          onChange={(e) => onMoveTo(e.target.value as ContainerId)}
          aria-label={labels('move_to')}
          className="ml-0.5 text-[11px] px-1 py-1 rounded-md border border-line bg-paper text-muted focus:outline-none focus:border-rose/50 max-w-[86px]"
        >
          {ORDER.map((c) => (
            <option key={c} value={c}>
              {containerLabel(c)}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
