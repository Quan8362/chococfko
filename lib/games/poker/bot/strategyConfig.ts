// ── Poker BOT strategy configuration (pure, versioned data) ────────────────────────────
//
// PURE module — no React, no Supabase, no clock. Deterministic. Tested by strategyConfig.test.ts.
//
// This is the SINGLE, VERSIONED source of the numbers that define how easy/normal/hard play. The
// decision code (strategy.ts) is a thin, explainable interpreter of THIS data — so calibration is a
// data edit, not a logic rewrite, and a change is auditable as a config diff. Mirrors the project's
// versioned-config convention (lib/games/poker/economyConfig, TLMN ai/weights ACTIVE_POLICY_VERSION).
//
// 🔴 NONE of this is game-theory-optimal. These are heuristic ranges/thresholds designed to be
//    believable and to produce a defensible strength ORDERING (hard ≥ normal ≥ easy), not a solve.
//    Thresholds are expressed against the project's normalized preflop strength (equity.ts
//    `preflopStrength`, Chen-derived, [0,1]) and against Monte-Carlo equity [0,1] postflop, so a
//    single scale drives both the range model and the config.

import type { Street } from '../types.ts'
import type { BotDifficulty } from './policy.ts'

export const STRATEGY_VERSION = 'bot-strategy-2026-07-v1'

// Position buckets, coarse but sufficient for a 2..6-max heuristic. Heads-up collapses to
// {btn (= small blind), bb}. `sb`/`bb` are the blinds in 3+ handed play.
export type PositionClass = 'ep' | 'mp' | 'co' | 'btn' | 'sb' | 'bb'

export const POSITION_CLASSES: readonly PositionClass[] = ['ep', 'mp', 'co', 'btn', 'sb', 'bb']

// The preflop pot situation the seat faces. Drives which range table applies.
export type PreflopSituation = 'unopened' | 'limped' | 'raised' | 'threebet_plus'

// ── Config shapes ──────────────────────────────────────────────────────────────────────

// Minimum normalized preflop strength to take each action, per position. Lower = wider = looser.
export interface PreflopRanges {
  // Open-raise first-in (unopened pot). No entry for 'bb' (the BB never "opens" — it has the option).
  readonly open: Readonly<Record<PositionClass, number>>
  // Over-limp / complete instead of raising (mostly an EASY leak; tighter bots rarely limp).
  readonly limpEnter: Readonly<Record<PositionClass, number>>
  // Facing a single raise: flat-call vs re-raise (3-bet) thresholds, per position.
  readonly vsRaiseCall: Readonly<Record<PositionClass, number>>
  readonly vsRaiseReraise: Readonly<Record<PositionClass, number>>
  // Facing a 3-bet+ (re-raised pot): flat-call vs 4-bet thresholds (position-agnostic, bounded).
  readonly vs3betCall: number
  readonly vs3betReraise: number
  // Big-blind defense: because the BB closes the action and gets a price, LOWER its call threshold
  // by this much when defending a raise (a looser continue, still bounded).
  readonly bbDefendBonus: number
  // Blind-vs-blind: when it folds to the blinds, widen both blinds' open by this much.
  readonly blindVsBlindBonus: number
  // Heads-up is a fundamentally wider game (every hand is a blind battle): widen the open (button/SB)
  // and defend (BB) thresholds by this much when only two players are dealt in. Without it a
  // full-ring-tight bot open-folds far too many buttons and bleeds its blinds to a loose caller.
  readonly headsUpWiden: number
}

// Short-stack (push/fold-ish) behaviour, all in big blinds of EFFECTIVE stack.
export interface ShortStackRules {
  readonly reshoveMaxBb: number // ≤ this effective stack ⇒ facing a raise, jam-or-fold (no flat)
  readonly openShoveMaxBb: number // ≤ this ⇒ open by shoving rather than min-raising, with range
  readonly openShoveStrength: number // normalized preflop strength to open-shove when short
  readonly reshoveStrength: number // strength to re-jam over a raise when short
  readonly callShoveStrength: number // strength to CALL a shove (tighter than jamming it yourself)
}

// Postflop thresholds, per street. All against Monte-Carlo equity [0,1] except the frequencies.
export interface PostflopRules {
  readonly valueBet: Readonly<Record<Street, number>> // equity to bet/raise made hands for value
  readonly continueMargin: Readonly<Record<Street, number>> // equity margin ABOVE pot-odds to call
  readonly raiseValue: Readonly<Record<Street, number>> // equity to raise for value facing a bet
  readonly semiBluffMinDraw: number // min draw-strength (board.ts) to semi-bluff a draw
  readonly semiBluffFreq: number // base frequency to actually fire a semi-bluff (0..1)
  readonly bluffFreq: number // base pure-bluff frequency with air (0..1)
  readonly cbetFreq: number // c-bet frequency as the preflop aggressor on a favourable board
  readonly protectionWetness: number // board wetness above which a vulnerable made hand bets to protect
  readonly multiwayTighten: number // added to value/continue bars per EXTRA opponent (>1)
}

