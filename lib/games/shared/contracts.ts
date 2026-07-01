// ── Shared multiplayer infra: platform capability CONTRACTS (type-only) ────────────
//
// PURE module — TYPE-ONLY, no runtime, no React, no Supabase. Tested implicitly by the
// typecheck. Tiny pure helpers that belong with the contracts live at the bottom.
//
// These interfaces name the platform capabilities a new authoritative game (Poker first)
// depends on, and point at the EXISTING implementation that already fulfils each one. They
// are the documented seam between "shared platform" and "game-specific". A game codes to the
// interface; it does NOT reach across into another game's internals. Nothing here is a new
// system — it is the boundary made explicit so reuse is deliberate, not accidental.
//
// 🔴 PRIVACY: every snapshot/profile contract below is PUBLIC-projection only. Private state
// (a player's own cards) is fetched through a SEPARATE read-own path (PrivateStateFetch) and
// is never part of any shared/public type (security-model SECURITY-HOLE-CARDS-001).

// ── Authenticated identity ────────────────────────────────────────────────────────
// Authoritative identity is `auth.uid()` resolved SERVER-SIDE from the session cookie
// (lib/supabase/server.ts). The client never supplies its own id (security-model §1, C2).
export interface AuthenticatedPlayer {
  readonly userId: string
}

// ── Player profile (display) ────────────────────────────────────────────────────────
// Fulfilled by lib/userIdentity.ts `getUserIdentity()` (name + avatar, OAuth-aware).
export interface PlayerProfile {
  readonly userId: string
  readonly displayName: string | null
  readonly avatarUrl: string | null
}

// ── Game lobby metadata ─────────────────────────────────────────────────────────────
// The registry row each game contributes to app/games/page.tsx `GAMES[]`. Additive.
export interface GameLobbyMeta {
  readonly slug: string // e.g. 'poker'
  readonly route: string // e.g. '/games/poker'
  readonly enabled: boolean
}

// ── Room & seat membership ──────────────────────────────────────────────────────────
// Public room metadata (poker_tables) + public seat rows (poker_seats, incl. public stack).
// No private data. Mirrors the TLMN/Caro room+seat shape but with strict server-only writes.
export type SeatStatus =
  | 'empty'
  | 'reserved'
  | 'sitting_in'
  | 'sitting_out'
  | 'leaving'
  | 'busted'

export interface RoomMembership {
  readonly roomId: string
  readonly capacity: number
  readonly isPrivate: boolean
}

export interface SeatMembership {
  readonly roomId: string
  readonly seatIndex: number
  readonly userId: string | null
  readonly status: SeatStatus
  readonly stack: number // PUBLIC by design — pot math is public; only cards are secret.
}

// ── Authoritative snapshot loading ──────────────────────────────────────────────────
// The reconnect/refresh path: load the authoritative PUBLIC state with its `stateVersion`.
// `TPublic` must never contain cards/deck. Pairs with sequence.ts `shouldApplySnapshot`.
export interface AuthoritativeSnapshot<TPublic> {
  readonly roomId: string
  readonly stateVersion: number
  readonly public: TPublic
}

export interface SnapshotLoader<TPublic> {
  // Loads the public snapshot only — never selects another player's private state.
  fetchSnapshot(roomId: string): Promise<AuthoritativeSnapshot<TPublic> | null>
}

// ── Private (read-own) state fetch ──────────────────────────────────────────────────
// The ONLY path to private state: scoped to the caller via RLS read-own (anon client).
// e.g. fetchMyHoleCards. There is no shared type that carries another player's private data.
export interface PrivateStateFetch<TPrivate> {
  fetchMyPrivateState(roomId: string): Promise<TPrivate | null>
}

// ── Wallet & coin ledger ─────────────────────────────────────────────────────────────
// REUSES game_wallets / coin_ledger (lib/game/economy.ts + migration_tlmn_run7_economy.sql).
// Read-own balance; ALL mutation happens only inside SECURITY DEFINER RPCs (no client write).
export interface WalletAccess {
  getBalance(userId: string): Promise<number> // integer coins
}

export interface CoinLedgerEntry {
  readonly userId: string
  readonly delta: number // integer; +credit / -debit
  readonly balanceAfter: number
  readonly reason: string // stable vocabulary, e.g. 'poker_sit_down' (coin-model §7)
  readonly createdAt: number
}

export interface CoinLedgerReader {
  listEntries(userId: string, limit?: number): Promise<readonly CoinLedgerEntry[]>
}

// ── Game chat & notifications ───────────────────────────────────────────────────────
// Transient, NON-authoritative, PUBLIC-only channels. A game secret never rides chat or a
// broadcast notification (realtime-model §8, A1).
export interface GameChatMessage {
  readonly roomId: string
  readonly userId: string
  readonly body: string
  readonly createdAt: number
}

export interface GameChatChannel {
  send(roomId: string, body: string): Promise<void>
}

export interface GameNotifier {
  notify(userId: string, kind: string, payload: Record<string, unknown>): Promise<void>
}

// ── Client preferences (presentation-only) ──────────────────────────────────────────
// Sound + reduced-motion. Animations are presentation-only and never gate authoritative
// state (realtime-model §6, D3). Sound uses the module-level singleton AudioContext pattern
// (memory tlmn-mobile-layout-sound: one AudioContext unlocked by first user gesture).
export interface AudioPreference {
  readonly muted: boolean
}

export interface MotionPreference {
  readonly reduced: boolean // honour prefers-reduced-motion
}

// ── Admin audit ─────────────────────────────────────────────────────────────────────
// A uniform, append-only audit record for admin/server actions. NEVER carries a secret
// (no hole card, no deck card, no plaintext password) — security-model §7.
export interface AdminAuditRecord {
  readonly actorId: string | null // admin/user id, or null for system/cron
  readonly action: string // stable verb, e.g. 'poker_freeze_hand'
  readonly target: string // affected entity id, e.g. a hand id
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>
  readonly at: number // epoch ms
}

const SECRET_KEY = /\b(card|cards|hole|deck|stub|password|secret|token)\b/i

// Pure builder for an audit record with a built-in guard: it refuses metadata keys that look
// like they could leak a secret, making the privacy invariant structural rather than trusted.
export function buildAuditRecord(input: {
  actorId: string | null
  action: string
  target: string
  metadata?: Record<string, string | number | boolean | null>
  at?: number
}): AdminAuditRecord {
  const metadata = input.metadata ?? {}
  for (const key of Object.keys(metadata)) {
    if (SECRET_KEY.test(key)) {
      throw new Error(`buildAuditRecord: metadata key "${key}" may carry a secret — refused`)
    }
  }
  return {
    actorId: input.actorId,
    action: input.action,
    target: input.target,
    metadata: { ...metadata },
    at: input.at ?? Date.now(),
  }
}
