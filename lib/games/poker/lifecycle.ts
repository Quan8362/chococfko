// ── Poker cash-table LIFECYCLE decision layer (PURE, deterministic, integer-only) ──────
//
// PURE module — no React, no Supabase, no clock. The single TS source of truth for the
// non-coin lifecycle DECISIONS the server actions and the DB RPCs must agree on:
//   • table-config validation (TABLE-* / BUYIN-* bounds, fixed clock, no rake/ante/straddle),
//   • the seat finite-state machine (SEAT-* / JOIN-* / SITOUT-* / LEAVE-* / BUST-*),
//   • reservation-expiry math, and
//   • the spectator-safe lobby projection (never exposes a password or secret).
//
// The DATABASE remains the authoritative enforcer (SECURITY DEFINER RPCs, FOR UPDATE, RLS);
// this module mirrors those rules so the 'use server' actions can reject obviously-invalid
// intent early and so the rules are unit-testable WITHOUT a database. Coins stay integer
// (COIN-INT-001) — never floating point. See docs/poker/rules/state-machine.md §1–2.

import { DEFAULT_MIN_BUY_IN_BB, DEFAULT_MAX_BUY_IN_BB, buyInBounds } from './economy.ts'
import type { SeatStatus } from '../shared/contracts.ts'

// ── Fixed table constants (this product's cash-table rules) ────────────────────────────
export const POKER_ACTION_TIME_SECONDS = 20 // CLOCK-BASE-001 — base time to act
export const POKER_TIME_BANK_SECONDS = 15 // CLOCK-BANK-001 — extra bank beyond base
export const POKER_RAKE_BPS = 0 // no rake
export const POKER_ANTE = 0 // no ante
export const POKER_STRADDLE_ENABLED = false // no straddle
export const POKER_MIN_SEATS = 2
export const POKER_MAX_SEATS = 6
export const POKER_TABLE_NAME_MAX = 60
// Seat reservation hold (must match poker_reserve_seat's interval in migration_poker_economy.sql).
export const POKER_RESERVATION_TTL_SECONDS = 30
// An OPEN table with no occupied seat, idle longer than this, may be reaped/closed (TABLE-IDLE-001).
export const POKER_TABLE_IDLE_TTL_SECONDS = 600
// Prolonged sit-out / busted-no-rebuy → auto stand-up (SITOUT-TTL-001).
export const POKER_SITOUT_TTL_SECONDS = 1800

export { DEFAULT_MIN_BUY_IN_BB, DEFAULT_MAX_BUY_IN_BB }

export type TableStatus = 'open' | 'closing' | 'closed'
export type PostBbPolicy = 'post' | 'wait'

// ── Table config validation (server re-validates ALL host settings — never trusts client) ─
export interface TableConfigInput {
  readonly name: string
  readonly smallBlind: number
  readonly bigBlind: number
  readonly capacity?: number
  readonly isPrivate?: boolean
  readonly password?: string
  readonly minBuyInBb?: number
  readonly maxBuyInBb?: number
  readonly allowSpectators?: boolean
}

export interface TableConfig {
  readonly name: string
  readonly smallBlind: number
  readonly bigBlind: number
  readonly capacity: number
  readonly isPrivate: boolean
  readonly password: string | null
  readonly minBuyInBb: number
  readonly maxBuyInBb: number
  readonly allowSpectators: boolean
  readonly actionTimeSeconds: number
  readonly timeBankSeconds: number
  readonly rakeBps: number
  readonly ante: number
  readonly straddleEnabled: boolean
}

export type ConfigError =
  | 'name_required'
  | 'name_too_long'
  | 'invalid_blinds'
  | 'invalid_capacity'
  | 'invalid_buyin_bb'
  | 'password_required'

export type ConfigResult =
  | { readonly ok: true; readonly config: TableConfig }
  | { readonly ok: false; readonly error: ConfigError }

const isPosInt = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0

// Validate + normalize a host's table settings. Pure mirror of the DB CHECKs and createTable.
export function validateTableConfig(input: TableConfigInput): ConfigResult {
  const name = (input.name ?? '').trim()
  if (!name) return { ok: false, error: 'name_required' }
  if (name.length > POKER_TABLE_NAME_MAX) return { ok: false, error: 'name_too_long' }

  const sb = input.smallBlind
  const bb = input.bigBlind
  if (!isPosInt(sb) || !isPosInt(bb) || bb < sb) return { ok: false, error: 'invalid_blinds' }

  const capacity = input.capacity ?? POKER_MAX_SEATS
  if (!Number.isInteger(capacity) || capacity < POKER_MIN_SEATS || capacity > POKER_MAX_SEATS) {
    return { ok: false, error: 'invalid_capacity' }
  }

  const minBuyInBb = input.minBuyInBb ?? DEFAULT_MIN_BUY_IN_BB
  const maxBuyInBb = input.maxBuyInBb ?? DEFAULT_MAX_BUY_IN_BB
  if (!isPosInt(minBuyInBb) || !isPosInt(maxBuyInBb) || maxBuyInBb < minBuyInBb) {
    return { ok: false, error: 'invalid_buyin_bb' }
  }

  const isPrivate = !!input.isPrivate
  const password = (input.password ?? '').trim()
  if (isPrivate && !password) return { ok: false, error: 'password_required' }

  return {
    ok: true,
    config: {
      name,
      smallBlind: sb,
      bigBlind: bb,
      capacity,
      isPrivate,
      password: isPrivate ? password : null,
      minBuyInBb,
      maxBuyInBb,
      allowSpectators: input.allowSpectators ?? true,
      actionTimeSeconds: POKER_ACTION_TIME_SECONDS,
      timeBankSeconds: POKER_TIME_BANK_SECONDS,
      rakeBps: POKER_RAKE_BPS,
      ante: POKER_ANTE,
      straddleEnabled: POKER_STRADDLE_ENABLED,
    },
  }
}

