// ── Poker AUTHORITATIVE-ENGINE CPU microbenchmark (PURE, runnable locally) ──────────────
//
// Measures the CPU cost of the server-authoritative work that runs INSIDE each poker command:
// dealing, per-street betting transitions, and (the heaviest part) the showdown evaluator. This
// is the only load-test component that can be measured deterministically without a live
// staging DB / realtime backend, so it anchors the capacity model's "engine time per action /
// per hand" term with a REAL number instead of a guess.
//
// It exercises the exact pure functions the server calls (lib/games/poker: initHand,
// applyPlayerAction, nextStep, enterStreet, settleShowdown, makeSecureShuffleAdapter, deal) —
// the same code path as app/games/poker/actions.ts. No DB, no network, no secrets.
//
// Run:  node scripts/poker-load/engine-bench.ts            (default iterations)
//       node scripts/poker-load/engine-bench.ts 50000      (custom hand count)
//
// Output is plain text + a JSON summary line (prefixed BENCH_JSON=) so results.md can quote
// exact figures and CI can diff them.

import { makeDeck, makeSecureShuffleAdapter, mulberry32, deal, type DealtCards } from '../../lib/games/poker/deck.ts'
import {
  initHand,
  applyPlayerAction,
  nextStep,
  enterStreet,
  markComplete,
  legalActionModel,
  handContributions,
  type HandState,
} from '../../lib/games/poker/hand.ts'
import { settleShowdown } from '../../lib/games/poker/showdown.ts'
import type { Card } from '../../lib/games/poker/types.ts'
import type { SeatContribution } from '../../lib/games/poker/pot.ts'

// ── helpers ─────────────────────────────────────────────────────────────────────────────

function hrMs(): number {
  return Number(process.hrtime.bigint()) / 1e6
}

interface Stat {
  readonly n: number
  readonly totalMs: number
  readonly perMs: number // mean ms per op
  readonly opsPerSec: number
  readonly p50: number
  readonly p95: number
  readonly p99: number
}

function summarize(samples: number[], totalMs: number): Stat {
  const s = [...samples].sort((a, b) => a - b)
  const n = s.length
  const at = (q: number) => s[Math.min(n - 1, Math.max(0, Math.floor(q * n)))]
  return {
    n,
    totalMs,
    perMs: totalMs / n,
    opsPerSec: (n / totalMs) * 1000,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
  }
}

function fmt(label: string, st: Stat): string {
  return (
    `${label.padEnd(34)} n=${String(st.n).padStart(7)}  ` +
    `mean=${st.perMs.toFixed(4)}ms  ` +
    `p50=${st.p50.toFixed(4)}  p95=${st.p95.toFixed(4)}  p99=${st.p99.toFixed(4)}  ` +
    `${Math.round(st.opsPerSec).toLocaleString()} ops/s`
  )
}

// Deterministic-but-varied shuffle: mulberry32 seeded per iteration (NOT crypto — this is a
// benchmark, so we want reproducibility; production uses the CSPRNG adapter, which is a strictly
// slower source but the shuffle algorithm/work is identical).
function dealFor(seatCount: number, seed: number): DealtCards {
  const adapter = makeSecureShuffleAdapter(mulberry32(seed))
  const shuffled = adapter(makeDeck())
  return deal(shuffled, seatCount)
}

function boardFull(d: DealtCards): Card[] {
  return [...d.flop, d.turn, d.river]
}

function streetCards(full: readonly Card[], street: 'FLOP' | 'TURN' | 'RIVER'): Card[] {
  if (street === 'FLOP') return full.slice(0, 3) as Card[]
  if (street === 'TURN') return [full[3]] as Card[]
  return [full[4]] as Card[]
}

// ── Bench 1: full check/call-down hand through the step-wise controller (any seat count) ──
// Mirrors runEngineToPause() in actions.ts: nextStep → apply (auto check/call) → enterStreet →
// settleShowdown. This is the exact per-hand authoritative CPU cost the server pays.
function playCheckedDownHand(seatCount: number, seed: number): void {
  const dealt = dealFor(seatCount, seed)
  const full = boardFull(dealt)
  const holeBySeat = new Map<number, readonly [Card, Card]>()
  dealt.holeBySeat.forEach((h, i) => holeBySeat.set(i, h))

  const { state: init } = initHand({
    handNo: 1,
    bigBlind: 100,
    buttonSeat: 0,
    seats: Array.from({ length: seatCount }, (_, i) => ({ seatIndex: i, stack: 10_000 })),
  })
  let state: HandState = init
  let guard = 0

  for (;;) {
    if (++guard > 60) throw new Error('bench: hand did not terminate')
    const step = nextStep(state)

    if (step.kind === 'await_action') {
      const model = legalActionModel(state)
      if (!model) throw new Error('bench: no legal model on await_action')
      // Passive line: check when free, otherwise call — always legal, drives to showdown.
      const type = model.allowed.includes('check') ? 'check' : 'call'
      const res = applyPlayerAction(state, model.seatIndex, { type })
      if (!res.ok) throw new Error(`bench: illegal auto action: ${res.error}`)
      state = res.state
      continue
    }

    if (step.kind === 'deal' || step.kind === 'runout') {
      const street =
        step.kind === 'runout'
          ? state.street === 'PREFLOP'
            ? 'FLOP'
            : state.street === 'FLOP'
              ? 'TURN'
              : 'RIVER'
          : (step.street as 'FLOP' | 'TURN' | 'RIVER')
      state = enterStreet(state, street, streetCards(full, street))
      continue
    }

    // showdown | one_left → settle authoritatively
    const contribs: SeatContribution[] = handContributions(state).map((c) => ({
      seatIndex: c.seatIndex,
      committed: c.committed,
      folded: c.folded,
    }))
    settleShowdown({
      contribs,
      board: state.board,
      holeBySeat,
      buttonSeat: state.buttonSeat,
    })
    markComplete(state)
    return
  }
}

