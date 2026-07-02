// ── Poker ONBOARDING flow model (pure, serializable) ───────────────────────────────────────────
//
// PURE — no React, no storage, no clock passed implicitly. Tested by onboarding.test.ts. Models
// the first-time onboarding tour as a small, versioned, resumable state machine. The client
// component owns localStorage persistence + rendering; this module owns the RULES: which steps
// exist, how to advance/skip/restart, when to auto-show, and how to safely re-hydrate a stored
// progress blob (a future step-count change bumps ONBOARDING_VERSION and resets cleanly).
//
// Experienced players are never blocked: `shouldAutoShow` returns false once completed OR once the
// player chose "do not show again", and the tour is always re-openable from Help.

// The 10 onboarding steps, in order (matches the spec). Keys map to `games.poker.onboarding.step.*`.
export const ONBOARDING_STEPS = [
  'choose_table',
  'buy_in',
  'hole_cards',
  'community_area',
  'current_actor',
  'action_buttons',
  'call_amount',
  'raise_to',
  'pot',
  'showdown',
] as const

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]

export const ONBOARDING_STEP_COUNT = ONBOARDING_STEPS.length
export const ONBOARDING_VERSION = 1

export interface OnboardingProgress {
  readonly version: number
  readonly stepIndex: number // resume point, 0..ONBOARDING_STEP_COUNT-1
  readonly completed: boolean
  readonly dismissed: boolean // chose "do not show again"
  readonly updatedAt: number // epoch ms (caller-supplied → deterministic in tests)
}

function clampIndex(i: number): number {
  if (!Number.isFinite(i)) return 0
  return Math.max(0, Math.min(ONBOARDING_STEP_COUNT - 1, Math.trunc(i)))
}

export function initialProgress(now = 0): OnboardingProgress {
  return { version: ONBOARDING_VERSION, stepIndex: 0, completed: false, dismissed: false, updatedAt: now }
}

// Advance to the next step; completing the tour when the last step is passed.
export function advance(p: OnboardingProgress, now = 0): OnboardingProgress {
  const atLast = p.stepIndex >= ONBOARDING_STEP_COUNT - 1
  if (atLast) return { ...p, completed: true, updatedAt: now }
  return { ...p, stepIndex: p.stepIndex + 1, updatedAt: now }
}

export function back(p: OnboardingProgress, now = 0): OnboardingProgress {
  return { ...p, stepIndex: clampIndex(p.stepIndex - 1), updatedAt: now }
}

// Save an explicit resume point (e.g. when the overlay is closed without finishing). Does NOT
// dismiss — the tour will offer to resume next time.
export function pauseAt(p: OnboardingProgress, index: number, now = 0): OnboardingProgress {
  return { ...p, stepIndex: clampIndex(index), updatedAt: now }
}

// Skip the tour for now: remembers the resume point but keeps it eligible to auto-show again.
export function skip(p: OnboardingProgress, now = 0): OnboardingProgress {
  return { ...p, updatedAt: now }
}

// Permanent opt-out ("do not show again").
export function dontShowAgain(p: OnboardingProgress, now = 0): OnboardingProgress {
  return { ...p, dismissed: true, updatedAt: now }
}

// Start over from step one and re-enable auto-show.
export function restart(now = 0): OnboardingProgress {
  return { version: ONBOARDING_VERSION, stepIndex: 0, completed: false, dismissed: false, updatedAt: now }
}

export function complete(p: OnboardingProgress, now = 0): OnboardingProgress {
  return { ...p, completed: true, updatedAt: now }
}

// Auto-show only for a player who has neither finished nor opted out. Opening from Help ignores this.
export function shouldAutoShow(p: OnboardingProgress): boolean {
  return !p.completed && !p.dismissed
}

export function currentStepKey(p: OnboardingProgress): OnboardingStepKey {
  return ONBOARDING_STEPS[clampIndex(p.stepIndex)]
}

export function isLastStep(p: OnboardingProgress): boolean {
  return p.stepIndex >= ONBOARDING_STEP_COUNT - 1
}

// Safely re-hydrate a stored blob. Unknown/older versions or malformed data reset to a fresh tour,
// so a step-list change never strands a user on a nonexistent step.
export function mergeProgress(raw: unknown, now = 0): OnboardingProgress {
  if (raw == null || typeof raw !== 'object') return initialProgress(now)
  const r = raw as Partial<OnboardingProgress>
  if (r.version !== ONBOARDING_VERSION) return initialProgress(now)
  return {
    version: ONBOARDING_VERSION,
    stepIndex: clampIndex(typeof r.stepIndex === 'number' ? r.stepIndex : 0),
    completed: r.completed === true,
    dismissed: r.dismissed === true,
    updatedAt: typeof r.updatedAt === 'number' && Number.isFinite(r.updatedAt) ? r.updatedAt : now,
  }
}
