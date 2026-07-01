// ── Shared multiplayer infra: server-authoritative deadlines & timer display ───────
//
// PURE module — no React, no Supabase. Tested by deadline.test.ts.
//
// The turn clock is SERVER-authoritative (realtime-model §7): the server sets
// `turn_deadline = turn_started_at + base [+ time-bank]`. The client renders a countdown
// toward that deadline but NEVER enforces it — expiry is resolved server-side
// (tickActionTimer / reaper). A small grace tolerance absorbs network jitter (TLMN pattern).
// "Disconnection grants no stall protection": the deadline is absolute wall-clock, computed
// against `now`, independent of any client's connection state (RECONNECT-001 / EC-G4).

// Epoch milliseconds. Use a shared alias so call sites read intentfully.
export type EpochMs = number

// Compute an absolute deadline from a start instant and a duration. Pure arithmetic so the
// server can call it when stamping `turn_deadline`.
export function computeDeadline(startedAt: EpochMs, durationMs: number): EpochMs {
  if (!Number.isFinite(startedAt)) throw new Error('deadline: startedAt must be finite')
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error('deadline: durationMs must be a non-negative finite number')
  }
  return startedAt + durationMs
}

// Milliseconds remaining until the deadline, floored at 0 (never negative for display).
export function remainingMs(deadline: EpochMs, now: EpochMs): number {
  return Math.max(0, deadline - now)
}

// Whole seconds remaining (rounded UP so a countdown shows "1" until the very last moment).
export function secondsRemaining(deadline: EpochMs, now: EpochMs): number {
  return Math.ceil(remainingMs(deadline, now) / 1000)
}

// Authoritative expiry check. `graceMs` (>=0) absorbs jitter: a deadline is only "expired"
// once `now` is past it by more than the grace window. The SERVER uses this to decide a
// timeout action; the client must not use it to mutate state, only to dim the UI.
export function isExpired(deadline: EpochMs, now: EpochMs, graceMs = 0): boolean {
  if (!Number.isFinite(graceMs) || graceMs < 0) {
    throw new Error('deadline: graceMs must be a non-negative finite number')
  }
  return now > deadline + graceMs
}

// Fraction of the window already elapsed, clamped to [0, 1] — drives a shrinking clock ring.
export function elapsedFraction(startedAt: EpochMs, deadline: EpochMs, now: EpochMs): number {
  const total = deadline - startedAt
  if (total <= 0) return 1
  const elapsed = now - startedAt
  if (elapsed <= 0) return 0
  if (elapsed >= total) return 1
  return elapsed / total
}

// Display-only "M:SS" turn clock (e.g. 20s → "0:20", 5s → "0:05"). For long durations the
// minutes field grows naturally. Eligibility/expiry is always re-checked server-side.
export function formatTurnClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