// ── Buy-in / top-up bound checks (integer coins) ───────────────────────────────────────
// A fresh buy-in must land in [minBb×BB, maxBb×BB] (BUYIN-MIN-001 / BUYIN-MAX-001).
export function isBuyInAmountValid(
  amount: number,
  bigBlind: number,
  minBuyInBb: number = DEFAULT_MIN_BUY_IN_BB,
  maxBuyInBb: number = DEFAULT_MAX_BUY_IN_BB,
): boolean {
  if (!isPosInt(amount)) return false
  const { min, max } = buyInBounds(bigBlind, minBuyInBb, maxBuyInBb)
  return amount >= min && amount <= max
}

// A top-up may not push (stack + pending + amount) above the table cap maxBb×BB (TOPUP-001).
export function isTopUpAllowed(
  amount: number,
  currentStack: number,
  pendingTopUp: number,
  bigBlind: number,
  maxBuyInBb: number = DEFAULT_MAX_BUY_IN_BB,
): boolean {
  if (!isPosInt(amount)) return false
  if (!Number.isInteger(currentStack) || currentStack < 0) return false
  if (!Number.isInteger(pendingTopUp) || pendingTopUp < 0) return false
  const { max } = buyInBounds(bigBlind, 1, maxBuyInBb)
  return currentStack + pendingTopUp + amount <= max
}

// ── Seat finite-state machine (lifecycle scope: no in-hand sub-states) ─────────────────
// Mirrors docs/poker/rules/state-machine.md §2. DISCONNECTED is modeled orthogonally (a
// `disconnected_at` flag on the seat), NOT as a status — a disconnected player keeps their
// seat status (sitting_in / sitting_out) and stack untouched (RECONNECT-001).
export const SEAT_TRANSITIONS: Record<SeatStatus, readonly SeatStatus[]> = {
  empty: ['reserved', 'sitting_in'],
  reserved: ['sitting_in', 'empty'],
  sitting_in: ['sitting_out', 'leaving', 'busted', 'empty'],
  sitting_out: ['sitting_in', 'leaving', 'empty'],
  leaving: ['empty'],
  busted: ['sitting_in', 'leaving', 'empty'],
}

export function canSeatTransition(from: SeatStatus, to: SeatStatus): boolean {
  return SEAT_TRANSITIONS[from]?.includes(to) ?? false
}

// A reservation is stale once its hold has elapsed (RESERVED timeout → refund & EMPTY).
export function isReservationExpired(reservedUntilMs: number | null, nowMs: number): boolean {
  if (reservedUntilMs === null) return true
  return nowMs >= reservedUntilMs
}

// ── Lobby projection (authoritative, spectator-safe — NEVER carries a password/secret) ─
export interface LobbyTableRaw {
  readonly id: string
  readonly name: string
  readonly isPrivate: boolean
  readonly smallBlind: number
  readonly bigBlind: number
  readonly minBuyInBb: number
  readonly maxBuyInBb: number
  readonly capacity: number
  readonly occupiedSeats: number
  readonly status: TableStatus
  readonly allowSpectators: boolean
  readonly createdAt: number // epoch ms
  readonly lastActivityAt: number // epoch ms
}

export interface LobbyTable {
  readonly tableId: string
  readonly name: string
  readonly isPrivate: boolean
  readonly smallBlind: number
  readonly bigBlind: number
  readonly minBuyIn: number // integer coins
  readonly maxBuyIn: number // integer coins
  readonly minBuyInBb: number
  readonly maxBuyInBb: number
  readonly occupiedSeats: number
  readonly capacity: number
  readonly status: TableStatus
  readonly allowSpectators: boolean
  readonly createdAt: number
  readonly lastActivityAt: number
  readonly joinable: boolean // a free seat AND open
  readonly spectatable: boolean // spectators allowed AND not closed
}

// A table accepts a new seated player only while OPEN with at least one free seat.
export function isTableJoinable(status: TableStatus, occupiedSeats: number, capacity: number): boolean {
  return status === 'open' && occupiedSeats < capacity
}

export function projectLobbyTable(raw: LobbyTableRaw): LobbyTable {
  const { min, max } = buyInBounds(raw.bigBlind, raw.minBuyInBb, raw.maxBuyInBb)
  return {
    tableId: raw.id,
    name: raw.name,
    isPrivate: raw.isPrivate,
    smallBlind: raw.smallBlind,
    bigBlind: raw.bigBlind,
    minBuyIn: min,
    maxBuyIn: max,
    minBuyInBb: raw.minBuyInBb,
    maxBuyInBb: raw.maxBuyInBb,
    occupiedSeats: raw.occupiedSeats,
    capacity: raw.capacity,
    status: raw.status,
    allowSpectators: raw.allowSpectators,
    createdAt: raw.createdAt,
    lastActivityAt: raw.lastActivityAt,
    joinable: isTableJoinable(raw.status, raw.occupiedSeats, raw.capacity),
    spectatable: raw.allowSpectators && raw.status !== 'closed',
  }
}

// An empty, idle, hand-free table is safe to reap/close (TABLE-IDLE-001). Never closes a table
// that still has an occupied seat or a live hand — those resolve first (CLOSING → CLOSED).
export function isTableReapable(
  occupiedSeats: number,
  hasLiveHand: boolean,
  lastActivityAtMs: number,
  nowMs: number,
  idleTtlSeconds: number = POKER_TABLE_IDLE_TTL_SECONDS,
): boolean {
  if (occupiedSeats > 0 || hasLiveHand) return false
  return nowMs - lastActivityAtMs >= idleTtlSeconds * 1000
}
