// ── Poker PRACTICE table classification & seat-boundary guards (pure) ──────────────────
//
// PURE module — no React, no Supabase, no clock. Tested by classification.test.ts.
//
// The authoritative rules that keep practice and cash strictly separated:
//   • bots may sit ONLY at a practice table (`kind === 'practice'`);
//   • a cash-game table can never be represented as practice and vice-versa;
//   • classification (kind + which seats are bots) is IMMUTABLE once the first hand starts;
//   • the client can never assert a table's kind — the server owns the config object.
//
// These guards are called by the runtime on every start/act/join path so a hand-crafted request
// cannot smuggle a bot into a human game or flip a live table's economy.

import type { PracticeTableConfig, PracticeSeat } from './types.ts'
import { isBotSeat } from './types.ts'
import type { BotDifficulty } from '../bot/policy.ts'

// Difficulties permitted for a USER-FACING practice table. 'simulation' is the TEST-ONLY random
// policy and is never allowed to face a human (mirrors admin.ts for cash config).
export const PRACTICE_ALLOWED_DIFFICULTIES: readonly BotDifficulty[] = ['easy', 'normal', 'hard']

export interface ClassificationCheck {
  readonly ok: boolean
  readonly errors: readonly string[]
}

// A table intended for bot play MUST be classified practice. Any other value is a cash table and
// is rejected outright — the single structural gate that keeps bots out of human cash tables.
export function assertPracticeKind(kind: string): void {
  if (kind !== 'practice') {
    throw new Error(`practice: bots are only permitted on a practice table, got kind="${kind}"`)
  }
}

// Full validation of a practice table configuration. Returns every problem so an admin/UI can show
// them together. Enforces the fairness + isolation invariants.
export function validatePracticeConfig(config: PracticeTableConfig): ClassificationCheck {
  const errors: string[] = []

  if (config.kind !== 'practice') errors.push('kind must be "practice"')
  if (!Number.isInteger(config.bigBlind) || config.bigBlind <= 0) errors.push('bigBlind must be a positive integer')
  if (!Number.isInteger(config.smallBlind) || config.smallBlind <= 0) errors.push('smallBlind must be a positive integer')
  if (config.smallBlind > config.bigBlind) errors.push('smallBlind cannot exceed bigBlind')
  if (!Number.isInteger(config.startingStack) || config.startingStack <= 0) errors.push('startingStack must be a positive integer')
  if (!Number.isInteger(config.actionTimeMs) || config.actionTimeMs < 0) errors.push('actionTimeMs must be a non-negative integer')

  const seats = config.seats
  if (seats.length < 2 || seats.length > 6) errors.push('a practice table needs 2..6 seats')

  const seatIndexes = seats.map((s) => s.seatIndex)
  if (new Set(seatIndexes).size !== seatIndexes.length) errors.push('duplicate seat index')

  let humans = 0
  let bots = 0
  for (const seat of seats) {
    if (!Number.isInteger(seat.stack) || seat.stack < 0) errors.push(`seat ${seat.seatIndex}: stack must be a non-negative integer`)
    if (seat.occupant.kind === 'human') {
      humans += 1
    } else {
      bots += 1
      if (!PRACTICE_ALLOWED_DIFFICULTIES.includes(seat.occupant.difficulty)) {
        errors.push(`seat ${seat.seatIndex}: difficulty "${seat.occupant.difficulty}" is not allowed at a practice table`)
      }
    }
  }
  // A practice table that a human enters must contain at least one human and at least one bot
  // (otherwise it is either an all-bot sim — which uses the sim harness, not this path — or a
  // human game, which must use the cash path).
  if (humans < 1) errors.push('a practice table must seat at least one human')
  if (bots < 1) errors.push('a practice table must seat at least one bot')

  return { ok: errors.length === 0, errors }
}

// A bot may occupy this seat ONLY if the table is practice. Called before a bot acts.
export function assertBotSeatAllowed(config: PracticeTableConfig, seat: PracticeSeat): void {
  assertPracticeKind(config.kind)
  if (!isBotSeat(seat)) throw new Error(`practice: seat ${seat.seatIndex} is not a bot seat`)
}

// Reject any attempt to convert/relabel a table once a hand has begun. The runtime calls this on
// every action: `startedHandNo > 0` means the classification is frozen. A change to kind, seat
// count, seat kind (human↔bot), or bot difficulty is refused.
export function assertClassificationImmutable(
  before: PracticeTableConfig,
  after: PracticeTableConfig,
  startedHandNo: number,
): void {
  if (startedHandNo <= 0) return // pre-first-hand edits are allowed (table setup)
  if (before.kind !== after.kind) throw new Error('practice: table kind is immutable after the first hand')
  if (before.seats.length !== after.seats.length) throw new Error('practice: seat count is immutable after the first hand')
  const byIndex = new Map(after.seats.map((s) => [s.seatIndex, s]))
  for (const b of before.seats) {
    const a = byIndex.get(b.seatIndex)
    if (!a) throw new Error(`practice: seat ${b.seatIndex} vanished (immutable after start)`)
    if (a.occupant.kind !== b.occupant.kind) throw new Error(`practice: seat ${b.seatIndex} kind changed (immutable after start)`)
    if (a.occupant.kind === 'bot' && b.occupant.kind === 'bot' && a.occupant.difficulty !== b.occupant.difficulty) {
      throw new Error(`practice: seat ${b.seatIndex} bot difficulty changed (immutable after start)`)
    }
  }
}

// Guard used by the CASH path integration point: a cash table must never accept a bot occupant.
// (The cash seat model has no bot representation, so this is belt-and-suspenders for any future
// shared code that might receive an occupant descriptor.)
export function assertNoBotOnCashTable(tableKind: string, occupantKind: string): void {
  if (tableKind !== 'practice' && occupantKind === 'bot') {
    throw new Error('practice: a bot may never occupy a non-practice (cash) seat')
  }
}
