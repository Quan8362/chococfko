// ─────────────────────────────────────────────────────────────────────────────
// Deterministic RNG primitives for the AI + simulator.
//
// Pure & framework-agnostic. Everything stochastic in the bot/simulator routes
// through a seeded generator so a decision, a shuffle, or a whole self-play batch
// is bit-for-bit reproducible from its seed (required for fair A/B comparisons and
// stable tests). NEVER call Math.random in AI/sim code — pass a seed instead.
// ─────────────────────────────────────────────────────────────────────────────

/** mulberry32 — tiny, fast, well-distributed 32-bit PRNG. Returns [0,1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Hash an arbitrary string to a 32-bit int so any string seed maps to mulberry32. */
export function hashSeed(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** A reusable seeded generator from a string OR number seed. */
export function makeRng(seed: string | number): () => number {
  return mulberry32(typeof seed === 'number' ? seed >>> 0 : hashSeed(seed))
}

/** Pick one element deterministically. Returns undefined for an empty array. */
export function seededChoice<T>(items: T[], rng: () => number): T | undefined {
  if (items.length === 0) return undefined
  return items[Math.floor(rng() * items.length)]
}

/**
 * Weighted choice over items with non-negative weights, deterministic given rng.
 * Falls back to the first item if all weights are 0. Used for "creative" but never
 * inferior tie-breaking among near-equal moves.
 */
export function seededWeightedChoice<T>(
  items: Array<{ item: T; weight: number }>,
  rng: () => number,
): T | undefined {
  if (items.length === 0) return undefined
  const total = items.reduce((acc, x) => acc + Math.max(0, x.weight), 0)
  if (total <= 0) return items[0].item
  let r = rng() * total
  for (const x of items) {
    r -= Math.max(0, x.weight)
    if (r <= 0) return x.item
  }
  return items[items.length - 1].item
}
