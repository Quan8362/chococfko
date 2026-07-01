// ── Shared multiplayer-game infrastructure — public surface ────────────────────────
//
// PURE, framework-free primitives reused by every authoritative multiplayer game on the
// platform (Poker first; available to TLMN/Caro/Chess as they adopt it). No React, no
// Supabase, no browser-only API — safe to import from a pure engine, a 'use server' action,
// or a client component. See ./README.md for the boundary contract.

export * from './ids.ts'
export * from './sequence.ts'
export * from './coins.ts'
export * from './deadline.ts'
export * from './envelope.ts'
export * from './transport.ts'
export * from './contracts.ts'
