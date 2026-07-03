// ── Poker TOURNAMENT — barrel ────────────────────────────────────────────────────────────
// PURE domain library for the tournament foundation. See docs/poker/tournaments/*.md.
// Reuses the cash engine to play hands; owns everything around the hand (registration, chips,
// blind clock, table balancing, elimination order, prize pool, payout). Flag-gated behind
// POKER_TOURNAMENT_ENABLED (hard-off this phase).

export * from './types.ts'
export * from './config.ts'
export * from './stateMachine.ts'
export * from './blinds.ts'
export * from './registration.ts'
export * from './prizePool.ts'
export * from './elimination.ts'
export * from './payout.ts'
export * from './balancing.ts'
