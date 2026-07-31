// Pure board-state model shared by the drag-and-drop UI AND the accessible move controls. Keeping
// it here (not in React) means the exact same transitions are unit-testable and the resulting SAVE
// payload is deterministic regardless of whether the admin dragged, used the keyboard, or clicked
// the fallback buttons. No I/O, never mutates its input.

import type { CompetitorId, GroupId } from './types.ts'
import type { AssignmentPayload } from './group-assignment.ts'

// The pseudo-container holding competitors not yet placed in any group.
export const UNASSIGNED = '__unassigned__'
export type ContainerId = typeof UNASSIGNED | GroupId

// containerId → ordered competitor ids. Always includes UNASSIGNED and one entry per group.
export type BoardState = Readonly<Record<ContainerId, readonly CompetitorId[]>>

/** Build the initial board from the loaded groups + the competitors currently unassigned. */
export function buildBoardState(
  groups: readonly { readonly groupId: GroupId; readonly competitorIds: readonly CompetitorId[] }[],
  unassignedIds: readonly CompetitorId[],
): BoardState {
  const state: Record<ContainerId, readonly CompetitorId[]> = { [UNASSIGNED]: [...unassignedIds] }
  for (const g of groups) state[g.groupId] = [...g.competitorIds]
  return state
}

/** Ordered container ids (unassigned first, then the groups in the given order). */
export function containerOrder(groupIds: readonly GroupId[]): ContainerId[] {
  return [UNASSIGNED, ...groupIds]
}

/** Which container currently holds `competitorId`, or null if it is not on the board. */
export function findContainer(state: BoardState, competitorId: CompetitorId): ContainerId | null {
  for (const container of Object.keys(state)) {
    if (state[container].includes(competitorId)) return container
  }
  return null
}

function without(list: readonly CompetitorId[], id: CompetitorId): CompetitorId[] {
  return list.filter((c) => c !== id)
}

/**
 * Move `competitorId` into `toContainer` at `toIndex` (default: end). A no-op-safe operation: the
 * competitor is first removed from wherever it currently is, so moving within the same container
 * reorders it. Returns a NEW state.
 */
export function moveItem(
  state: BoardState,
  competitorId: CompetitorId,
  toContainer: ContainerId,
  toIndex?: number,
): BoardState {
  const from = findContainer(state, competitorId)
  if (from === null || !(toContainer in state)) return state

  const next: Record<ContainerId, readonly CompetitorId[]> = {}
  for (const c of Object.keys(state)) next[c] = state[c]

  // Remove from its current container.
  next[from] = without(next[from], competitorId)

  // Insert into the target (recompute against the already-removed target list).
  const target = [...next[toContainer]]
  const clampedRaw = toIndex ?? target.length
  const clamped = Math.max(0, Math.min(clampedRaw, target.length))
  target.splice(clamped, 0, competitorId)
  next[toContainer] = target
  return next
}

/** Move a competitor to the previous / next container in `order` (accessible fallback). */
export function shiftContainer(
  state: BoardState,
  competitorId: CompetitorId,
  dir: -1 | 1,
  order: readonly ContainerId[],
): BoardState {
  const from = findContainer(state, competitorId)
  if (from === null) return state
  const idx = order.indexOf(from)
  const targetIdx = idx + dir
  if (idx === -1 || targetIdx < 0 || targetIdx >= order.length) return state
  return moveItem(state, competitorId, order[targetIdx])
}

/** Reorder a competitor up / down WITHIN its current container (accessible fallback). */
export function nudgeWithin(state: BoardState, competitorId: CompetitorId, dir: -1 | 1): BoardState {
  const container = findContainer(state, competitorId)
  if (container === null) return state
  const list = state[container]
  const idx = list.indexOf(competitorId)
  const target = idx + dir
  if (target < 0 || target >= list.length) return state
  return moveItem(state, competitorId, container, target)
}

/** Serialize the board into the SAVE payload the server action expects. */
export function toAssignmentPayload(state: BoardState, groupIds: readonly GroupId[]): AssignmentPayload {
  return {
    groups: groupIds.map((groupId) => ({ groupId, competitorIds: [...(state[groupId] ?? [])] })),
    unassignedIds: [...(state[UNASSIGNED] ?? [])],
  }
}
