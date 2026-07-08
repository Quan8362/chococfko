import test from 'node:test'
import assert from 'node:assert/strict'
import {
  operatorControlsFor, registrationOpen, canUnregister,
  participantDisplayState, hasTableAssignment,
  championEntryId, effectiveFinishingPlace,
  type EntryLike, type PayoutLike,
} from './uiModel.ts'

const entry = (over: Partial<EntryLike>): EntryLike =>
  ({ state: 'REGISTERED', finishing_place: null, table_no: null, seat_index: null, ...over })

// A place-1 PRIZE payout for `entryId` (the authoritative "won" record), plus optional others.
const prize = (entryId: string, place: number | null, amount = 0): PayoutLike =>
  ({ entry_id: entryId, place, amount, kind: 'prize' })

test('UIM-001 operator controls follow the FSM per state', () => {
  // No escrow held → a plain cancel is offered.
  const draft = operatorControlsFor('DRAFT', false).map((c) => c.key)
  assert.deepEqual(draft.sort(), ['cancel', 'schedule'])
  const regOpen = operatorControlsFor('REGISTRATION_OPEN', false).map((c) => c.key)
  assert.ok(regOpen.includes('start') && regOpen.includes('cancel'))
  const starting = operatorControlsFor('STARTING', false).map((c) => c.key)
  assert.ok(starting.includes('begin_play') && starting.includes('draw_seats'))
  const running = operatorControlsFor('RUNNING', false).map((c) => c.key)
  assert.ok(running.includes('advance_level') && running.includes('settle') && running.includes('final_table'))
  // terminal states expose no controls
  assert.equal(operatorControlsFor('COMPLETED').length, 0)
  assert.equal(operatorControlsFor('CANCELLED').length, 0)
})

test('UIM-002 cancel is marked destructive (needs confirmation)', () => {
  const cancel = operatorControlsFor('REGISTRATION_OPEN', false).find((c) => c.key === 'cancel')
  assert.ok(cancel?.destructive)
})

test('UIM-002b escrow held → recover_refund replaces plain cancel (never strand fees)', () => {
  // With escrow held, a plain cancel is NOT offered — only the refunding recovery control.
  const running = operatorControlsFor('RUNNING', true)
  assert.ok(!running.some((c) => c.key === 'cancel'), 'plain cancel must be hidden while escrow is held')
  const recover = running.find((c) => c.key === 'recover_refund')
  assert.ok(recover?.op === 'recover_refund' && recover?.destructive, 'recover_refund must be present + destructive')
  // Registration-open with escrow also routes to recovery (registered players already paid).
  const regOpen = operatorControlsFor('REGISTRATION_OPEN', true).map((c) => c.key)
  assert.ok(regOpen.includes('recover_refund') && !regOpen.includes('cancel'))
  // The default (unknown escrow) is fail-safe: prefer the refunding path.
  assert.ok(operatorControlsFor('RUNNING').some((c) => c.key === 'recover_refund'))
})

test('UIM-002c deal_next (manual next-hand recovery) is offered during live play only', () => {
  for (const s of ['RUNNING', 'BREAK', 'FINAL_TABLE'] as const) {
    assert.ok(operatorControlsFor(s, false).some((c) => c.op === 'deal_next'), `deal_next expected in ${s}`)
  }
  for (const s of ['DRAFT', 'REGISTRATION_OPEN', 'STARTING', 'COMPLETED', 'CANCELLED'] as const) {
    assert.ok(!operatorControlsFor(s, false).some((c) => c.op === 'deal_next'), `deal_next must NOT appear in ${s}`)
  }
})

test('UIM-003 registrationOpen requires REGISTRATION_OPEN and room', () => {
  assert.equal(registrationOpen('REGISTRATION_OPEN', 3, 6), true)
  assert.equal(registrationOpen('REGISTRATION_OPEN', 6, 6), false) // full
  assert.equal(registrationOpen('RUNNING', 1, 6), false)          // wrong state
})

test('UIM-004 canUnregister only pre-start for a live registration', () => {
  assert.equal(canUnregister('REGISTRATION_OPEN', 'REGISTERED'), true)
  assert.equal(canUnregister('STARTING', 'SEATED'), true)
  assert.equal(canUnregister('RUNNING', 'ACTIVE'), false)         // too late
  assert.equal(canUnregister('REGISTRATION_OPEN', null), false)   // not registered
  assert.equal(canUnregister('REGISTRATION_OPEN', 'ELIMINATED'), false)
})

