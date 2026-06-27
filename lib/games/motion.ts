// ── Shared game motion constants ────────────────────────────────────────────────
// Single source of truth for animation timing + easing across every mini-game
// surface (TLMN redesign runs 1–4 all read from here — no scattered magic numbers).
// Durations are in SECONDS (framer-motion's unit). The MS_* mirrors are provided
// for the few places that still drive CSS/setTimeout in milliseconds.

// Easing curves (cubic-bezier control points) ----------------------------------
export const EASINGS = {
  // Decelerate hard at the end — cards "settling" onto the table.
  settle: [0.22, 0.68, 0, 1] as [number, number, number, number],
  // Gentle ease-in-out for chips/markers travelling across the felt.
  glide: [0.4, 0, 0.2, 1] as [number, number, number, number],
  // Snappy ease-out for flips.
  flip: [0.2, 0.8, 0.2, 1] as [number, number, number, number],
} as const

// Durations, in seconds -------------------------------------------------------
export const DURATIONS = {
  SETTLE: 0.3, // a played combo lands in the centre (easeOutQuart-ish)
  FLY: 0.32, // a card travels seat → centre
  FLIP: 0.18, // a face-down back flips face-up mid-flight
  PASS_CHIP: 1.2, // the turn / pass marker drifting to a seat
  LIFT: 0.16, // a selected card lifting in the hand
  DEAL: 0.3, // one card flies from the centre deck out to a seat (ease-out)
  DEAL_STAGGER: 0.045, // delay added per card so the deal cascades around the table
  BURST: 1.6, // an on-brand emoji burst rises + fades on a win
  WIN_HOLD: 0.5, // the winner-seat celebration ring's pulse cycle
} as const

// Millisecond mirrors for CSS keyframes / setTimeout call-sites ----------------
export const MS = {
  SETTLE: DURATIONS.SETTLE * 1000,
  FLY: DURATIONS.FLY * 1000,
  FLIP: DURATIONS.FLIP * 1000,
  PASS_CHIP: DURATIONS.PASS_CHIP * 1000,
  LIFT: DURATIONS.LIFT * 1000,
  DEAL: DURATIONS.DEAL * 1000,
  DEAL_STAGGER: DURATIONS.DEAL_STAGGER * 1000,
  BURST: DURATIONS.BURST * 1000,
} as const

// Ready-made framer-motion transitions ----------------------------------------
export const TRANSITIONS = {
  settle: { duration: DURATIONS.SETTLE, ease: EASINGS.settle },
  fly: { duration: DURATIONS.FLY, ease: EASINGS.settle },
  flip: { duration: DURATIONS.FLIP, ease: EASINGS.flip },
  glide: { duration: DURATIONS.PASS_CHIP, ease: EASINGS.glide },
  lift: { duration: DURATIONS.LIFT, ease: EASINGS.flip },
  deal: { duration: DURATIONS.DEAL, ease: EASINGS.settle },
} as const

// True when the user has asked the OS to minimise motion. Components should fall
// back to instant / cross-fade transitions when this is set. SSR-safe (false on
// the server; re-read on the client).
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
