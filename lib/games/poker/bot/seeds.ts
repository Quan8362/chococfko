// ── Poker BOT seed strategy & benchmark matrix (pure) ─────────────────────────────────
//
// PURE module — no React, no Supabase, no clock. Deterministic. Tested by seeds.test.ts.
//
// Defines the SEPARATED seed groups the calibration phases must use, so tuning can never overfit
// the numbers it is judged on (docs/poker/bots/seed-strategy.md):
//   • CALIBRATION seeds — the ONLY seeds Prompt 27C-B may tune against.
//   • VALIDATION seeds — used to check a tuning generalizes (never tuned against directly).
//   • HOLDOUT seeds — reserved for the FINAL 27C-C gate; MUST stay unused until then.
//
// The three groups are disjoint by construction (assertSeedGroupsDisjoint proves it). A "seed" here
// is a session seed for runBotSimulation; the deck's per-hand shuffle seed is derived from it INSIDE
// the sim (deriveHandSeed) and is NEVER exposed to a policy — deck randomness and policy randomness
// stay strictly separated (the policy's rng is the session rng; neither is a policy input).

// Deterministically expand a labelled base into `count` distinct 32-bit seeds. Pure integer hash —
// no clock, no Math.random — so the same group is reproduced bit-for-bit on every machine/run.
function expandSeeds(base: number, count: number): number[] {
  const out: number[] = []
  let h = base >>> 0
  for (let i = 0; i < count; i++) {
    // xorshift-ish mix; each step is a pure function of the previous state.
    h = (h ^ (h << 13)) >>> 0
    h = (h ^ (h >>> 17)) >>> 0
    h = (h ^ (h << 5)) >>> 0
    out.push(h >>> 0)
  }
  return out
}

// Distinct bases per group so the expansions cannot collide.
const CALIBRATION_BASE = 0x0c_a11b_11 >>> 0
const VALIDATION_BASE = 0x0_7a11d_a7 >>> 0
const HOLDOUT_BASE = 0x0_40_1d_00 >>> 0

export interface SeedGroups {
  readonly calibration: readonly number[]
  readonly validation: readonly number[]
  readonly holdout: readonly number[]
}

// Fixed, reproducible groups. Sizes are bounded (audit-appropriate, not a research corpus).
export const SEED_GROUPS: SeedGroups = {
  calibration: expandSeeds(CALIBRATION_BASE, 24),
  validation: expandSeeds(VALIDATION_BASE, 16),
  holdout: expandSeeds(HOLDOUT_BASE, 16),
}

// Prove (at runtime, and in tests) that no seed appears in more than one group. Returns the list of
// offending seeds (empty ⇒ disjoint).
export function overlappingSeeds(groups: SeedGroups = SEED_GROUPS): number[] {
  const seen = new Map<number, number>() // seed → how many groups it appeared in
  for (const g of [groups.calibration, groups.validation, groups.holdout]) {
    const local = new Set<number>()
    for (const s of g) {
      local.add(s)
    }
    for (const s of Array.from(local)) seen.set(s, (seen.get(s) ?? 0) + 1)
  }
  return Array.from(seen.entries())
    .filter(([, n]) => n > 1)
    .map(([s]) => s)
}

export function assertSeedGroupsDisjoint(groups: SeedGroups = SEED_GROUPS): void {
  const dup = overlappingSeeds(groups)
  if (dup.length > 0) {
    throw new Error(`bot seeds: calibration/validation/holdout overlap on ${dup.length} seed(s)`)
  }
  // Also assert no group is internally degenerate (all-distinct within a group).
  for (const [name, g] of Object.entries(groups) as [keyof SeedGroups, readonly number[]][]) {
    if (new Set(g).size !== g.length) throw new Error(`bot seeds: group "${name}" has duplicate seeds`)
  }
}

// ── Benchmark matrix (used by the baseline runner + 27C-B/27C-C) ──────────────────────────
//
// A bounded grid of table shapes to exercise heads-up..6-max across short/standard/deep stacks and
// a few opponent environments. Kept small for the audit; calibration phases can widen it. Stacks
// are expressed in BIG BLINDS so a single bigBlind drives the absolute chip amounts.

export type StackCategory = 'short' | 'standard' | 'deep'

export const STACK_BB: Readonly<Record<StackCategory, number>> = {
  short: 20,
  standard: 100,
  deep: 250,
}

export interface BenchScenario {
  readonly label: string
  readonly seatCount: number // 2..6
  readonly stack: StackCategory
}

// The default baseline grid: every player count at standard depth, plus HU + 6-max at the extremes.
export const BENCHMARK_MATRIX: readonly BenchScenario[] = [
  { label: 'hu-standard', seatCount: 2, stack: 'standard' },
  { label: 'hu-short', seatCount: 2, stack: 'short' },
  { label: 'hu-deep', seatCount: 2, stack: 'deep' },
  { label: '3max-standard', seatCount: 3, stack: 'standard' },
  { label: '4max-standard', seatCount: 4, stack: 'standard' },
  { label: '5max-standard', seatCount: 5, stack: 'standard' },
  { label: '6max-standard', seatCount: 6, stack: 'standard' },
  { label: '6max-short', seatCount: 6, stack: 'short' },
  { label: '6max-deep', seatCount: 6, stack: 'deep' },
]