test('UIM-005 participant display state', () => {
  assert.equal(participantDisplayState('REGISTRATION_OPEN', null), 'not_registered')
  assert.equal(participantDisplayState('REGISTRATION_OPEN', entry({})), 'registered')
  assert.equal(participantDisplayState('STARTING', entry({ state: 'REGISTERED' })), 'waiting')
  assert.equal(participantDisplayState('RUNNING', entry({ state: 'SEATED', table_no: 1, seat_index: 2 })), 'seated')
  assert.equal(participantDisplayState('RUNNING', entry({ state: 'ELIMINATED', finishing_place: 4 })), 'eliminated')
  assert.equal(participantDisplayState('COMPLETED', entry({ state: 'PAID', finishing_place: 1 })), 'champion')
  assert.equal(participantDisplayState('COMPLETED', entry({ state: 'PAID', finishing_place: 3 })), 'eliminated')
  assert.equal(participantDisplayState('REGISTRATION_OPEN', entry({ state: 'WITHDRAWN' })), 'withdrawn')
})

test('UIM-006 hasTableAssignment only when live + seated', () => {
  assert.equal(hasTableAssignment(entry({ state: 'SEATED', table_no: 1, seat_index: 0 })), true)
  assert.equal(hasTableAssignment(entry({ state: 'ELIMINATED', table_no: 1, seat_index: 0 })), false)
  assert.equal(hasTableAssignment(entry({ state: 'REGISTERED' })), false)
})

// ── Winner-status remediation (27G-L) — the champion is derived from the authoritative place-1
// PRIZE payout because settlement leaves the last survivor's finishing_place NULL. ──────────────

test('UIM-007 championEntryId returns the unique place-1 prize entry', () => {
  const payouts: PayoutLike[] = [prize('W', 1, 2), prize('L', 2, 0)]
  assert.equal(championEntryId(payouts), 'W')
})

test('UIM-008 championEntryId returns null when unsettled / no place-1 prize', () => {
  assert.equal(championEntryId([]), null)
  assert.equal(championEntryId([prize('L', 2, 0)]), null)
  // A place-1 row that is NOT a prize (e.g. a refund) does not crown anyone.
  assert.equal(championEntryId([{ entry_id: 'X', place: 1, amount: 5, kind: 'refund' }]), null)
})

test('UIM-009 championEntryId fails safe on contradictory duplicate place-1 data', () => {
  // Two distinct entries both claim a place-1 prize → no champion is promoted (safe invariant fail).
  assert.equal(championEntryId([prize('A', 1, 2), prize('B', 1, 2)]), null)
  // But the SAME entry appearing twice at place 1 is still a single, unambiguous winner.
  assert.equal(championEntryId([prize('A', 1, 2), prize('A', 1, 2)]), 'A')
})

test('UIM-010 effectiveFinishingPlace resolves champion→1 and never invents rank 0', () => {
  assert.equal(effectiveFinishingPlace('W', null, 'W'), 1)   // champion, NULL finish → 1
  assert.equal(effectiveFinishingPlace('L', 2, 'W'), 2)      // explicit place preserved
  assert.equal(effectiveFinishingPlace('X', null, 'W'), null) // non-champion, no place → null (not 0)
  assert.equal(effectiveFinishingPlace('X', null, null), null) // unsettled → null
})

test('UIM-011 PAID champion with NULL finishing_place + place-1 payout → champion (the 27G-K bug)', () => {
  // Exactly the production shape: PAID, finishing_place NULL, holds the place-1 prize.
  const champ = entry({ state: 'PAID', finishing_place: null, table_no: null, seat_index: null })
  assert.equal(participantDisplayState('COMPLETED', champ, true), 'champion')
})

test('UIM-012 PAID champion with explicit finishing_place 1 → champion (no payout signal needed)', () => {
  assert.equal(participantDisplayState('COMPLETED', entry({ state: 'PAID', finishing_place: 1 }), false), 'champion')
})