// Bet-sizing menus (fractions of pot, or bb multiples preflop). Several options let harder bots MIX
// so their sizing is less readable; easier bots use a single, predictable size.
export interface SizingMenu {
  readonly openBb: number // preflop open raise-to, in big blinds
  readonly perLimperBb: number // add this many bb to the open per limper already in
  readonly threeBetMult: number // 3-bet raise-to as a multiple of the raise being faced
  readonly fourBetMult: number // 4-bet raise-to as a multiple of the 3-bet being faced
  readonly cbet: readonly number[] // pot fractions for a c-bet (picked by seeded mix)
  readonly value: readonly number[] // pot fractions for a value bet/raise
  readonly bluff: readonly number[] // pot fractions for a bluff / semi-bluff
}

// What a difficulty is "allowed to know" — the bounded-weakness knobs. Difficulty is defined by
// BOTH thresholds and these capability toggles (an easy bot ignores position, never 3-bets, etc.).
export interface Capabilities {
  readonly usesPosition: boolean // factor position into preflop ranges
  readonly usesEquityPostflop: boolean // Monte-Carlo equity vs a coarse made-hand heuristic
  readonly threeBets: boolean // ever re-raise preflop for value
  readonly semiBluffs: boolean // ever bet/raise a draw as a semi-bluff
  readonly bluffs: boolean // ever fire a pure bluff with air
  readonly protects: boolean // ever bet a vulnerable made hand for protection on a wet board
  readonly mixesSizing: boolean // vary bet sizing (else always the first menu entry)
  readonly readsAction: boolean // tighten vs observed 3-bet/4-bet aggression (public history)
}

export interface DifficultyStrategy {
  readonly difficulty: BotDifficulty
  readonly equitySamples: Readonly<Record<'preflop' | 'postflop', number>> // MC caps by street
  readonly equityEarlyStop: boolean // allow the bounded early-stop sampler (perf, decision-neutral)
  readonly preflop: PreflopRanges
  readonly shortStack: ShortStackRules
  readonly postflop: PostflopRules
  readonly sizing: SizingMenu
  readonly capabilities: Capabilities
}

// ── Difficulty configs ─────────────────────────────────────────────────────────────────
//
// Threshold intuition (normalized preflop strength): AA=1.00, KK=0.81, QQ=0.71, AKs=0.62, AKo=0.52,
// TT=0.52, AQs=0.57, KQs=0.52, 99=0.48, 88=0.43, 22=0.29, 72o≈0.00. So an "open ≥ 0.42" range is
// roughly TT+/AJs+/KQ+/suited-broadway (a tight-ish ~15-20%), "open ≥ 0.34" widens toward the
// button. These map the 27C-A finding (PFR was ~1%, far too passive) up into a real raising range.

function record<T>(ep: T, mp: T, co: T, btn: T, sb: T, bb: T): Readonly<Record<PositionClass, T>> {
  return { ep, mp, co, btn, sb, bb }
}

