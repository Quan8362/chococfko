// ── Poker RATHOLING / value-transfer DECISION layer (PURE, deterministic, integer-only) ─
//
// PURE module — no React, no Supabase, no clock (time is passed in as ms). The single TS
// source of truth for the anti-ratholing and repeated-rejoin rules the server actions and a
// future DB RPC must agree on. The DATABASE remains the authoritative enforcer; this mirrors
// the rules so the 'use server' actions can reject obviously-abusive intent early and so the
// rules are unit-testable without a database.
//
// WHAT IS RATHOLING? A player wins a big pot (deep stack), stands up to "bank" the win, then
// rejoins with only the minimum so their won chips are no longer at risk. It is a value-lock
// exploit that punishes opponents who can never win those chips back. The rule: a player who
// left a table DEEP must, if they return SOON, return with the stack they left with (clamped
// to wallet + the table cap). Busted players and technical reconnections are NOT ratholing.
//
// This never blocks a legitimate reconnection after a disconnect (reconnectGraceSeconds), and
// never traps a genuinely broke player.

import type { RatholingConfig } from './economyConfig.ts'
import type { BuyInBounds } from './economy.ts'

export type DepartureKind = 'stand_up' | 'disconnect' | 'busted'

// A recorded departure from a SPECIFIC table (the server keeps the most recent per user+table).
export interface SeatDeparture {
  readonly userId: string
  readonly tableId: string
  readonly leftAtMs: number
  readonly stackAtLeaveChips: number   // chips carried off the table when leaving
  readonly kind: DepartureKind
}

// The intent to (re)take a seat at a table, plus the context needed to judge it.
export interface RejoinContext {
  readonly userId: string
  readonly tableId: string
  readonly nowMs: number
  readonly requestedBuyInChips: number
  readonly walletBalanceChips: number
  readonly buyInBounds: BuyInBounds            // this table's [min,max] buy-in in chips
  readonly lastDeparture?: SeatDeparture       // most recent departure from THIS table (if any)
  readonly recentRejoinTimestampsMs: readonly number[] // prior rejoins to THIS table, any order
}

export type RejoinReason =
  | 'ok'
  | 'rathole_min_return'   // must return with the retained (deep) stack
  | 'rapid_rejoin'         // too many rejoins to this table within the window
  | 'below_min_buyin'      // requested < table minimum
  | 'above_max_buyin'      // requested > table maximum
  | 'insufficient_wallet'  // wallet cannot fund the required minimum

export interface RejoinDecision {
  readonly ok: boolean
  readonly reason: RejoinReason
  readonly requiredMinBuyInChips: number // the effective minimum the player must post to return
}

// Integer math throughout. factorPct is 0..100.
function pctOf(amount: number, factorPct: number): number {
  return Math.floor((amount * factorPct) / 100)
}

// Was the last departure a DEEP voluntary stand-up inside the retained-stack window?
// Only then does the rathole rule apply. Disconnect (within any window) and busted never do.
export function isSubjectToRathole(ctx: RejoinContext, cfg: RatholingConfig): boolean {
  const d = ctx.lastDeparture
  if (!d || d.tableId !== ctx.tableId) return false
  if (d.kind !== 'stand_up') return false
  const withinWindow = ctx.nowMs - d.leftAtMs <= cfg.retainedStackWindowMinutes * 60_000
  if (!withinWindow) return false
  // "Deep" = left with more than the table minimum buy-in. Leaving at/under the min is not
  // ratholing (there was nothing extra to shelter).
  return d.stackAtLeaveChips > ctx.buyInBounds.min
}

// The minimum buy-in the player must post to return, given the rathole rule. Without a rathole
// obligation this is just the table minimum; with one it is the retained stack scaled by
// minReturnStackFactorPct, always clamped to the table max (you can never be forced above the
// cap) and never below the table min.
export function minReturnBuyIn(ctx: RejoinContext, cfg: RatholingConfig): number {
  const base = ctx.buyInBounds.min
  if (!isSubjectToRathole(ctx, cfg)) return base
  const retained = ctx.lastDeparture!.stackAtLeaveChips
  const required = pctOf(retained, cfg.minReturnStackFactorPct)
  return Math.min(ctx.buyInBounds.max, Math.max(base, required))
}

// Count rejoins to THIS table within the sliding window (inclusive of the leading edge).
export function rejoinsInWindow(ctx: RejoinContext, cfg: RatholingConfig): number {
  const cutoff = ctx.nowMs - cfg.rejoinWindowMinutes * 60_000
  return ctx.recentRejoinTimestampsMs.filter((t) => t >= cutoff).length
}

export function isRapidRejoinBlocked(ctx: RejoinContext, cfg: RatholingConfig): boolean {
  return rejoinsInWindow(ctx, cfg) >= cfg.maxRejoinsPerWindow
}

// The full decision. Order of checks: rapid-rejoin throttle → buy-in bounds → rathole minimum
// → wallet funding. A disconnect within reconnectGraceSeconds is exempt from BOTH the rapid-
// rejoin throttle and the rathole rule (it is a resume, not a fresh join).
export function evaluateRejoin(ctx: RejoinContext, cfg: RatholingConfig): RejoinDecision {
  const d = ctx.lastDeparture
  const isGraceReconnect =
    !!d &&
    d.tableId === ctx.tableId &&
    d.kind === 'disconnect' &&
    ctx.nowMs - d.leftAtMs <= cfg.reconnectGraceSeconds * 1000

  const requiredMin = minReturnBuyIn(ctx, cfg)

  if (!isGraceReconnect && isRapidRejoinBlocked(ctx, cfg)) {
    return { ok: false, reason: 'rapid_rejoin', requiredMinBuyInChips: requiredMin }
  }
  if (ctx.requestedBuyInChips > ctx.buyInBounds.max) {
    return { ok: false, reason: 'above_max_buyin', requiredMinBuyInChips: requiredMin }
  }
  if (ctx.requestedBuyInChips < requiredMin) {
    // Distinguish a plain-min shortfall from a rathole shortfall for clearer UX.
    const reason: RejoinReason = requiredMin > ctx.buyInBounds.min ? 'rathole_min_return' : 'below_min_buyin'
    return { ok: false, reason, requiredMinBuyInChips: requiredMin }
  }
  if (ctx.walletBalanceChips < ctx.requestedBuyInChips) {
    return { ok: false, reason: 'insufficient_wallet', requiredMinBuyInChips: requiredMin }
  }
  return { ok: true, reason: 'ok', requiredMinBuyInChips: requiredMin }
}