test('UIM-013 loser with finishing_place 2 → eliminated, never promoted', () => {
  assert.equal(participantDisplayState('COMPLETED', entry({ state: 'PAID', finishing_place: 2 }), false), 'eliminated')
  assert.equal(participantDisplayState('COMPLETED', entry({ state: 'ELIMINATED', finishing_place: 4 }), false), 'eliminated')
})

test('UIM-014 completed zero-payout loser is never champion', () => {
  const payouts: PayoutLike[] = [prize('W', 1, 2), prize('L', 2, 0)]
  const championId = championEntryId(payouts) // 'W'
  const loser = entry({ state: 'PAID', finishing_place: 2 })
  assert.equal(participantDisplayState('COMPLETED', loser, 'L' === championId), 'eliminated')
})

test('UIM-015 incomplete tournament shows no terminal winner result', () => {
  // No payouts yet → isChampion false; a seated/registered player never reads as champion/eliminated.
  assert.equal(participantDisplayState('RUNNING', entry({ state: 'SEATED', table_no: 1, seat_index: 0 }), false), 'seated')
  assert.equal(participantDisplayState('REGISTRATION_OPEN', entry({ state: 'REGISTERED' }), false), 'registered')
  assert.equal(participantDisplayState('STARTING', entry({ state: 'REGISTERED' }), false), 'waiting')
})

test('UIM-016 spectator / operator (no entry) gets no participant-only result', () => {
  assert.equal(participantDisplayState('COMPLETED', null, false), 'not_registered')
  assert.equal(participantDisplayState('COMPLETED', null, true), 'not_registered')
})

test('UIM-017 no valid state renders rank 0 (contradictory data → safe non-champion, place null)', () => {
  // Contradictory payouts → no champion id; the real winner (PAID, NULL finish) renders eliminated
  // (safe: not a false champion) and effectiveFinishingPlace yields null — never 0 — so the banner
  // falls back to the generic elimination copy.
  const championId = championEntryId([prize('A', 1, 2), prize('B', 1, 2)]) // null
  const winnerA = entry({ state: 'PAID', finishing_place: null })
  assert.equal(participantDisplayState('COMPLETED', winnerA, 'A' === championId), 'eliminated')
  assert.equal(effectiveFinishingPlace('A', null, championId), null)
})

test('UIM-018 historical-tournament-shaped fixture (0c713712) → champion sees rank 1, loser rank 2', () => {
  // Real shape: champion PAID finishing_place NULL chips>0 place-1 prize; loser PAID place 2 chips 0.
  const payouts: PayoutLike[] = [prize('champ', 1, 2), prize('loser', 2, 0)]
  const championId = championEntryId(payouts)
  assert.equal(championId, 'champ')
  const champ = entry({ state: 'PAID', finishing_place: null })
  const loser = entry({ state: 'PAID', finishing_place: 2 })
  assert.equal(participantDisplayState('COMPLETED', champ, 'champ' === championId), 'champion')
  assert.equal(participantDisplayState('COMPLETED', loser, 'loser' === championId), 'eliminated')
  assert.equal(effectiveFinishingPlace('champ', null, championId), 1)
  assert.equal(effectiveFinishingPlace('loser', 2, championId), 2)
})

test('UIM-019 27G-K-tournament-shaped fixture (9309f7f7) → identical HU heads-up result', () => {
  // 27G-K beta: same heads-up shape, verifies the fix covers the blocked tournament.
  const payouts: PayoutLike[] = [prize('beta_champ', 1, 2), prize('beta_loser', 2, 0)]
  const championId = championEntryId(payouts)
  const champ = entry({ state: 'PAID', finishing_place: null, table_no: null, seat_index: null })
  assert.equal(participantDisplayState('COMPLETED', champ, 'beta_champ' === championId), 'champion')
  // Standings ordering: champion sorts to rank 1 ahead of the loser (was previously last via NULL).
  const rows = [
    { id: 'beta_loser', fp: 2 as number | null },
    { id: 'beta_champ', fp: null as number | null },
  ]
    .map((r) => ({ id: r.id, place: effectiveFinishingPlace(r.id, r.fp, championId) }))
    .sort((a, b) => (a.place ?? 999) - (b.place ?? 999))
  assert.deepEqual(rows.map((r) => r.id), ['beta_champ', 'beta_loser'])
  assert.equal(rows[0].place, 1)
})