// ── Bench 2: showdown evaluator alone (2..6 contenders) — heaviest per-hand CPU term ─────
function benchShowdown(contenders: number, iters: number): Stat {
  const samples: number[] = []
  const t0 = hrMs()
  for (let i = 0; i < iters; i++) {
    const dealt = dealFor(contenders, i + 1)
    const holeBySeat = new Map<number, readonly [Card, Card]>()
    dealt.holeBySeat.forEach((h, s) => holeBySeat.set(s, h))
    const contribs: SeatContribution[] = Array.from({ length: contenders }, (_, s) => ({
      seatIndex: s,
      committed: 200,
      folded: false,
    }))
    const a = hrMs()
    settleShowdown({ contribs, board: boardFull(dealt), holeBySeat, buttonSeat: 0 })
    samples.push(hrMs() - a)
  }
  return summarize(samples, hrMs() - t0)
}

// ── Bench 3: secure shuffle + deal (per-hand setup cost) ─────────────────────────────────
function benchShuffleDeal(seatCount: number, iters: number): Stat {
  const samples: number[] = []
  const t0 = hrMs()
  for (let i = 0; i < iters; i++) {
    const a = hrMs()
    dealFor(seatCount, i + 1)
    samples.push(hrMs() - a)
  }
  return summarize(samples, hrMs() - t0)
}

// ── driver ───────────────────────────────────────────────────────────────────────────────
function benchHands(seatCount: number, iters: number): Stat {
  const samples: number[] = []
  const t0 = hrMs()
  for (let i = 0; i < iters; i++) {
    const a = hrMs()
    playCheckedDownHand(seatCount, i + 1)
    samples.push(hrMs() - a)
  }
  return summarize(samples, hrMs() - t0)
}

function main(): void {
  const iters = Math.max(1000, Number(process.argv[2]) || 20_000)
  // warm up JIT
  for (let i = 0; i < 2000; i++) playCheckedDownHand(6, i + 1)

  console.log(`\nPoker authoritative-engine CPU microbenchmark  (iterations=${iters})`)
  console.log(`node ${process.version}  ${new Date().toISOString()}\n`)

  console.log('── Full check/call-down hand (initHand → betting → showdown), per seat count ──')
  const handStats: Record<string, Stat> = {}
  for (const seats of [2, 3, 6]) {
    const st = benchHands(seats, iters)
    handStats[`hand_${seats}p`] = st
    console.log(fmt(`  full hand ${seats}-handed`, st))
  }

  console.log('\n── Showdown evaluator only, by contender count (heaviest term) ──')
  const sdStats: Record<string, Stat> = {}
  for (const c of [2, 3, 4, 5, 6]) {
    const st = benchShowdown(c, iters)
    sdStats[`showdown_${c}`] = st
    console.log(fmt(`  showdown ${c} contenders`, st))
  }

  console.log('\n── Secure shuffle + deal ──')
  const shuffle6 = benchShuffleDeal(6, iters)
  console.log(fmt('  shuffle+deal 6 seats', shuffle6))

  const summary = {
    node: process.version,
    iters,
    hands: Object.fromEntries(Object.entries(handStats).map(([k, v]) => [k, round(v)])),
    showdown: Object.fromEntries(Object.entries(sdStats).map(([k, v]) => [k, round(v)])),
    shuffleDeal6: round(shuffle6),
  }
  console.log('\nBENCH_JSON=' + JSON.stringify(summary))
}

function round(st: Stat) {
  return {
    meanMs: +st.perMs.toFixed(5),
    p95Ms: +st.p95.toFixed(5),
    p99Ms: +st.p99.toFixed(5),
    opsPerSec: Math.round(st.opsPerSec),
  }
}

main()
