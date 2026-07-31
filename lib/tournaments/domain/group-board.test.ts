import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  UNASSIGNED,
  buildBoardState,
  containerOrder,
  findContainer,
  moveItem,
  shiftContainer,
  nudgeWithin,
  toAssignmentPayload,
} from './group-board.ts'

const groups = [
  { groupId: 'gA', competitorIds: ['c1', 'c2'] },
  { groupId: 'gB', competitorIds: ['c3'] },
]
const initial = buildBoardState(groups, ['c4', 'c5'])
const order = containerOrder(['gA', 'gB'])

test('buildBoardState seeds unassigned + every group', () => {
  assert.deepEqual(initial[UNASSIGNED], ['c4', 'c5'])
  assert.deepEqual(initial['gA'], ['c1', 'c2'])
  assert.deepEqual(initial['gB'], ['c3'])
})

test('findContainer locates a competitor, null when absent', () => {
  assert.equal(findContainer(initial, 'c1'), 'gA')
  assert.equal(findContainer(initial, 'c4'), UNASSIGNED)
  assert.equal(findContainer(initial, 'nope'), null)
})

test('moveItem moves between containers (default: appended) without mutating input', () => {
  const snap = JSON.stringify(initial)
  const next = moveItem(initial, 'c4', 'gB')
  assert.deepEqual(next['gB'], ['c3', 'c4'])
  assert.deepEqual(next[UNASSIGNED], ['c5'])
  assert.equal(JSON.stringify(initial), snap) // original untouched
})

test('moveItem inserts at an explicit index', () => {
  const next = moveItem(initial, 'c4', 'gA', 1)
  assert.deepEqual(next['gA'], ['c1', 'c4', 'c2'])
})

test('moveItem within the same container reorders', () => {
  const next = moveItem(initial, 'c1', 'gA', 2)
  assert.deepEqual(next['gA'], ['c2', 'c1'])
})

test('shiftContainer moves to the next / previous container in order', () => {
  const toNext = shiftContainer(initial, 'c4', 1, order) // unassigned → gA
  assert.equal(findContainer(toNext, 'c4'), 'gA')
  const back = shiftContainer(toNext, 'c4', -1, order) // gA → unassigned
  assert.equal(findContainer(back, 'c4'), UNASSIGNED)
})

test('shiftContainer past the ends is a no-op', () => {
  const past = shiftContainer(initial, 'c4', -1, order) // already at unassigned (index 0)
  assert.equal(past, initial)
  const last = shiftContainer(initial, 'c3', 1, order) // gB is last container
  assert.equal(last, initial)
})

test('nudgeWithin reorders up / down inside a container', () => {
  const down = nudgeWithin(initial, 'c1', 1)
  assert.deepEqual(down['gA'], ['c2', 'c1'])
  const up = nudgeWithin(down, 'c1', -1)
  assert.deepEqual(up['gA'], ['c1', 'c2'])
  assert.equal(nudgeWithin(initial, 'c1', -1), initial) // already first → no-op
})

test('toAssignmentPayload serializes the board to the save shape (accessible == dnd)', () => {
  // Reach the same final state two ways: drag (moveItem) and keyboard (shiftContainer).
  const dragged = moveItem(moveItem(initial, 'c4', 'gA'), 'c5', 'gB')
  const keyboard = shiftContainer(shiftContainer(shiftContainer(initial, 'c5', 1, order), 'c5', 1, order), 'c4', 1, order)
  const p1 = toAssignmentPayload(dragged, ['gA', 'gB'])
  const p2 = toAssignmentPayload(keyboard, ['gA', 'gB'])
  assert.deepEqual(p1, p2)
  assert.deepEqual(p1, {
    groups: [
      { groupId: 'gA', competitorIds: ['c1', 'c2', 'c4'] },
      { groupId: 'gB', competitorIds: ['c3', 'c5'] },
    ],
    unassignedIds: [],
  })
})