// EASY: coarse, too loose, too passive when facing bets, almost never re-raises or bluffs. It DOES
// raise its strong hands preflop (fixing the passivity leak) but flats far too much and ignores
// position. Understandable-beginner weaknesses, bounded — no chip-dumping, no random jamming.
const EASY: DifficultyStrategy = {
  difficulty: 'easy',
  equitySamples: { preflop: 0, postflop: 80 },
  equityEarlyStop: true,
  preflop: {
    open: record(0.5, 0.48, 0.46, 0.44, 0.46, 0.99),
    limpEnter: record(0.34, 0.33, 0.32, 0.3, 0.32, 0.99), // limps a wide, weak range (classic leak)
    vsRaiseCall: record(0.44, 0.44, 0.42, 0.4, 0.42, 0.36), // calls too wide, especially in the BB
    vsRaiseReraise: record(0.99, 0.99, 0.99, 0.99, 0.99, 0.99), // never 3-bets (capability off too)
    vs3betCall: 0.6,
    vs3betReraise: 0.99,
    bbDefendBonus: 0.06,
    blindVsBlindBonus: 0.04,
    headsUpWiden: 0.08,
  },
  shortStack: {
    reshoveMaxBb: 10,
    openShoveMaxBb: 8,
    openShoveStrength: 0.5,
    reshoveStrength: 0.6,
    callShoveStrength: 0.6,
  },
  postflop: {
    valueBet: streetRec(0.62, 0.64, 0.66, 0.68),
    continueMargin: streetRec(0.04, 0.05, 0.06, 0.07), // needs a real edge to call (but calls too much via low bar overall)
    raiseValue: streetRec(0.8, 0.8, 0.82, 0.84),
    semiBluffMinDraw: 1.1, // never (capability off)
    semiBluffFreq: 0,
    bluffFreq: 0,
    cbetFreq: 0.35,
    protectionWetness: 1.1, // never
    multiwayTighten: 0.05,
  },
  sizing: {
    openBb: 3,
    perLimperBb: 1,
    threeBetMult: 3,
    fourBetMult: 2.2,
    cbet: [0.5],
    value: [0.5],
    bluff: [0.5],
  },
  capabilities: {
    usesPosition: false,
    usesEquityPostflop: true,
    threeBets: false,
    semiBluffs: false,
    bluffs: false,
    protects: false,
    mixesSizing: false,
    readsAction: false,
  },
}

// NORMAL: position-aware ranges, equity vs pot-odds, value betting, a little semi-bluffing and a
// capped positional bluff, sensible folding. A solid, straightforward TAG that is clearly better
// than EASY without pretending to be a solver.
const NORMAL: DifficultyStrategy = {
  difficulty: 'normal',
  equitySamples: { preflop: 0, postflop: 140 },
  equityEarlyStop: true,
  preflop: {
    open: record(0.46, 0.43, 0.39, 0.35, 0.4, 0.99),
    limpEnter: record(0.99, 0.99, 0.99, 0.99, 0.99, 0.99), // does not limp (raise-or-fold first in)
    vsRaiseCall: record(0.5, 0.49, 0.47, 0.45, 0.47, 0.42),
    vsRaiseReraise: record(0.66, 0.65, 0.63, 0.6, 0.63, 0.62),
    vs3betCall: 0.62,
    vs3betReraise: 0.78,
    bbDefendBonus: 0.1,
    blindVsBlindBonus: 0.08,
    headsUpWiden: 0.14,
  },
  shortStack: {
    reshoveMaxBb: 12,
    openShoveMaxBb: 8,
    openShoveStrength: 0.44,
    reshoveStrength: 0.55,
    callShoveStrength: 0.58,
  },
  postflop: {
    valueBet: streetRec(0.6, 0.62, 0.64, 0.66),
    continueMargin: streetRec(0.02, 0.03, 0.04, 0.05),
    raiseValue: streetRec(0.76, 0.78, 0.8, 0.82),
    semiBluffMinDraw: 0.45,
    semiBluffFreq: 0.4,
    bluffFreq: 0.12,
    cbetFreq: 0.6,
    protectionWetness: 0.55,
    multiwayTighten: 0.05,
  },
  sizing: {
    openBb: 2.5,
    perLimperBb: 1,
    threeBetMult: 3,
    fourBetMult: 2.3,
    cbet: [0.5, 0.66],
    value: [0.66, 0.75],
    bluff: [0.5, 0.66],
  },
  capabilities: {
    usesPosition: true,
    usesEquityPostflop: true,
    threeBets: true,
    semiBluffs: true,
    bluffs: true,
    protects: true,
    mixesSizing: true,
    readsAction: false,
  },
}

