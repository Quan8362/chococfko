// ─────────────────────────────────────────────────────────────────────────────
// Centralised, documented, tunable strategy weights.
//
// The bot's strategy lives HERE as data, not as constants scattered through the
// scoring code. The optimizer searches this space; production loads a frozen,
// versioned configuration. Every weight has: a reason, a default, and a tuning
// range (used by the optimizer to clamp mutations). Higher = more of that goal.
// ─────────────────────────────────────────────────────────────────────────────

export interface BotStrategyWeights {
  immediateWin: number              // taking a move that empties the hand now
  preventImmediateLoss: number      // stopping an opponent who can finish next
  cardsRemoved: number              // shedding more cards per turn
  reduceTurnsToFinish: number       // lowering estimated remaining turns (key tidiness)
  maintainControl: number           // keeping the lead (opponents likely to pass)
  regainControl: number             // taking back a trick when worthwhile
  blockOneCardOpponent: number      // hard-to-beat lead vs a 1-card opponent
  blockTwoCardOpponent: number      // pressure vs a 2-card opponent
  removeWeakSingles: number         // value of getting rid of low lone cards
  preservePair: number              // value of keeping a pair intact
  preserveTriple: number            // value of keeping a triple intact
  preserveStraight: number          // value of keeping straight material
  preserveBomb: number              // value of keeping a bomb in reserve
  breakCombinationPenalty: number   // penalty for fragmenting a useful group
  highCardCost: number              // discourage burning high cards needlessly
  wasteTwoPenalty: number           // discourage spending a 2 (heo) early
  unsafeSingleLeadPenalty: number   // discourage low-single leads when dangerous
  seatOrderDanger: number           // weight of who acts right after us
  opponentMatchProbability: number  // weight of estimated opponent answer odds
  futureFlexibility: number         // value of keeping varied future options
}

export interface WeightSpec { min: number; max: number; reason: string }

// Allowed tuning ranges + the rationale for each lever. The optimizer clamps to these.
export const WEIGHT_SPECS: Record<keyof BotStrategyWeights, WeightSpec> = {
  immediateWin: { min: 500, max: 5000, reason: 'Going out wins the round; must dominate all else.' },
  preventImmediateLoss: { min: 200, max: 3000, reason: 'Blocking a finishing opponent is second only to winning.' },
  cardsRemoved: { min: 0, max: 30, reason: 'Fewer cards is progress, but raw count must not beat structure.' },
  reduceTurnsToFinish: { min: 4, max: 40, reason: 'Primary tidiness signal: minimise plays left to empty the hand.' },
  maintainControl: { min: 0, max: 60, reason: 'Holding the lead lets us dictate shapes and dump safely.' },
  regainControl: { min: 0, max: 40, reason: 'Taking a trick back is worth something when cheap.' },
  blockOneCardOpponent: { min: 50, max: 800, reason: 'A 1-card opponent can win on any beatable lead — deny hard.' },
  blockTwoCardOpponent: { min: 0, max: 300, reason: 'A 2-card opponent is dangerous but less acute.' },
  removeWeakSingles: { min: 0, max: 30, reason: 'Low lone cards are liabilities; shed them while leading.' },
  preservePair: { min: 0, max: 25, reason: 'Pairs are flexible answers; keep them unless shedding is better.' },
  preserveTriple: { min: 0, max: 40, reason: 'Triples are scarce strong answers; keep intact.' },
  preserveStraight: { min: 0, max: 40, reason: 'Straights clear many cards; do not fragment cheaply.' },
  preserveBomb: { min: 0, max: 120, reason: 'Bombs are the strongest reserve; spend only when justified.' },
  breakCombinationPenalty: { min: 0, max: 80, reason: 'Fragmenting a group usually worsens the hand.' },
  highCardCost: { min: 0, max: 12, reason: 'Spending Ks/As/2s early reduces late-game power.' },
  wasteTwoPenalty: { min: 0, max: 200, reason: 'A 2 (heo) is a premium stopper; rarely spend it early.' },
  unsafeSingleLeadPenalty: { min: 0, max: 400, reason: 'A low single lead hands tempo to a dangerous opponent.' },
  seatOrderDanger: { min: 0, max: 60, reason: 'The player right after us matters most for control.' },
  opponentMatchProbability: { min: 0, max: 60, reason: 'Weight the estimated odds an opponent can answer.' },
  futureFlexibility: { min: 0, max: 30, reason: 'Keeping varied options avoids being forced into bad plays.' },
}

// ── DEFAULT_WEIGHTS — a sane, hand-authored baseline (difficulty "normal"/"hard"
// start here). Chosen to encode the documented endgame priority order.
// Calibrated toward the proven "shed low cards, conserve premiums, tidy the hand"
// philosophy: control terms stay modest (leading strong cards early is wasteful),
// while reduceTurnsToFinish + removeWeakSingles + conservation dominate calm play.
// The optimizer refines from here; the promoted POLICY_EXPERT is the tuned result.
export const DEFAULT_WEIGHTS: BotStrategyWeights = {
  immediateWin: 2000,
  preventImmediateLoss: 1200,
  cardsRemoved: 6,
  reduceTurnsToFinish: 24,
  maintainControl: 6,
  regainControl: 6,
  blockOneCardOpponent: 320,
  blockTwoCardOpponent: 90,
  removeWeakSingles: 16,
  preservePair: 8,
  preserveTriple: 16,
  preserveStraight: 16,
  preserveBomb: 60,
  breakCombinationPenalty: 28,
  highCardCost: 5,
  wasteTwoPenalty: 80,
  unsafeSingleLeadPenalty: 140,
  seatOrderDanger: 16,
  opponentMatchProbability: 8,
  futureFlexibility: 8,
}

