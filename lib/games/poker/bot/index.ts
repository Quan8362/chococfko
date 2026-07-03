// ── Poker BOT layer — public surface (pure) ───────────────────────────────────────────
//
// One import point for the bot subsystem. Everything here is PURE (no React/Supabase/clock) and,
// crucially, fairness-bounded: a bot only ever sees a `BotObservation` (observation.ts). The
// live-play `bot` feature flag stays hard-OFF until explicitly approved; these modules power the
// simulation harness + the future practice-table policy, not any enabled production seat.

export * from './observation.ts'
export * from './equity.ts'
export * from './policy.ts'
export * from './policies.ts'
export * from './runner.ts'
export * from './sim.ts'
export * from './admin.ts'
