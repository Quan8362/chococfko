// ─────────────────────────────────────────────────────────────────────────────
// Deterministic seed sets — strictly separated to avoid overfitting.
//
//   training   — the optimizer mutates/selects against these.
//   validation — used to pick the best of the optimizer's survivors.
//   holdout    — UNSEEN until the final promotion decision (no peeking).
//
// All derived from a base via a fixed formula so the sets are reproducible and
// disjoint across machines.
// ─────────────────────────────────────────────────────────────────────────────
export function seedRange(prefix: string, base: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${base + i}`)
}

export const TRAINING_BASE = 1_000_000
export const VALIDATION_BASE = 5_000_000
export const HOLDOUT_BASE = 9_000_000

export function trainingSeeds(count = 200): string[] { return seedRange('train', TRAINING_BASE, count) }
export function validationSeeds(count = 200): string[] { return seedRange('valid', VALIDATION_BASE, count) }
export function holdoutSeeds(count = 400): string[] { return seedRange('holdout', HOLDOUT_BASE, count) }
