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
import FirstRoundPairingPreview from './FirstRoundPairingPreview'
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
import { evaluateBranchSeedReadiness } from '@/lib/tournaments/domain/group-knockout-seed'
import {
  saveGroupKnockoutSeeds,
  clearGroupKnockoutSeeds,
  generateGroupKnockoutBrackets,
  resetGroupKnockoutBrackets,
} from '@/app/admin/giai-dau/[id]/noi-dung/actions'
import type {
  BranchSeedState,
  GroupKnockoutSeedSetup,
  GroupRankTokenView,
  KnockoutMutationError,
} from '@/lib/tournaments/admin/types'

// The dual-branch seed editor. Each branch (championship / consolation) is an independent board with
// the SAME reducer as the knockout-only seed editor — two containers (unassigned pool + ordered seeds)
// — over GROUP-RANK TOKENS instead of competitors. Drag == keyboard == fallback buttons funnel through
// group-board.ts so each branch's SAVE payload (seed slot order = the seeds array order) is deterministic.
const SEEDS: ContainerId = 'seeds'
const ORDER: ContainerId[] = [UNASSIGNED, SEEDS]

interface Props {
  tournamentId: string
  eventId: string
  setup: GroupKnockoutSeedSetup
}

function boardOf(branch: BranchSeedState): BoardState {
  return buildBoardState([{ groupId: SEEDS, competitorIds: branch.seededIds }], branch.unassignedIds)
}

export default function GroupKnockoutSeedEditor({ tournamentId, eventId, setup }: Props) {
  const t = useTranslations('admin_group_knockout')
  const tk = useTranslations('admin_knockout_seeding')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<KnockoutMutationError | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [preview, setPreview] = useState<'championship' | 'consolation' | null>(null)

  const version = setup.event.version
  const hasConso = setup.consolation !== null

  // Token label helpers (per branch): "Nhất bảng A" + a resolved-competitor preview sub-label.
  const tokenViews = useMemo(() => {
    const map = new Map<string, GroupRankTokenView>()
    for (const tk2 of setup.championship.tokens) map.set(tk2.tokenId, tk2)
    if (setup.consolation) for (const tk2 of setup.consolation.tokens) map.set(tk2.tokenId, tk2)
    return map
  }, [setup])
  const compName = useMemo(() => {
    const m = new Map(setup.competitors.map((c) => [c.id, c.shortName || c.name]))
    return (id: string | null) => (id ? m.get(id) ?? id : null)
  }, [setup.competitors])
  const rankName = (rank: number) => (rank <= 3 ? t(`rank_${rank}`) : t('rank_n', { n: rank }))
  const tokenLabel = (tokenId: string) => {
    const tv = tokenViews.get(tokenId)
    return tv ? `${rankName(tv.rank)} ${tv.groupName}` : tokenId
  }
  const tokenSub = (tokenId: string) => {
    const tv = tokenViews.get(tokenId)
    if (!tv) return null
    return tv.resolvable ? compName(tv.competitorId) : t('token_unresolved')
  }

  // ── Bracket already generated → seeds frozen; offer a guarded reset. ─────────────────────────
  if (setup.hasBrackets) {
    const doReset = () =>
      run(() => resetGroupKnockoutBrackets(tournamentId, eventId, version, true), () => setConfirmReset(false))
    return (
      <div>
        {banner()}
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 mb-3">
          <p className="text-[13px] text-amber-700">{t('bracket_locked_notice')}</p>
        </div>
        <div className="bg-cream border border-line rounded-2xl p-5">
          <h3 className="font-serif font-bold text-[14px] text-ink mb-1">{t('reset_heading')}</h3>
          <p className="text-[12.5px] text-muted mb-3 leading-relaxed">{t('reset_hint')}</p>
          <button
            type="button"
            disabled={pending}
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
          cancelLabel={tk('cancel')}
          pending={pending}
          onConfirm={doReset}
          onCancel={() => setConfirmReset(false)}
        />
      </div>
    )
  }

  // ── Not ready to seed yet (group stage not settled). ─────────────────────────────────────────
  if (!setup.readyToSeed) {
    const reason =
      setup.blockReason === 'group_stage_incomplete'
        ? t('block_group_incomplete')
        : setup.blockReason === 'blocking_tie'
          ? t('block_blocking_tie')
          : t('block_not_ready')
    return (
      <div className="bg-cream border border-line rounded-2xl py-10 px-6 text-center">
        <p className="text-[13.5px] text-ink font-medium mb-1">{t('not_ready_title')}</p>
        <p className="text-[12.5px] text-muted">{reason}</p>
      </div>
    )
  }

  function banner() {
    return (
      error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 mb-3" role="alert">
          <p className="text-[13px] text-red-600">{tk(`err_${error}`)}</p>
        </div>
      )
    )
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

  return (
    <SeedEditorBody
      tournamentId={tournamentId}
      eventId={eventId}
      version={version}
      setup={setup}
      hasConso={hasConso}
      pending={pending}
      error={error}
      tokenLabel={tokenLabel}
      tokenSub={tokenSub}
      preview={preview}
      setPreview={setPreview}
      run={run}
    />
  )
}

