// ── Poker LEARNING analytics — privacy-safe onboarding/training signals ─────────────────────────
//
// Thin, typed helpers over the existing privacy-safe UX-signal buffer (../uxSignals.ts). Reuses
// that module's guarantees wholesale: signal `detail` can carry ONLY finite numbers (card strings,
// user ids, free text CANNOT be represented), the taxonomy is fixed & versioned, and recording is
// best-effort (never throws, never affects play). Nothing here is used to steer a player toward
// risky play — these are learning-funnel counters, and "repeat help usage" is simply derived from
// the buffer's counts, not a separate manipulative signal.

import { recordUxSignal, getUxTrailSummary } from '../uxSignals.ts'

export function trackOnboardingStarted(): void {
  recordUxSignal('onboarding_started')
}

export function trackOnboardingStep(index: number): void {
  recordUxSignal('onboarding_step_viewed', { index })
}

export function trackOnboardingCompleted(): void {
  recordUxSignal('onboarding_completed')
}

export function trackOnboardingSkipped(atIndex: number): void {
  recordUxSignal('onboarding_skipped', { index: atIndex })
}

export function trackTrainingScenarioStarted(index: number): void {
  recordUxSignal('training_scenario_started', { index })
}

export function trackTrainingScenarioCompleted(index: number): void {
  recordUxSignal('training_scenario_completed', { index })
}

// `topicId` is the index of the help topic in explain.HELP_TOPICS — a number, so no free text or
// card data can ride along. Repeat usage is read back via getUxTrailSummary() (name:count pairs).
export function trackHelpTopicOpened(topicId: number): void {
  recordUxSignal('help_topic_opened', { topic: topicId })
}

export { getUxTrailSummary }
