'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import ConfirmDialog from './ConfirmDialog'
import KnockoutPreviewPanel from './KnockoutPreviewPanel'
import TruncatedName from '../public/TruncatedName'
import {
  boardFromArrangement,
  boardsEqual,
  moveToPool,
  moveToSeat,
  toArrangement,
  type BoardState,
} from '@/lib/tournaments/domain/pairing-board'
import {
  seedNumberForSlot,
  validatePairingArrangement,
} from '@/lib/tournaments/domain/first-round-pairing'
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

// The dual-branch DIRECT first-round pairing editor. The old "arrange a seed-order list, read the
// pairings off to the side" workflow is gone: an organiser now drags tokens straight into the first-
// round match slots (or uses the per-token move menu for keyboard/no-drag). An EMPTY slot is a BYE,
// wherever they leave it — so they pick which teams get a BYE by leaving the opposite slot empty. Each
// branch is an independent board (a fixed seat array + an unassigned pool) over GROUP-RANK TOKENS; the
// board reducer guarantees no token is ever lost or duplicated. The visible pairings ARE the live
// preview and map losslessly to the persisted seed-position slots (server re-resolves competitors).

interface Props {
  tournamentId: string
  eventId: string
  setup: GroupKnockoutSeedSetup
}

function arrangementOf(branch: BranchSeedState) {
  return { size: branch.bracketSize, seats: branch.seats, pool: branch.unassignedIds }
}