export function cloneWeights(w: BotStrategyWeights): BotStrategyWeights {
  return { ...w }
}

/** Clamp every weight into its allowed tuning range (used after a mutation). */
export function clampWeights(w: BotStrategyWeights): BotStrategyWeights {
  const out = { ...w }
  for (const k of Object.keys(WEIGHT_SPECS) as Array<keyof BotStrategyWeights>) {
    const spec = WEIGHT_SPECS[k]
    out[k] = Math.min(spec.max, Math.max(spec.min, out[k]))
  }
  return out
}

// ── Versioned, promotable policies ────────────────────────────────────────────
// A promoted training result is recorded here with a version string; production
// loads ACTIVE_POLICY_VERSION. The previous stable policy stays available so a
// rollback is a one-line constant change (see PROMOTION + rollback in the report).
export interface NamedWeights { version: string; weights: BotStrategyWeights }

export const POLICY_BASELINE: NamedWeights = {
  version: 'baseline-2026-06-v1',
  weights: DEFAULT_WEIGHTS,
}

// Filled in by training promotion (kept here so production never imports sim code).
// expert-2026-06-v1 was produced by the weight optimizer and passed the promotion
// gate (scenarios + holdout win-rate vs baseline). See sim/optimizer + the report.
export const POLICY_EXPERT: NamedWeights = {
  version: 'expert-2026-06-v1',
  weights: {
    immediateWin: 1500,
    preventImmediateLoss: 1013,
    cardsRemoved: 6.6,
    reduceTurnsToFinish: 31,
    maintainControl: 3.7,
    regainControl: 7.8,
    blockOneCardOpponent: 333,
    blockTwoCardOpponent: 93,
    removeWeakSingles: 20,
    preservePair: 9.2,
    preserveTriple: 19.8,
    preserveStraight: 16,
    preserveBomb: 66,
    breakCombinationPenalty: 11.5,
    highCardCost: 6.2,
    wasteTwoPenalty: 85.6,
    unsafeSingleLeadPenalty: 141,
    seatOrderDanger: 17.4,
    opponentMatchProbability: 9.3,
    futureFlexibility: 4.2,
  },
}

// expert-2026-06-v2 — produced by the CONSTRAINED weight optimizer (sim/optimizer)
// and promoted after passing the full production gate (sim/cli.ts `cycle`):
//   • 10,000-game UNSEEN holdout per policy (seat-rotated), difficulty=expert.
//   • Win rate 38.82% vs legacy 34.69% (Δ +4.13 pts, paired bootstrap 95% CI [3.07, 5.15])
//     and vs expert-2026-06-v1 37.48% (Δ +1.34 pts, paired 95% CI [0.49, 2.20]) — both
//     lower bounds > 0, so the improvement is statistically significant.
//   • Zero illegal moves; 40/40 strategic scenarios; 7/7 production-path replays legal.
//   • No safety regression: one-card-block 75.4% (v1 75.8%), forced-win conversion 100%,
//     avoidable-loss 1.78% (v1 1.79%); avg finish position 1.245 (BETTER than v1 1.301).
//   • Decision time p99 31ms / max 310ms — far under the per-turn server budget.
// Warm-started from v1 + constrained on the scenario suite and a one-card-block floor,
// so it never trades defensive correctness for raw win rate. Exact validated weights.
export const POLICY_EXPERT_V2: NamedWeights = {
  version: 'expert-2026-06-v2',
  weights: {
    immediateWin: 1717.142034738959,
    preventImmediateLoss: 1110.7675366506826,
    cardsRemoved: 10.79179303564273,
    reduceTurnsToFinish: 31,
    maintainControl: 2.2394341374959166,
    regainControl: 7.959229541237221,
    blockOneCardOpponent: 197.1323807190385,
    blockTwoCardOpponent: 49.41305560961651,
    removeWeakSingles: 8.745237843771283,
    preservePair: 7.3686547979626,
    preserveTriple: 22.735942049168923,
    preserveStraight: 20.910765023948493,
    preserveBomb: 37.671167335511655,
    breakCombinationPenalty: 12.957954781587915,
    highCardCost: 5.4734174647489855,
    wasteTwoPenalty: 85.71225739877265,
    unsafeSingleLeadPenalty: 100.52862173750309,
    seatOrderDanger: 13.229571025870635,
    opponentMatchProbability: 6.177711088328351,
    futureFlexibility: 6.067719888602607,
  },
}

// All known policies (for rollback + CLI lookups).
export const POLICY_REGISTRY: Record<string, NamedWeights> = {
  [POLICY_BASELINE.version]: POLICY_BASELINE,
  [POLICY_EXPERT.version]: POLICY_EXPERT,
  [POLICY_EXPERT_V2.version]: POLICY_EXPERT_V2,
}

// The policy production uses by default. Change this single constant to roll back:
//   • expert-2026-06-v2 — current (promoted 2026-06-30)
//   • expert-2026-06-v1 — previous stable (immediate rollback target)
//   • baseline-2026-06-v1 — hand-authored DEFAULT_WEIGHTS
export const ACTIVE_POLICY_VERSION = POLICY_EXPERT_V2.version

export function activeWeights(): BotStrategyWeights {
  return cloneWeights(POLICY_REGISTRY[ACTIVE_POLICY_VERSION].weights)
}
