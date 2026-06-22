// Deterministic Daily Challenge selection. PURE module.
// Everyone playing the same (date, level) gets an equivalent question SET. The
// per-option order is still randomised server-side per session (see actions),
// so the correct position is never predictable from the seed alone.

// FNV-1a 32-bit string hash → stable seed.
export function hashSeed(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// mulberry32 — small, fast, well-distributed seeded PRNG. Returns [0,1).
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Stable seed for a daily challenge instance.
export function dailySeed(dateYmd: string, level: string): number {
  return hashSeed(`jp60:${dateYmd}:${level}`)
}

// Deterministic Fisher–Yates using a seeded RNG (does not mutate input).
export function seededShuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Deterministically choose `count` items from `pool` for a daily seed. Pool MUST
// be passed in a stable order (e.g. ordered by id) so the result is reproducible.
export function seededPick<T>(pool: readonly T[], count: number, seed: number): T[] {
  if (pool.length <= count) return [...pool]
  return seededShuffle(pool, mulberry32(seed)).slice(0, count)
}