// HARD: the strongest APPROVED legal-information strategy. Tighter-but-aggressive position-aware
// ranges, more equity samples, blocker-aware 3-bet bluffs (bounded), draw-based semi-bluffs, board-
// texture-aware c-bets and protection, varied sizing, action reading, and river discipline (folds
// medium hands to big rivers). Explainable and bounded — NOT a solver, no GTO claim.
const HARD: DifficultyStrategy = {
  difficulty: 'hard',
  equitySamples: { preflop: 0, postflop: 220 },
  equityEarlyStop: true,
  preflop: {
    open: record(0.45, 0.42, 0.37, 0.32, 0.37, 0.99),
    limpEnter: record(0.99, 0.99, 0.99, 0.99, 0.99, 0.99),
    vsRaiseCall: record(0.49, 0.48, 0.45, 0.42, 0.45, 0.38),
    vsRaiseReraise: record(0.64, 0.62, 0.59, 0.56, 0.59, 0.6),
    vs3betCall: 0.6,
    vs3betReraise: 0.74,
    bbDefendBonus: 0.13,
    blindVsBlindBonus: 0.12,
    // Solid heads-up range: matches normal's width (a strong TAG, neither an over-wide spewer that
    // bleeds to a calling station nor an over-tight nit a thinking opponent out-pressures).
    headsUpWiden: 0.13,
  },
  shortStack: {
    reshoveMaxBb: 14,
    openShoveMaxBb: 9,
    openShoveStrength: 0.42,
    reshoveStrength: 0.52,
    callShoveStrength: 0.56,
  },
  postflop: {
    // Hard's edge is thin VALUE (low value bars ⇒ it gets paid), better equity, and river
    // discipline — NOT volume bluffing. Bluff/c-bet frequencies are kept AT OR BELOW normal so it
    // does not spew into opponents that never fold (a strong player bluffs a station less, not more).
    valueBet: streetRec(0.58, 0.6, 0.62, 0.64),
    continueMargin: streetRec(0.01, 0.02, 0.03, 0.05), // river discipline: needs more edge late
    raiseValue: streetRec(0.72, 0.74, 0.77, 0.8),
    semiBluffMinDraw: 0.42,
    semiBluffFreq: 0.42,
    bluffFreq: 0.1,
    cbetFreq: 0.55,
    protectionWetness: 0.5,
    multiwayTighten: 0.06,
  },
  sizing: {
    openBb: 2.3,
    perLimperBb: 1,
    threeBetMult: 3.2,
    fourBetMult: 2.4,
    cbet: [0.33, 0.5, 0.66],
    value: [0.66, 0.75, 1.0],
    bluff: [0.5, 0.66, 0.75],
  },
  capabilities: {
    usesPosition: true,
    usesEquityPostflop: true,
    threeBets: true,
    semiBluffs: true,
    bluffs: true,
    protects: true,
    mixesSizing: true,
    readsAction: true,
  },
}

function streetRec(pf: number, flop: number, turn: number, river: number): Readonly<Record<Street, number>> {
  return { PREFLOP: pf, FLOP: flop, TURN: turn, RIVER: river, SHOWDOWN: river }
}

export const DIFFICULTY_STRATEGY: Readonly<Record<Exclude<BotDifficulty, 'simulation'>, DifficultyStrategy>> = {
  easy: EASY,
  normal: NORMAL,
  hard: HARD,
}

export function strategyFor(difficulty: Exclude<BotDifficulty, 'simulation'>): DifficultyStrategy {
  return DIFFICULTY_STRATEGY[difficulty]
}

// ── Personalities (OPTIONAL overlay, strictly separate from difficulty) ────────────────────
//
// A personality is a BOUNDED style overlay applied ON TOP of a difficulty. It never changes what a
// difficulty is CAPABLE of (an easy bot with an "aggressive" personality still cannot 3-bet — the
// capability stays off); it only nudges thresholds/frequencies/sizing within safe bounds. Difficulty
// and personality are orthogonal axes. Not exposed publicly (no flag, no UI) — an internal knob for
// field variety in simulation. 'balanced' is the neutral default (all shifts zero).

export type PersonalityId = 'balanced' | 'aggressive' | 'passive' | 'tight' | 'loose'

export interface Personality {
  readonly id: PersonalityId
  readonly enterShift: number // + = looser entry (LOWER thresholds); bounded small
  readonly aggressionShift: number // + = value/raise a touch wider; bounded small
  readonly bluffMult: number // multiplies bluff/semi-bluff frequency (× , bounded)
  readonly sizingBias: number // + = larger bets (added to every pot fraction), bounded
}

const P = (id: PersonalityId, enterShift: number, aggressionShift: number, bluffMult: number, sizingBias: number): Personality => ({
  id,
  enterShift,
  aggressionShift,
  bluffMult,
  sizingBias,
})

export const PERSONALITIES: Readonly<Record<PersonalityId, Personality>> = {
  balanced: P('balanced', 0, 0, 1, 0),
  aggressive: P('aggressive', 0.02, 0.03, 1.5, 0.08),
  passive: P('passive', 0.0, -0.04, 0.4, -0.06),
  tight: P('tight', -0.05, -0.01, 0.8, 0),
  loose: P('loose', 0.06, 0.0, 1.1, 0),
}

export const DEFAULT_PERSONALITY: Personality = PERSONALITIES.balanced

// Bounds so no personality can turn a bot into a chip-dumper or a rock (safety invariant).
export const PERSONALITY_BOUNDS = {
  maxEnterShift: 0.08,
  maxAggressionShift: 0.05,
  maxBluffMult: 2,
  maxSizingBias: 0.12,
} as const
