// ── Poker TRAINING scenarios (pure data) ─────────────────────────────────────────────────────
//
// PURE — scripted, deterministic teaching hands for the no-risk training table. Every scenario
// fixes the full 5-card board and each seat's hole cards, so the lesson always teaches the
// intended shape. Opponents act from these scripted per-seat lines (the trainer consumes each
// seat's actions in turn order); the learner's scripted line is the SUGGESTED "good" play the UI
// highlights, but the learner is free to deviate.
//
// Coins here are TRAINING chips (integers), never a wallet balance. Blinds are 50/100 so amounts
// read cleanly. Outcomes are asserted in scenarios.test.ts against the real settlement engine.

import type { TrainingScenario } from './trainer.ts'

export const TRAINING_SCENARIO_IDS = [
  'check_vs_call',
  'bet_vs_raise',
  'fold',
  'one_pair_kicker',
  'board_plays',
  'split_pot',
  'all_in',
  'main_side_pot',
  'min_raise',
  'auto_showdown',
] as const

export type TrainingScenarioId = (typeof TRAINING_SCENARIO_IDS)[number]

const BB = 100
const SB = 50

// 1 ─ Check versus Call ─ nothing-to-call ⇒ check; facing a bet ⇒ call.
const checkVsCall: TrainingScenario = {
  id: 'check_vs_call',
  bigBlind: BB,
  smallBlind: SB,
  buttonSeat: 0, // heads-up: button is the small blind and acts first pre-flop
  seats: [
    { seatIndex: 0, nameKey: 'you', stack: 10000, hole: ['Ah', 'Kd'], isLearner: true },
    { seatIndex: 1, nameKey: 'a', stack: 10000, hole: ['Qs', 'Jc'] },
  ],
  board: ['Ac', '7d', '2s', '9h', '3c'],
  script: [
    // learner (seat 0): call pre, check flop (nothing to call), call the turn bet, check river
    { seatIndex: 0, action: { type: 'call' } },
    { seatIndex: 0, action: { type: 'check' } },
    { seatIndex: 0, action: { type: 'call' } },
    { seatIndex: 0, action: { type: 'check' } },
    // opponent (seat 1): check pre, check flop, bet the turn, check river
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'bet', to: 200 } },
    { seatIndex: 1, action: { type: 'check' } },
  ],
  focusRuleIds: ['ACTION-CHECK-001', 'ACTION-CALL-001'],
}

// 2 ─ Bet versus Raise ─ opening a bet vs raising an existing bet.
const betVsRaise: TrainingScenario = {
  id: 'bet_vs_raise',
  bigBlind: BB,
  smallBlind: SB,
  buttonSeat: 0,
  seats: [
    { seatIndex: 0, nameKey: 'you', stack: 10000, hole: ['Kh', 'Kd'], isLearner: true },
    { seatIndex: 1, nameKey: 'a', stack: 10000, hole: ['Qs', 'Jd'] },
  ],
  board: ['Ks', '8c', '3d', '5h', '2c'],
  script: [
    // learner: call pre, BET the flop, CALL the raise, check turn + river
    { seatIndex: 0, action: { type: 'call' } },
    { seatIndex: 0, action: { type: 'bet', to: 100 } },
    { seatIndex: 0, action: { type: 'call' } },
    { seatIndex: 0, action: { type: 'check' } },
    { seatIndex: 0, action: { type: 'check' } },
    // opponent: check pre, then RAISE the learner's flop bet, check turn + river
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'raise', to: 300 } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
  ],
  focusRuleIds: ['ACTION-BET-001', 'RAISE-FULL-001'],
}

// 3 ─ Fold ─ giving up the hand; the last player standing wins with no showdown.
const fold: TrainingScenario = {
  id: 'fold',
  bigBlind: BB,
  smallBlind: SB,
  buttonSeat: 0,
  seats: [
    { seatIndex: 0, nameKey: 'you', stack: 10000, hole: ['7c', '2d'], isLearner: true },
    { seatIndex: 1, nameKey: 'a', stack: 10000, hole: ['As', 'Ad'] },
  ],
  board: ['Ac', 'Kd', 'Qs', '9h', '3c'],
  script: [
    // learner: call pre, then FOLD to the flop bet
    { seatIndex: 0, action: { type: 'call' } },
    { seatIndex: 0, action: { type: 'fold' } },
    // opponent: check pre, bet the flop (which takes the pot uncontested)
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'bet', to: 300 } },
  ],
  focusRuleIds: ['ACTION-FOLD-001', 'POT-ONELEFT-001'],
}

