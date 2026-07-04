// ── Mobile device-session helpers (PURE) ────────────────────────────────────────────────────
//
// DOM-free, React-free logic shared by the poker table's device hooks (_design/useWakeLock,
// _design/usePokerSound). Kept here so the eligibility rules and the haptic taxonomy are
// unit-testable without a browser. Never touches authoritative game state.

export interface WakeLockConditions {
  /** user opted in (poker prefs → wakeLock) */
  readonly enabled: boolean
  /** navigator.wakeLock is present in this browser */
  readonly supported: boolean
  /** the viewer occupies a seat — i.e. this is active gameplay, not spectating/lobby */
  readonly seated: boolean
  /** the document is currently visible (never hold a lock for a backgrounded tab) */
  readonly visible: boolean
}

// The screen wake lock is held ONLY during active seated gameplay, on a visible + supported page,
// when the user has opted in. Any condition false ⇒ the lock must be released. This is the single
// source of truth for both acquire and release decisions (the hook re-evaluates on every change).
export function shouldHoldWakeLock(c: WakeLockConditions): boolean {
  return c.enabled && c.supported && c.seated && c.visible
}

export type PokerHapticEvent =
  | 'yourTurn'
  | 'timerWarning'
  | 'actionAccepted'
  | 'allIn'
  | 'potWon'

// Subtle, distinct vibration patterns (ms) per event. DELIBERATELY short and bounded — haptics are
// never continuous and never gate gameplay. Crucially, `actionAccepted` is a single fixed buzz for
// EVERY accepted action regardless of the cards, so vibration can never leak private hand strength.
export const HAPTIC_PATTERN: Record<PokerHapticEvent, number | number[]> = {
  yourTurn: 20,
  timerWarning: [40, 60, 40],
  actionAccepted: 12,
  allIn: [30, 40, 30, 40, 60],
  potWon: [25, 50, 25],
}

// Total active + gap duration of a pattern, in ms — used by tests to assert nothing is excessive.
export function hapticDurationMs(pattern: number | number[]): number {
  return Array.isArray(pattern) ? pattern.reduce((a, b) => a + b, 0) : pattern
}