// Body split out so the two independent branch boards keep local drag state without re-running the
// setup/guard logic above on every drag.
function SeedEditorBody({
  tournamentId,
  eventId,
  version,
  setup,
  hasConso,
  pending,
  error,
  tokenLabel,
  tokenSub,
  preview,
  setPreview,
  run,
}: {
  tournamentId: string
  eventId: string
  version: number
  setup: GroupKnockoutSeedSetup
  hasConso: boolean
  pending: boolean
  error: KnockoutMutationError | null
  tokenLabel: (id: string) => string
  tokenSub: (id: string) => string | null
  preview: 'championship' | 'consolation' | null
  setPreview: (b: 'championship' | 'consolation' | null) => void
  run: (fn: () => Promise<{ ok: boolean; error?: KnockoutMutationError }>, onOk?: () => void) => void
}) {
  const t = useTranslations('admin_group_knockout')
  const tk = useTranslations('admin_knockout_seeding')

  const [champState, setChampState] = useState<BoardState>(() => boardOf(setup.championship))
  const [consoState, setConsoState] = useState<BoardState>(() =>
    setup.consolation ? boardOf(setup.consolation) : buildBoardState([{ groupId: SEEDS, competitorIds: [] }], []),
  )
  const champSeed = useMemo(() => boardOf(setup.championship), [setup.championship])
  const consoSeed = useMemo(
    () => (setup.consolation ? boardOf(setup.consolation) : buildBoardState([{ groupId: SEEDS, competitorIds: [] }], [])),
    [setup.consolation],
  )

  const champSeeded = useMemo(() => [...(champState[SEEDS] ?? [])], [champState])
  const consoSeeded = useMemo(() => [...(consoState[SEEDS] ?? [])], [consoState])
  const champUnassigned = useMemo(() => [...(champState[UNASSIGNED] ?? [])], [champState])
  const consoUnassigned = useMemo(() => [...(consoState[UNASSIGNED] ?? [])], [consoState])

  const champReady = evaluateBranchSeedReadiness({ seededIds: champSeeded, unassignedIds: champUnassigned })
  const consoReady = evaluateBranchSeedReadiness({ seededIds: consoSeeded, unassignedIds: consoUnassigned })

  const dirty = useMemo(
    () =>
      JSON.stringify(champState[SEEDS]) !== JSON.stringify(champSeed[SEEDS]) ||
      (hasConso && JSON.stringify(consoState[SEEDS]) !== JSON.stringify(consoSeed[SEEDS])),
    [champState, champSeed, consoState, consoSeed, hasConso],
  )
  const allReady = champReady.ok && (!hasConso || consoReady.ok)

  const doSave = () =>
    run(() =>
      saveGroupKnockoutSeeds(tournamentId, eventId, version, {
        championship: { seededIds: champSeeded, unassignedIds: champUnassigned },
        consolation: hasConso ? { seededIds: consoSeeded, unassignedIds: consoUnassigned } : null,
      }),
    )
  const doClear = () => run(() => clearGroupKnockoutSeeds(tournamentId, eventId, version))
  const doGenerate = () => run(() => generateGroupKnockoutBrackets(tournamentId, eventId, version))

  const anySeeded = champSeeded.length > 0 || consoSeeded.length > 0

  return (
    <div>
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 mb-3" role="alert">
          <p className="text-[13px] text-red-600">{tk(`err_${error}`)}</p>
        </div>
      )}

      <BranchBoard
        idKey="champ"
        title={t('branch_championship')}
        subtitle={t('branch_championship_hint')}
        state={champState}
        setState={setChampState}
        readiness={champReady}
        thirdPlaceEnabled={setup.event.thirdPlaceEnabled}
        tokenLabel={tokenLabel}
        tokenSub={tokenSub}
        onPreview={() => setPreview('championship')}
        previewDisabled={pending || champSeeded.length < 2}
      />

      {hasConso && (
        <div className="mt-6">
          <BranchBoard
            idKey="conso"
            title={t('branch_consolation')}
            subtitle={t('branch_consolation_hint')}
            state={consoState}
            setState={setConsoState}
            readiness={consoReady}
            thirdPlaceEnabled={setup.event.thirdPlaceEnabled}
            tokenLabel={tokenLabel}
            tokenSub={tokenSub}
            onPreview={() => setPreview('consolation')}
            previewDisabled={pending || consoSeeded.length < 2}
          />
        </div>
      )}

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2 mt-5">
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={doSave}
          className="font-semibold text-[13px] px-5 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-50"
        >
          {pending ? tk('saving') : tk('save_cta')}
        </button>
        <button
          type="button"
          disabled={pending || !allReady || dirty}
          title={dirty ? tk('save_first') : undefined}
          onClick={doGenerate}
          className="font-semibold text-[13px] px-5 py-2.5 rounded-full bg-teal text-white hover:opacity-90 transition-all disabled:opacity-50"
        >
          {t('generate_cta')}
        </button>
        {anySeeded && !dirty && (
          <button
            type="button"
            disabled={pending}
            onClick={doClear}
            className="font-semibold text-[12.5px] px-3 py-2 rounded-full border border-line bg-cream text-muted hover:text-red-600 transition-colors disabled:opacity-50"
          >
            {tk('clear_cta')}
          </button>
        )}
        {dirty && <span className="text-[12px] text-muted">{tk('unsaved')}</span>}
      </div>

      {preview && (
        <KnockoutPreviewPanel
          seededIds={preview === 'championship' ? champSeeded : consoSeeded}
          thirdPlaceEnabled={setup.event.thirdPlaceEnabled}
          nameOf={(id) => tokenLabel(id)}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  )
}