// 4 ─ One pair + kicker ─ same pair, the higher side card (kicker) wins.
const onePairKicker: TrainingScenario = {
  id: 'one_pair_kicker',
  bigBlind: BB,
  smallBlind: SB,
  buttonSeat: 0,
  seats: [
    { seatIndex: 0, nameKey: 'you', stack: 10000, hole: ['As', 'Kh'], isLearner: true }, // K's, A kicker
    { seatIndex: 1, nameKey: 'a', stack: 10000, hole: ['Kd', 'Qs'] }, // K's, Q kicker
  ],
  board: ['Kc', '9d', '4s', '2h', '7c'],
  script: [
    { seatIndex: 0, action: { type: 'call' } },
    { seatIndex: 0, action: { type: 'check' } },
    { seatIndex: 0, action: { type: 'check' } },
    { seatIndex: 0, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
  ],
  focusRuleIds: ['HAND-PAIR-001', 'HAND-KICKER-001'],
}

// 5 ─ Board plays ─ the 5 community cards are the best hand for everyone ⇒ split.
const boardPlays: TrainingScenario = {
  id: 'board_plays',
  bigBlind: BB,
  smallBlind: SB,
  buttonSeat: 0,
  seats: [
    { seatIndex: 0, nameKey: 'you', stack: 10000, hole: ['2c', '3d'], isLearner: true },
    { seatIndex: 1, nameKey: 'a', stack: 10000, hole: ['4h', '5c'] },
  ],
  board: ['As', 'Ks', 'Qs', 'Js', 'Ts'], // royal flush on the board — neither hole card improves it
  script: [
    { seatIndex: 0, action: { type: 'call' } },
    { seatIndex: 0, action: { type: 'check' } },
    { seatIndex: 0, action: { type: 'check' } },
    { seatIndex: 0, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
  ],
  focusRuleIds: ['HAND-INV-003', 'HAND-EXACT-TIE-001'],
}

// 6 ─ Split pot ─ two players make the identical hand from their own cards ⇒ chop.
const splitPot: TrainingScenario = {
  id: 'split_pot',
  bigBlind: BB,
  smallBlind: SB,
  buttonSeat: 0,
  seats: [
    { seatIndex: 0, nameKey: 'you', stack: 10000, hole: ['Ac', 'Kh'], isLearner: true },
    { seatIndex: 1, nameKey: 'a', stack: 10000, hole: ['Ad', 'Ks'] },
  ],
  board: ['Ah', 'Kd', '7c', '2s', '5h'], // both: two pair A+K, 7 kicker — identical
  script: [
    { seatIndex: 0, action: { type: 'call' } },
    { seatIndex: 0, action: { type: 'check' } },
    { seatIndex: 0, action: { type: 'check' } },
    { seatIndex: 0, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
  ],
  focusRuleIds: ['HAND-EXACT-TIE-001', 'POT-SPLIT-001'],
}

// 7 ─ All-in ─ commit the whole stack; the board runs out to showdown.
const allIn: TrainingScenario = {
  id: 'all_in',
  bigBlind: BB,
  smallBlind: SB,
  buttonSeat: 0,
  seats: [
    { seatIndex: 0, nameKey: 'you', stack: 1000, hole: ['Ah', 'Ad'], isLearner: true },
    { seatIndex: 1, nameKey: 'a', stack: 5000, hole: ['Kc', 'Kd'] },
  ],
  board: ['2c', '7d', '9s', 'Jh', '3c'],
  script: [
    { seatIndex: 0, action: { type: 'all_in' } },
    { seatIndex: 1, action: { type: 'call' } },
  ],
  focusRuleIds: ['ACTION-ALLIN-001', 'ROUND-ALLIN-RUNOUT-001'],
}

// 8 ─ Main + side pot ─ a short all-in caps the main pot; the deeper stacks build a side pot.
const mainSidePot: TrainingScenario = {
  id: 'main_side_pot',
  bigBlind: BB,
  smallBlind: SB,
  buttonSeat: 0, // 3-handed: SB = seat 1, BB = seat 2, first to act = button (seat 0)
  seats: [
    { seatIndex: 0, nameKey: 'you', stack: 1000, hole: ['Ah', 'Ad'], isLearner: true }, // short; best hand
    { seatIndex: 1, nameKey: 'a', stack: 5000, hole: ['Kh', 'Kd'] }, // wins the side pot
    { seatIndex: 2, nameKey: 'b', stack: 5000, hole: ['Qh', 'Qd'] },
  ],
  board: ['2c', '7d', '9s', 'Jh', '3c'],
  script: [
    // learner shoves the short stack all-in → eligible only for the capped main pot
    { seatIndex: 0, action: { type: 'all_in' } },
    // seat 1 raises past the short stack, seat 2 calls → they build a side pot only they contest
    { seatIndex: 1, action: { type: 'raise', to: 2000 } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 2, action: { type: 'call' } },
    { seatIndex: 2, action: { type: 'check' } },
    { seatIndex: 2, action: { type: 'check' } },
    { seatIndex: 2, action: { type: 'check' } },
  ],
  focusRuleIds: ['POT-SIDE-001', 'POT-MAIN-001'],
}

// 9 ─ Minimum raise ─ a raise must be at least the size of the previous bet/raise.
const minRaise: TrainingScenario = {
  id: 'min_raise',
  bigBlind: BB,
  smallBlind: SB,
  buttonSeat: 0,
  seats: [
    { seatIndex: 0, nameKey: 'you', stack: 10000, hole: ['Ah', 'Kh'], isLearner: true },
    { seatIndex: 1, nameKey: 'a', stack: 10000, hole: ['Qc', 'Jd'] },
  ],
  board: ['Ac', '8d', '3s', '5h', '2c'],
  script: [
    // learner: call pre, then the MINIMUM legal raise over the flop bet (100 → 200), check down
    { seatIndex: 0, action: { type: 'call' } },
    { seatIndex: 0, action: { type: 'raise', to: 200 } },
    { seatIndex: 0, action: { type: 'check' } },
    { seatIndex: 0, action: { type: 'check' } },
    // opponent: check pre, bet 100 into the flop, call the min-raise, check down
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'bet', to: 100 } },
    { seatIndex: 1, action: { type: 'call' } },
    { seatIndex: 1, action: { type: 'check' } },
    { seatIndex: 1, action: { type: 'check' } },
  ],
  focusRuleIds: ['RAISE-MIN-001', 'RAISE-FULL-001'],
}

// 10 ─ Automatic showdown ─ once everyone left is all-in there are no more decisions.
const autoShowdown: TrainingScenario = {
  id: 'auto_showdown',
  bigBlind: BB,
  smallBlind: SB,
  buttonSeat: 0,
  seats: [
    { seatIndex: 0, nameKey: 'you', stack: 2000, hole: ['Ah', 'Ad'], isLearner: true },
    { seatIndex: 1, nameKey: 'a', stack: 2000, hole: ['Kh', 'Kd'] },
  ],
  board: ['2c', '7d', '9s', 'Jh', '3c'],
  script: [
    { seatIndex: 0, action: { type: 'all_in' } },
    { seatIndex: 1, action: { type: 'call' } },
  ],
  focusRuleIds: ['ROUND-ALLIN-RUNOUT-001', 'SHOWDOWN-AUTO-001'],
}

export const TRAINING_SCENARIOS: readonly TrainingScenario[] = [
  checkVsCall,
  betVsRaise,
  fold,
  onePairKicker,
  boardPlays,
  splitPot,
  allIn,
  mainSidePot,
  minRaise,
  autoShowdown,
]

export function getTrainingScenario(id: string): TrainingScenario | null {
  return TRAINING_SCENARIOS.find((s) => s.id === id) ?? null
}
