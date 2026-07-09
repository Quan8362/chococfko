// ── Poker SEV-1 dedupe + cooldown — PURE, bounded, clock-injected ───────────────────────────────
//
// Prevents an alert storm: one real invariant breach at a busy table can trip the same detector on
// every read/settle for minutes. This deduper collapses repeated occurrences of the SAME dedupeKey
// into ONE alert per cooldown window, while counting every occurrence so the alert can say "seen N
// times". It is PURE and clock-injected (every method takes `nowMs`) so it is deterministic in tests.
//
// It is BOUNDED (maxKeys) with LRU-ish eviction so a pathological spray of distinct keys can never
// grow memory without limit. State is per-process (serverless instances do not share it); combined
// with the durable structured log line + poker_ops_events, an operator still has a complete durable
// record. The dedupe is a NOISE control, not the system of record.

export interface Sev1DedupDecision {
  /** True ⇒ the caller SHOULD deliver an alert now (first hit, or cooldown elapsed). */
  readonly shouldNotify: boolean
  /** Total occurrences of this key in the current window (>= 1), for the alert body. */
  readonly occurrenceCount: number
  /** Epoch ms this key was first seen in the current window. */
  readonly firstSeenMs: number
}

interface Entry {
  windowStartMs: number
  lastNotifyMs: number
  count: number
  lastTouchMs: number
}

export const DEFAULT_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes between alerts for one key
export const DEFAULT_MAX_KEYS = 512

export class Sev1Deduper {
  private readonly cooldownMs: number
  private readonly maxKeys: number
  private readonly map = new Map<string, Entry>()

  constructor(opts?: { cooldownMs?: number; maxKeys?: number }) {
    this.cooldownMs = Math.max(0, opts?.cooldownMs ?? DEFAULT_COOLDOWN_MS)
    this.maxKeys = Math.max(1, opts?.maxKeys ?? DEFAULT_MAX_KEYS)
  }

  /**
   * Record one occurrence of `key` at `nowMs`. Returns whether an alert should be delivered now,
   * plus the running occurrence count for the current cooldown window.
   */
  record(key: string, nowMs: number): Sev1DedupDecision {
    const existing = this.map.get(key)

    // First time (or the previous window has fully elapsed) ⇒ open a new window and notify.
    if (!existing || nowMs - existing.lastNotifyMs >= this.cooldownMs) {
      const entry: Entry = { windowStartMs: nowMs, lastNotifyMs: nowMs, count: 1, lastTouchMs: nowMs }
      this.set(key, entry)
      return { shouldNotify: true, occurrenceCount: 1, firstSeenMs: nowMs }
    }

    // Within the cooldown window ⇒ suppress the alert but keep counting.
    existing.count += 1
    existing.lastTouchMs = nowMs
    this.map.set(key, existing)
    return { shouldNotify: false, occurrenceCount: existing.count, firstSeenMs: existing.windowStartMs }
  }

  /** Current number of tracked keys (for tests / introspection). */
  size(): number {
    return this.map.size
  }

  private set(key: string, entry: Entry): void {
    // Evict the least-recently-touched key when at capacity (bounded memory).
    if (!this.map.has(key) && this.map.size >= this.maxKeys) {
      let oldestKey: string | null = null
      let oldestTouch = Infinity
      for (const [k, e] of Array.from(this.map.entries())) {
        if (e.lastTouchMs < oldestTouch) { oldestTouch = e.lastTouchMs; oldestKey = k }
      }
      if (oldestKey !== null) this.map.delete(oldestKey)
    }
    this.map.set(key, entry)
  }
}
