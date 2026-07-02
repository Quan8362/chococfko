import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { startTraining, trainingApply, suggestedLearnerAction, trainingView, type TrainingSession } from './trainer.ts'
import { TRAINING_SCENARIOS, getTrainingScenario } from './scenarios.ts'
import {
  UX_SIGNAL_NAMES,
  isUxSignalName,
  buildUxSignal,
} from '../uxSignals.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

// ── SAFETY: the whole learning subsystem is a sealed, in-memory sandbox ─────────────────────────
// Structurally prove there is NO path from lib/games/poker/learn to a wallet, ledger, database,
// server action, network, or randomness. If none of these can be imported, training CANNOT mutate
// a wallet or a production statistic — the strongest possible form of the "no value transfer" rule.
test('no learn/* module imports a wallet, DB, server, or network dependency', () => {
  const forbidden = [
    /from ['"].*supabase/i,
    /createClient|createAdminClient/,
    /coin_ledger|game_wallets|round_settlements|poker_hands|poker_tables/,
    /['"]next\//,
    /use server/,
    /fetch\(/,
    /Math\.random/,
  ]
  const files = readdirSync(HERE).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  assert.ok(files.length >= 5, 'found the learn modules')
  for (const f of files) {
    const src = readFileSync(join(HERE, f), 'utf8')
    for (const pat of forbidden) {
      assert.ok(!pat.test(src), `${f} must not match ${pat}`)
    }
  }
})

// ── SAFETY: reveal-safety across the ENTIRE session lifecycle ───────────────────────────────────
// At no point before the showdown reveal may an opponent's hole cards surface in the VIEW. Drive
// each scenario action-by-action and inspect every intermediate view.
function drive(id: string, onView: (v: ReturnType<typeof trainingView>, settled: boolean) => void): TrainingSession {
  let s = startTraining(getTrainingScenario(id)!)
  onView(trainingView(s), !!s.settled)
  for (let g = 0; g < 50 && !s.settled; g++) {
    if (s.state.turnSeat !== s.learnerSeat) break
    const res = trainingApply(s, suggestedLearnerAction(s)!)
    assert.ok(res.ok)
    s = (res as { session: TrainingSession }).session
    onView(trainingView(s), !!s.settled)
  }
  return s
}

test('opponent hole cards never appear in any pre-showdown view, for every scenario', () => {
  for (const scenario of TRAINING_SCENARIOS) {
    drive(scenario.id, (view, settled) => {
      for (const seat of view.seats) {
        if (seat.isLearner) {
          assert.ok(seat.cards, `${scenario.id}: learner always sees own cards`)
        } else if (!settled) {
          assert.equal(seat.cards, null, `${scenario.id}: opponent cards hidden before settlement`)
        }
      }
    })
  }
})

test('after settlement, only LEGALLY revealed contenders are face-up (folded/mucked stay hidden)', () => {
  // fold scenario: winner takes it uncontested and must NOT be revealed
  const s = drive('fold', () => {})
  const view = trainingView(s)
  assert.ok(s.settled)
  for (const seat of view.seats) {
    if (!seat.isLearner) assert.equal(seat.cards, null, 'uncontested winner never shows (POT-ONELEFT-001)')
  }
})

// ── SAFETY: training chips are conserved and integer (COIN-INT-001) ─────────────────────────────
test('training chips are integers and conserved on the table', () => {
  for (const scenario of TRAINING_SCENARIOS) {
    let s = startTraining(scenario)
    for (let g = 0; g < 50 && !s.settled; g++) {
      if (s.state.turnSeat !== s.learnerSeat) break
      s = (trainingApply(s, suggestedLearnerAction(s)!) as { session: TrainingSession }).session
    }
    const started = scenario.seats.reduce((sum, seat) => sum + seat.stack, 0)
    const survivingStacks = s.state.round.players.reduce((sum, p) => sum + p.stack, 0)
    const payouts = (s.settled?.payouts ?? []).reduce((sum, p) => sum + p.amount, 0)
    const refund = s.settled?.refund?.amount ?? 0
    assert.equal(survivingStacks + payouts + refund, started, `${scenario.id}: chips conserved`)
    for (const p of s.state.round.players) assert.ok(Number.isInteger(p.stack), 'integer stacks')
    for (const p of s.settled?.payouts ?? []) assert.ok(Number.isInteger(p.amount), 'integer payouts')
  }
})

// ── Onboarding analytics taxonomy is wired and privacy-safe ─────────────────────────────────────
test('learning analytics signal names are registered and numbers-only', () => {
  for (const name of [
    'onboarding_started',
    'onboarding_step_viewed',
    'onboarding_completed',
    'onboarding_skipped',
    'training_scenario_started',
    'training_scenario_completed',
    'help_topic_opened',
  ] as const) {
    assert.ok(UX_SIGNAL_NAMES.includes(name), `${name} is registered`)
    assert.ok(isUxSignalName(name))
  }
  // A signal cannot carry a card string even if one is passed as detail.
  const rec = buildUxSignal({ name: 'help_topic_opened', at: 1, detail: { topic: 3, card: 'As' as unknown as number } })
  assert.ok(rec)
  assert.equal(rec!.detail.topic, 3)
  assert.equal('card' in rec!.detail, false)
})
