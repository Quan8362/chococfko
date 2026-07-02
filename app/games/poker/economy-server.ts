// ── Poker ECONOMY server-side resolution + rathole/rejoin guard (server-only) ──────────
//
// Plain async server helpers (NOT 'use server' actions) imported by the authoritative poker
// server actions. They resolve the ACTIVE economy config and enforce the config-driven blind-
// tier / buy-in / ratholing rules SERVER-SIDE, so the browser can never decide eligibility.
//
// AUTHORITY: the pure config + rules live in lib/games/poker/{economyConfig,ratholing}.ts. This
// module only wires them to the DB. It NEVER moves coins and NEVER writes a wallet/ledger row.
//
// DEGRADE-SAFE: the versioned-config DB table (migration_poker_economy_config.sql) and the
// seat-events log (migration_poker_seat_departures.sql) are PENDING. Until applied, config
// resolution falls back to the compiled TS default and the rathole guard fails OPEN (allow) —
// the authoritative buy-in bounds are still enforced by the poker_sit_down / poker_rebuy RPCs,
// so no coin rule is weakened; only the extra ratholing policy waits for its table.

import { createAdminClient } from '@/lib/supabase/admin'
import {
  getEconomyConfig,
  validateEconomyConfig,
  findTierByBlinds,
  type PokerEconomyConfig,
  type BlindTier,
} from '@/lib/games/poker/economyConfig'
import { buyInBounds, type BuyInBounds } from '@/lib/games/poker/economy'
import {
  evaluateRejoin,
  type RejoinDecision,
  type SeatDeparture,
  type DepartureKind,
} from '@/lib/games/poker/ratholing'

type Admin = ReturnType<typeof createAdminClient>

// Resolve the active economy config. Prefers the admin-activated DB row (once the config
// migration is applied); falls back to the compiled TS default. Any read/parse/validation
// failure resolves to the TS default so table creation never breaks on infra state.
export async function getActiveEconomyConfig(): Promise<PokerEconomyConfig> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('poker_get_active_economy_config')
    if (!error && data && typeof data === 'object') {
      const cfg = data as PokerEconomyConfig
      if (validateEconomyConfig(cfg).ok) return cfg
    }
  } catch {
    /* fall through to the compiled default */
  }
  return getEconomyConfig()
}

// ── Blind-tier + buy-in enforcement for table creation ─────────────────────────────────

export type TierCheck =
  | { ok: true; tier: BlindTier; minBuyInBb: number; maxBuyInBb: number }
  | { ok: false; error: 'unsupported_blind_tier' }

// The (SB,BB) a host requested must be a sanctioned tier; the buy-in bounds are DERIVED from
// that tier (not taken from the client), so buy-in limits always match the active tier.
export function checkBlindTier(cfg: PokerEconomyConfig, smallBlind: number, bigBlind: number): TierCheck {
  const tier = findTierByBlinds(cfg, smallBlind, bigBlind)
  if (!tier) return { ok: false, error: 'unsupported_blind_tier' }
  return { ok: true, tier, minBuyInBb: tier.minBuyInBb, maxBuyInBb: tier.maxBuyInBb }
}

// ── Seat-events log (best-effort) — the data the rathole guard reads ────────────────────
// One append-only row per seat lifecycle event. Written from the action layer (service role),
// NEVER moves coins. Absent table / any error → silently skipped (degrade-safe).

export type SeatEventKind = 'join' | DepartureKind // 'join' | 'stand_up' | 'disconnect' | 'busted'

export async function recordSeatEvent(
  admin: Admin,
  tableId: string,
  userId: string,
  seatIndex: number,
  kind: SeatEventKind,
  stackAtLeave = 0,
): Promise<void> {
  try {
    await admin.from('poker_seat_events').insert({
      table_id: tableId,
      user_id: userId,
      seat_index: seatIndex,
      kind,
      stack_at_leave: Math.max(0, Math.round(stackAtLeave)),
    })
  } catch {
    /* best-effort telemetry for the policy layer; never breaks gameplay */
  }
}

// Bounds for a live table from its stored blinds + per-table buy-in bb window.
export function tableBuyInBounds(bigBlind: number, minBuyInBb: number, maxBuyInBb: number): BuyInBounds {
  return buyInBounds(bigBlind, minBuyInBb, maxBuyInBb)
}

// Evaluate the rathole/rejoin guard for a (user,table) sit-down/rebuy attempt. Reads the recent
// seat-events for that pair, builds the pure RejoinContext, and returns the decision. FAILS OPEN
// (allow) on any infra error or when the events table is absent — the authoritative buy-in
// bounds in the RPC still apply. This runs on the SERVER, so a client cannot bypass it.
export async function evaluateRejoinGuard(
  admin: Admin,
  tableId: string,
  userId: string,
  bigBlind: number,
  minBuyInBb: number,
  maxBuyInBb: number,
  requestedBuyInChips: number,
  walletBalanceChips: number,
  cfg: PokerEconomyConfig,
): Promise<RejoinDecision> {
  const bounds = tableBuyInBounds(bigBlind, minBuyInBb, maxBuyInBb)
  const allow: RejoinDecision = { ok: true, reason: 'ok', requiredMinBuyInChips: bounds.min }
  try {
    const windowMs = Math.max(cfg.ratholing.retainedStackWindowMinutes, cfg.ratholing.rejoinWindowMinutes) * 60_000
    const sinceIso = new Date(Date.now() - windowMs - 60_000).toISOString()
    const { data, error } = await admin
      .from('poker_seat_events')
      .select('kind, stack_at_leave, created_at')
      .eq('table_id', tableId)
      .eq('user_id', userId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error || !data) return allow // table absent / not applied yet → fail open

    const now = Date.now()
    const departures = data.filter((r) => r.kind === 'stand_up' || r.kind === 'disconnect' || r.kind === 'busted')
    const lastDep = departures[0]
    const lastDeparture: SeatDeparture | undefined = lastDep
      ? {
          userId,
          tableId,
          leftAtMs: new Date(lastDep.created_at as string).getTime(),
          stackAtLeaveChips: (lastDep.stack_at_leave as number) ?? 0,
          kind: lastDep.kind as DepartureKind,
        }
      : undefined
    const recentRejoinTimestampsMs = data
      .filter((r) => r.kind === 'join')
      .map((r) => new Date(r.created_at as string).getTime())

    return evaluateRejoin(
      {
        userId,
        tableId,
        nowMs: now,
        requestedBuyInChips,
        walletBalanceChips,
        buyInBounds: bounds,
        lastDeparture,
        recentRejoinTimestampsMs,
      },
      cfg.ratholing,
    )
  } catch {
    return allow
  }
}