export default function GroupKnockoutSeedEditor({ tournamentId, eventId, setup }: Props) {
  const t = useTranslations('admin_group_knockout')
  const tk = useTranslations('admin_knockout_seeding')
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<KnockoutMutationError | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)

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

  function banner() {
    return (
      error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 mb-3" role="alert">
          <p className="text-[13px] text-red-600">{tk(`err_${error}`)}</p>
        </div>
      )
    )
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

  // ── Groups not assigned yet → no stable token pool, nothing to lay out. ──────────────────────
  if (setup.templatePhase === 'groups_pending') {
    return (
      <div className="bg-cream border border-line rounded-2xl py-10 px-6 text-center">
        <p className="text-[13.5px] text-ink font-medium mb-1">{t('groups_pending_title')}</p>
        <p className="text-[12.5px] text-muted">{t('groups_pending_hint')}</p>
      </div>
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
      canApply={setup.readyToSeed}
      pending={pending}
      error={error}
      tokenLabel={tokenLabel}
      tokenSub={tokenSub}
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
  canApply,
  pending,
  error,
  tokenLabel,
  tokenSub,
  run,
}: {
  tournamentId: string
  eventId: string
  version: number
  setup: GroupKnockoutSeedSetup
  hasConso: boolean
  canApply: boolean
  pending: boolean
  error: KnockoutMutationError | null
  tokenLabel: (id: string) => string
  tokenSub: (id: string) => string | null
  run: (fn: () => Promise<{ ok: boolean; error?: KnockoutMutationError }>, onOk?: () => void) => void
}) {
  const t = useTranslations('admin_group_knockout')
  const tk = useTranslations('admin_knockout_seeding')

  const [champBoard, setChampBoard] = useState<BoardState>(() => boardFromArrangement(arrangementOf(setup.championship)))
  const [consoBoard, setConsoBoard] = useState<BoardState>(() =>
    setup.consolation ? boardFromArrangement(arrangementOf(setup.consolation)) : { seats: [], pool: [] },
  )
  const champBase = useMemo(() => boardFromArrangement(arrangementOf(setup.championship)), [setup.championship])
  const consoBase = useMemo(
    () => (setup.consolation ? boardFromArrangement(arrangementOf(setup.consolation)) : { seats: [], pool: [] }),
    [setup.consolation],
  )

  const champValid = useMemo(
    () => validatePairingArrangement(toArrangement(champBoard, setup.championship.bracketSize)),
    [champBoard, setup.championship.bracketSize],
  )
  const consoValid = useMemo(
    () =>
      hasConso && setup.consolation
        ? validatePairingArrangement(toArrangement(consoBoard, setup.consolation.bracketSize))
        : null,
    [consoBoard, hasConso, setup.consolation],
  )

  const dirty = useMemo(
    () => !boardsEqual(champBoard, champBase) || (hasConso && !boardsEqual(consoBoard, consoBase)),
    [champBoard, champBase, consoBoard, consoBase, hasConso],
  )
  const canSave = champValid.canSave && (!consoValid || consoValid.canSave)
  const allApplyReady = champValid.canApply && (!consoValid || consoValid.canApply)

  // APPLY may run only in the 'ready' phase, with a clean saved template that is a full, valid layout.
  const applyDisabled = pending || !canApply || !allApplyReady || dirty || setup.templateStale
  const applyReason = dirty
    ? tk('save_first')
    : setup.templateStale
      ? t('apply_blocked_stale')
      : setup.templatePhase === 'template'
        ? t('apply_blocked_incomplete')
        : setup.templatePhase === 'blocking_tie'
          ? t('apply_blocked_tie')
          : !allApplyReady
            ? t('apply_blocked_readiness')
            : null

  const branchSeats = (b: BoardState): (string | null)[] => [...b.seats]
  const branchPool = (b: BoardState): string[] => [...b.pool]

  const doSave = () =>
    run(() =>
      saveGroupKnockoutSeeds(tournamentId, eventId, version, {
        championship: { seats: branchSeats(champBoard), unassignedIds: branchPool(champBoard) },
        consolation: hasConso ? { seats: branchSeats(consoBoard), unassignedIds: branchPool(consoBoard) } : null,
      }),
    )
  const doClear = () => run(() => clearGroupKnockoutSeeds(tournamentId, eventId, version))
  const doGenerate = () => run(() => generateGroupKnockoutBrackets(tournamentId, eventId, version))

  const anySeeded = champBoard.seats.some((s) => s !== null) || consoBoard.seats.some((s) => s !== null)
  const saveDisabled = pending || !dirty || !canSave

  return (
    <div>
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 mb-3" role="alert">
          <p className="text-[13px] text-red-600">{tk(`err_${error}`)}</p>
        </div>
      )}

      {/* Phase banner: draft template (stage not finished), a blocking tie, or a stale template. */}
      {setup.templateStale ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 mb-3">
          <p className="text-[13px] font-semibold text-amber-800">{t('template_stale_title')}</p>
          <p className="text-[12px] text-amber-700 mt-0.5">{t('template_stale_hint')}</p>
        </div>
      ) : setup.templatePhase === 'template' ? (
        <div className="rounded-lg bg-teal-soft border border-teal/25 px-3 py-2.5 mb-3">
          <p className="text-[13px] font-semibold text-teal">{t('template_mode_title')}</p>
          <p className="text-[12px] text-ink/70 mt-0.5">{t('direct_edit_hint')}</p>
        </div>
      ) : setup.templatePhase === 'blocking_tie' ? (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 mb-3">
          <p className="text-[13px] text-amber-700">{t('block_blocking_tie')}</p>
        </div>
      ) : (
        <div className="rounded-lg bg-teal-soft border border-teal/25 px-3 py-2.5 mb-3">
          <p className="text-[12px] text-ink/70">{t('direct_edit_hint')}</p>
        </div>
      )}

      <BranchBoard
        title={t('branch_championship')}
        subtitle={t('branch_championship_hint')}
        board={champBoard}
        setBoard={setChampBoard}
        size={setup.championship.bracketSize}
        validation={champValid}
        thirdPlaceEnabled={setup.event.thirdPlaceEnabled}
        tokenLabel={tokenLabel}
        tokenSub={tokenSub}
      />

      {hasConso && setup.consolation && (
        <div className="mt-6">
          <BranchBoard
            title={t('branch_consolation')}
            subtitle={t('branch_consolation_hint')}
            board={consoBoard}
            setBoard={setConsoBoard}
            size={setup.consolation.bracketSize}
            validation={consoValid!}
            thirdPlaceEnabled={setup.event.thirdPlaceEnabled}
            tokenLabel={tokenLabel}
            tokenSub={tokenSub}
          />
        </div>
      )}

      {/* Action bar — distinct SAVE-TEMPLATE vs APPLY (generate official bracket) actions. */}
      <div className="flex flex-wrap items-center gap-2 mt-5">
        <button
          type="button"
          disabled={saveDisabled}
          title={!canSave ? t('save_blocked_empty_match') : undefined}
          onClick={doSave}
          className="font-semibold text-[13px] px-5 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-50"
        >
          {pending ? tk('saving') : t('save_template_cta')}
        </button>
        <button
          type="button"
          disabled={applyDisabled}
          title={applyReason ?? undefined}
          aria-describedby={applyReason ? 'gk-apply-reason' : undefined}
          onClick={doGenerate}
          className="font-semibold text-[13px] px-5 py-2.5 rounded-full bg-teal text-white hover:opacity-90 transition-all disabled:opacity-50"
        >
          {t('apply_cta')}
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
      {!canSave && dirty && (
        <p className="text-[12px] text-red-600 mt-2">{t('save_blocked_empty_match')}</p>
      )}
      {applyReason && !dirty && (
        <p id="gk-apply-reason" className="text-[12px] text-muted mt-2">
          {applyReason}
        </p>
      )}
    </div>
  )
}