// ── One branch's dnd board (unassigned pool + ordered seeds) + live first-round pairing preview ──
function BranchBoard({
  idKey,
  title,
  subtitle,
  state,
  setState,
  readiness,
  thirdPlaceEnabled,
  tokenLabel,
  tokenSub,
  onPreview,
  previewDisabled,
}: {
  idKey: string
  title: string
  subtitle: string
  state: BoardState
  setState: React.Dispatch<React.SetStateAction<BoardState>>
  readiness: ReturnType<typeof evaluateBranchSeedReadiness>
  thirdPlaceEnabled: boolean
  tokenLabel: (id: string) => string
  tokenSub: (id: string) => string | null
  onPreview: () => void
  previewDisabled: boolean
}) {
  const t = useTranslations('admin_group_knockout')
  const tk = useTranslations('admin_knockout_seeding')
  const seededIds = useMemo(() => [...(state[SEEDS] ?? [])], [state])
  const unassignedIds = useMemo(() => [...(state[UNASSIGNED] ?? [])], [state])

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
  const move = (mutate: (s: BoardState) => BoardState) => setState((prev) => mutate(prev))
  const containerLabel = (c: ContainerId) => (c === UNASSIGNED ? tk('unassigned_short') : tk('seeds_short'))

  return (
    <div className="rounded-2xl border border-line bg-paper/40 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-serif font-bold text-[15px] text-ink">{title}</h3>
          <p className="text-[12px] text-muted">{subtitle}</p>
        </div>
        <button
          type="button"
          disabled={previewDisabled}
          onClick={onPreview}
          title={t('full_bracket_hint')}
          className="flex-none font-semibold text-[12.5px] px-3 py-2 rounded-full border border-teal/25 bg-teal-soft text-teal hover:bg-teal hover:text-white transition-all disabled:opacity-50"
        >
          {t('full_bracket_cta')}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-cream border border-line px-3 py-2 mb-3">
        <Stat label={tk('bracket_size')} value={readiness.bracketSize} />
        <Stat label={tk('bye_count')} value={readiness.byes} />
      </div>

      {!readiness.ok && (
        <ul className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mb-3 space-y-1">
          {readiness.issues.map((issue, i) => (
            <li key={i} className="text-[12.5px] text-amber-700">
              {issue.code === 'not_enough_competitors'
                ? t('issue_not_enough')
                : t('issue_unseeded', { names: issue.competitorIds.map((id) => tokenLabel(id)).join(', ') })}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4">
        {/* Left: the seeding board (unassigned pool + ordered seeds) */}
        <div className="lg:col-span-7">
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
            <div className="space-y-3">
              <Column id={UNASSIGNED} title={t('unassigned_title')} count={unassignedIds.length} tone="neutral" itemIds={unassignedIds}>
                {unassignedIds.map((id) => (
                  <Chip
                    key={id}
                    id={id}
                    label={tokenLabel(id)}
                    sub={tokenSub(id)}
                    container={UNASSIGNED}
                    onPrev={() => move((s) => shiftContainer(s, id, -1, ORDER))}
                    onNext={() => move((s) => shiftContainer(s, id, 1, ORDER))}
                    onUp={() => move((s) => nudgeWithin(s, id, -1))}
                    onDown={() => move((s) => nudgeWithin(s, id, 1))}
                    onMoveTo={(c) => move((s) => moveItem(s, id, c))}
                    containerLabel={containerLabel}
                    labels={tk}
                  />
                ))}
              </Column>
              <Column id={SEEDS} title={t('seeds_title')} count={seededIds.length} tone="seeds" itemIds={seededIds}>
                {seededIds.map((id, i) => (
                  <Chip
                    key={id}
                    id={id}
                    label={tokenLabel(id)}
                    sub={tokenSub(id)}
                    slot={i + 1}
                    container={SEEDS}
                    onPrev={() => move((s) => shiftContainer(s, id, -1, ORDER))}
                    onNext={() => move((s) => shiftContainer(s, id, 1, ORDER))}
                    onUp={() => move((s) => nudgeWithin(s, id, -1))}
                    onDown={() => move((s) => nudgeWithin(s, id, 1))}
                    onMoveTo={(c) => move((s) => moveItem(s, id, c))}
                    containerLabel={containerLabel}
                    labels={tk}
                  />
                ))}
              </Column>
            </div>
          </DndContext>
        </div>

        {/* Right: live first-round pairings derived from the SAME engine as the full preview */}
        <FirstRoundPairingPreview
          className="lg:col-span-5"
          headingId={`frp-${idKey}`}
          seededIds={seededIds}
          thirdPlaceEnabled={thirdPlaceEnabled}
          nameOf={tokenLabel}
        />
      </div>
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
      className={`rounded-2xl border p-3 min-h-[110px] transition-colors ${
        tone === 'seeds' ? 'bg-paper border-line' : 'bg-cream/60 border-line'
      } ${isOver ? 'ring-2 ring-rose/40' : ''}`}
    >
      <div className="flex items-baseline justify-between gap-2 mb-2 px-1">
        <span className="font-serif font-bold text-[13px] text-ink">{title}</span>
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

function Chip({
  id,
  label,
  sub,
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
  sub: string | null
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
      {slot !== undefined && <span className="flex-none w-6 text-center text-[11px] font-bold text-teal">{slot}</span>}
      <span className="flex-1 min-w-0">
        <span className="block text-[13px] text-ink font-medium truncate">{label}</span>
        {sub && <span className="block text-[11px] text-muted truncate">{sub}</span>}
      </span>

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
