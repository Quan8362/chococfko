import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRng } from '../../tlmn/ai/seededRandom.ts'
import { playBotHand, type BotHandConfig } from './runner.ts'
import { policyFor } from './policies.ts'
import { isSettlementConserved, type SeatContribution } from '../pot.ts'
import { playHand, type HandConfig } from '../engine.ts'

function config(seed: number, seatCount: number, difficulty: 'simulation' | 'easy' | 'normal' | 'hard'): BotHandConfig {
  return {
    seed,
    bigBlind: 100,
    buttonSeat: 0,
    seats: Array.from({ length: seatCount }, (_, i) => ({ seatIndex: i, stack: 10000, policy: policyFor(difficulty) })),
  }
}

test('a bot hand conserves coins and reports no defects (many seeds)', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const seatCount = 2 + (seed % 5)
    const out = playBotHand(config(seed, seatCount, 'simulation'), makeRng(seed))
    assert.deepEqual(out.defects, [], `defects on seed ${seed}: ${JSON.stringify(out.defects)}`)

    // Zero-sum: net stack change across all seats is exactly 0.
    let sum = 0
    for (const [, d] of out.stackDeltas) sum += d
    assert.equal(sum, 0, `hand ${seed} not zero-sum`)
  }
})

test('driver settlement matches the canonical scripted engine for the SAME action log', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const seatCount = 2 + (seed % 5)
    const cfg = config(seed, seatCount, 'simulation')
    const out = playBotHand(cfg, makeRng(seed))

    const handConfig: HandConfig = {
      seed: cfg.seed,
      bigBlind: cfg.bigBlind,
      buttonSeat: cfg.buttonSeat,
      seats: cfg.seats.map((s) => ({ seatIndex: s.seatIndex, stack: s.stack })),
    }
    const canonical = playHand(handConfig, out.actionLog)
    // Same board, same payouts, same refund — the cross-check the runner also performs internally.
    assert.deepEqual(canonical.board, out.board, `board mismatch seed ${seed}`)
    assert.deepEqual(
      [...canonical.showdown.payouts].sort((a, b) => a.seatIndex - b.seatIndex),
      [...out.showdown.payouts].sort((a, b) => a.seatIndex - b.seatIndex),
      `payout mismatch seed ${seed}`,
    )
    assert.deepEqual(canonical.showdown.refund, out.showdown.refund, `refund mismatch seed ${seed}`)
  }
})

test('recorded settlement passes the pure conservation invariant', () => {
  const out = playBotHand(config(77, 6, 'simulation'), makeRng(77))
  // Rebuild contributions from the outcome: committed = payout − delta (delta = payout − committed).
  const payout = new Map<number, number>()
  for (const p of out.showdown.payouts) payout.set(p.seatIndex, p.amount)
  const contribs: SeatContribution[] = []
  for (const [seat, delta] of out.stackDeltas) {
    const refund = out.showdown.refund && out.showdown.refund.seatIndex === seat ? out.showdown.refund.amount : 0
    const committed = (payout.get(seat) ?? 0) + refund - delta
    contribs.push({ seatIndex: seat, committed, folded: false })
  }
  assert.ok(isSettlementConserved(contribs, out.showdown.payouts, out.showdown.refund))
})

test('deterministic: same config + rng seed ⇒ identical outcome', () => {
  const a = playBotHand(config(42, 4, 'normal'), makeRng(42))
  const b = playBotHand(config(42, 4, 'normal'), makeRng(42))
  assert.deepEqual(a.actionLog, b.actionLog)
  assert.deepEqual(a.board, b.board)
  assert.deepEqual([...a.stackDeltas], [...b.stackDeltas])
})

test('a policy that always throws still yields a completed, conserved hand (safe fallback)', () => {
  const cfg: BotHandConfig = {
    seed: 5,
    bigBlind: 100,
    buttonSeat: 0,
    seats: Array.from({ length: 3 }, (_, i) => ({
      seatIndex: i,
      stack: 10000,
      policy: () => {
        throw new Error('bad bot')
      },
    })),
  }
  const out = playBotHand(cfg, makeRng(5))
  assert.deepEqual(out.defects, [])
  assert.ok(out.fallbacks > 0, 'expected safe fallbacks to have engaged')
  let sum = 0
  for (const [, d] of out.stackDeltas) sum += d
  assert.equal(sum, 0)
})