// ── One branch's direct pairing board: pool + first-round match cards (each slot a drop target) ─────
function BranchBoard({
  title,
  subtitle,
  board,
  setBoard,
  size,
  validation,
  thirdPlaceEnabled,
  tokenLabel,
  tokenSub,
}: {
  title: string
  subtitle: string
  board: BoardState
  setBoard: React.Dispatch<React.SetStateAction<BoardState>>
  size: number
  validation: ReturnType<typeof validatePairingArrangement>
  thirdPlaceEnabled: boolean
  tokenLabel: (id: string) => string
  tokenSub: (id: string) => string | null
}) {
  const t = useTranslations('admin_group_knockout')
  const tk = useTranslations('admin_knockout_seeding')
  const tb = useTranslations('admin_knockout_bracket')
  const [showFull, setShowFull] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  )

  const matchCount = size / 2
  const seated = board.seats.filter((s): s is string => s !== null)

  const sideLabel = (side: 'a' | 'b') => (side === 'a' ? t('slot_a') : t('slot_b'))
  // Destination options for the per-token move menu (keyboard / no-drag path): pool + every slot.
  const destinations = useMemo(() => {
    const opts: { value: string; label: string }[] = [{ value: 'pool', label: t('unassigned_title') }]
    for (let m = 0; m < matchCount; m++) {
      for (const side of ['a', 'b'] as const) {
        const seat = seedNumberForSlot(size, { matchIndex: m, side }) - 1
        opts.push({ value: `seat:${seat}`, label: t('dest_slot', { n: m + 1, side: side === 'a' ? t('slot_a') : t('slot_b') }) })
      }
    }
    return opts
  }, [matchCount, size, t])

  const currentDestOf = (tokenId: string): string => {
    const idx = board.seats.indexOf(tokenId)
    return idx >= 0 ? `seat:${idx}` : 'pool'
  }
  const applyMove = (tokenId: string, dest: string) => {
    setBoard((prev) => (dest === 'pool' ? moveToPool(prev, tokenId) : moveToSeat(prev, tokenId, Number(dest.slice(5)))))
  }

  function onDragStart(e: DragStartEvent) {
    setDragId(String(e.active.id))
  }
  function onDragEnd(e: DragEndEvent) {
    setDragId(null)
    const { active, over } = e
    if (!over) return
    applyMove(String(active.id), String(over.id))
  }

  const seatToken = (matchIndex: number, side: 'a' | 'b'): { seat: number; token: string | null } => {
    const seat = seedNumberForSlot(size, { matchIndex, side }) - 1
    return { seat, token: board.seats[seat] ?? null }
  }

  return (
    <div className="rounded-2xl border border-line bg-paper/40 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-serif font-bold text-[15px] text-ink">{title}</h3>
          <p className="text-[12px] text-muted">{subtitle}</p>
        </div>
        <button
          type="button"
          disabled={seated.length < 2}
          onClick={() => setShowFull(true)}
          title={t('full_bracket_hint')}
          className="flex-none font-semibold text-[12.5px] px-3 py-2 rounded-full border border-teal/25 bg-teal-soft text-teal hover:bg-teal hover:text-white transition-all disabled:opacity-50"
        >
          {t('full_bracket_cta')}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 rounded-lg bg-cream border border-line px-3 py-2 mb-3">
        <Stat label={tk('bracket_size')} value={validation.bracketSize} />
        <Stat label={tk('competitor_count')} value={validation.seatedCount} />
        <Stat label={tk('bye_count')} value={validation.byes} />
      </div>

      {validation.issues.length > 0 && (
        <ul className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 mb-3 space-y-1">
          {validation.issues.map((issue, i) => (
            <li key={i} className="text-[12.5px] text-amber-700">
              {issue.code === 'not_enough_competitors'
                ? t('issue_not_enough')
                : issue.code === 'both_slots_empty'
                  ? t('both_empty_error', { matches: issue.matchNumbers.join(', ') })
                  : t('unassigned_error', { count: issue.tokenIds.length })}
            </li>
          ))}
        </ul>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-4">
          {/* Left: unassigned pool */}
          <div className="lg:col-span-5">
            <PoolColumn
              pool={board.pool}
              title={t('unassigned_title')}
              hint={board.pool.length === 0 ? t('pool_empty') : t('pool_hint')}
            >
              {board.pool.map((id) => (
                <TokenChip
                  key={id}
                  id={id}
                  label={tokenLabel(id)}
                  sub={tokenSub(id)}
                  destinations={destinations}
                  currentDest="pool"
                  onMove={(dest) => applyMove(id, dest)}
                  moveLabel={tk('move_to')}
                  dragLabel={tk('drag_handle', { name: tokenLabel(id) })}
                />
              ))}
            </PoolColumn>
          </div>

          {/* Right: first-round match cards — the live pairing preview AND the editing surface */}
          <div className="lg:col-span-7">
            <h4 className="font-serif font-bold text-[13px] text-ink mb-2">{t('first_round_title')}</h4>
            <ol className="grid grid-cols-1 xl:grid-cols-2 gap-2.5" aria-label={t('first_round_title')}>
              {Array.from({ length: matchCount }, (_, m) => {
                const a = seatToken(m, 'a')
                const b = seatToken(m, 'b')
                const isBye = (a.token === null) !== (b.token === null)
                return (
                  <li key={m} className="rounded-xl border border-line bg-paper px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[11px] font-bold text-teal">{tb('match_no', { n: m + 1 })}</span>
                      {isBye && (
                        <span className="flex-none text-[10px] font-bold text-teal bg-teal-soft rounded-full px-2 py-0.5">
                          {t('bye_advance')}
                        </span>
                      )}
                    </div>
                    <SeatSlot
                      seatId={a.seat}
                      token={a.token}
                      matchNumber={m + 1}
                      sideLabel={sideLabel('a')}
                      hasOpponent={b.token !== null}
                      tokenLabel={tokenLabel}
                      tokenSub={tokenSub}
                      destinations={destinations}
                      currentDestOf={currentDestOf}
                      applyMove={applyMove}
                      emptyHint={t('slot_empty_hint')}
                      byeHint={t('slot_bye_hint')}
                      moveLabel={tk('move_to')}
                      dragLabelFor={(id) => tk('drag_handle', { name: tokenLabel(id) })}
                    />
                    <div className="flex items-center gap-2 my-0.5 pl-1" aria-hidden="true">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{tb('vs')}</span>
                      <span className="flex-1 h-px bg-line" />
                    </div>
                    <SeatSlot
                      seatId={b.seat}
                      token={b.token}
                      matchNumber={m + 1}
                      sideLabel={sideLabel('b')}
                      hasOpponent={a.token !== null}
                      tokenLabel={tokenLabel}
                      tokenSub={tokenSub}
                      destinations={destinations}
                      currentDestOf={currentDestOf}
                      applyMove={applyMove}
                      emptyHint={t('slot_empty_hint')}
                      byeHint={t('slot_bye_hint')}
                      moveLabel={tk('move_to')}
                      dragLabelFor={(id) => tk('drag_handle', { name: tokenLabel(id) })}
                    />
                  </li>
                )
              })}
            </ol>
          </div>
        </div>

        <DragOverlay>
          {dragId ? (
            <div className="bg-cream border border-rose/40 rounded-xl px-2.5 py-1.5 shadow-lg text-[13px] text-ink font-medium">
              {tokenLabel(dragId)}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {showFull && (
        <KnockoutPreviewPanel
          seats={board.seats}
          thirdPlaceEnabled={thirdPlaceEnabled}
          nameOf={(id) => tokenLabel(id)}
          onClose={() => setShowFull(false)}
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

// The unassigned pool — a droppable zone holding token chips not yet placed into a first-round slot.
function PoolColumn({
  pool,
  title,
  hint,
  children,
}: {
  pool: readonly string[]
  title: string
  hint: string
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'pool' })
  return (
    <div className={`rounded-2xl border p-3 min-h-[120px] transition-colors bg-cream/60 border-line ${isOver ? 'ring-2 ring-rose/40' : ''}`}>
      <div className="flex items-baseline justify-between gap-2 mb-1 px-1">
        <span className="font-serif font-bold text-[13px] text-ink">{title}</span>
        <span className="text-[11.5px] text-muted">{pool.length}</span>
      </div>
      <p className="text-[11px] text-muted px-1 mb-2">{hint}</p>
      <div ref={setNodeRef} className="space-y-1.5 min-h-[40px]">
        {children}
      </div>
    </div>
  )
}

// One first-round slot: a droppable target that holds a token chip or shows an empty/BYE placeholder.
function SeatSlot({
  seatId,
  token,
  matchNumber,
  sideLabel,
  hasOpponent,
  tokenLabel,
  tokenSub,
  destinations,
  currentDestOf,
  applyMove,
  emptyHint,
  byeHint,
  moveLabel,
  dragLabelFor,
}: {
  seatId: number
  token: string | null
  matchNumber: number
  sideLabel: string
  hasOpponent: boolean
  tokenLabel: (id: string) => string
  tokenSub: (id: string) => string | null
  destinations: { value: string; label: string }[]
  currentDestOf: (tokenId: string) => string
  applyMove: (tokenId: string, dest: string) => void
  emptyHint: string
  byeHint: string
  moveLabel: string
  dragLabelFor: (id: string) => string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `seat:${seatId}` })
  return (
    <div
      ref={setNodeRef}
      aria-label={`${sideLabel} · ${matchNumber}`}
      className={`rounded-lg border transition-colors ${
        token ? 'border-transparent' : 'border-dashed border-line/80 bg-cream/40'
      } ${isOver ? 'ring-2 ring-rose/40' : ''}`}
    >
      {token ? (
        <TokenChip
          id={token}
          label={tokenLabel(token)}
          sub={tokenSub(token)}
          destinations={destinations}
          currentDest={currentDestOf(token)}
          onMove={(dest) => applyMove(token, dest)}
          moveLabel={moveLabel}
          dragLabel={dragLabelFor(token)}
        />
      ) : (
        <div className="px-3 py-2.5 text-[12px] italic text-muted">
          {hasOpponent ? byeHint : emptyHint}
        </div>
      )}
    </div>
  )
}

// A draggable token: drag handle, label + resolved-team sub-label, and a "move to" select fallback
// (the guaranteed keyboard / no-drag path). Placed both in the pool and inside seats.
function TokenChip({
  id,
  label,
  sub,
  destinations,
  currentDest,
  onMove,
  moveLabel,
  dragLabel,
}: {
  id: string
  label: string
  sub: string | null
  destinations: { value: string; label: string }[]
  currentDest: string
  onMove: (dest: string) => void
  moveLabel: string
  dragLabel: string
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id })
  return (
    <div
      ref={setNodeRef}
      className={`bg-cream border border-line rounded-xl px-2 py-1.5 flex items-center gap-1.5 ${isDragging ? 'opacity-40' : ''}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={dragLabel}
        className="flex-none w-6 h-6 grid place-items-center rounded-md text-muted hover:text-rose cursor-grab active:cursor-grabbing touch-none"
      >
        ⠿
      </button>
      <span className="flex-1 min-w-0">
        <TruncatedName name={label} className="block text-[13px] text-ink font-medium" />
        {sub && <span className="block text-[11px] text-muted truncate">{sub}</span>}
      </span>
      <select
        value={currentDest}
        onChange={(e) => onMove(e.target.value)}
        aria-label={moveLabel}
        className="flex-none ml-0.5 text-[11px] px-1 py-1 rounded-md border border-line bg-paper text-muted focus:outline-none focus:border-rose/50 max-w-[104px]"
      >
        {destinations.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
    </div>
  )
}
