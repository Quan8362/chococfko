'use server'

// ── Poker player-facing ECOSYSTEM server actions ───────────────────────────────────────
//
// 'use server' — authoritative reads/commands for the surrounding poker screens (lobby quick
// play, hand history + replay, profile statistics, report/block). Identity is ALWAYS resolved
// server-side from the session cookie (auth.uid()); the browser never supplies its own id and
// never decides matching, winnings, or stats.
//
// 🔴 PRIVACY (security-model §2): history/replay expose ONLY public data (board, public actions,
// pots, the legally-revealed showdown cards) plus the VIEWER's OWN hole cards (read-own). They
// NEVER reveal another player's hidden hole cards. Settlement payouts are the public outcome.
//
// COINS: integer-only (COIN-INT-001). Net stack change per hand = (payout + refund) − the
// viewer's own contribution, derived from the authoritative engine state + settlement record.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { deserializeHand, handContributions, type SerializedHand } from '@/lib/games/poker/hand'
import { detectUncalledRefund, type SeatContribution } from '@/lib/games/poker/pot'
import { seatHandOutcome, aggregatePokerStats, seatPayoutAmount, type HandForStats } from '@/lib/games/poker/stats'
import { projectLobbyTable, type LobbyTableRaw, type LobbyTable } from '@/lib/games/poker/lifecycle'
import { POKER_ENTRY_MIN_BALANCE } from '@/lib/games/poker/economy'
import type { Card, HoleCards, Pots, PokerActionType } from '@/lib/games/poker/types'
import { checkPokerCapability } from './access'
import { ensurePokerWallet } from './wallet-server'

export type EcoResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

// A missing social table (migration not yet applied) must NOT break the page — degrade safely.
function isMissingRelation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false
  return err.code === '42P01' || /relation .* does not exist/i.test(err.message ?? '')
}


// ── quickPlay — deterministic server-side seat matching (NEVER a private table) ──────────
// Picks the best OPEN, PUBLIC table that has a free seat and that the caller can afford
// (wallet ≥ entry gate AND wallet ≥ table min buy-in). Optional big-blind preference. Returns
// the chosen tableId; the table page handles the authoritative buy-in (poker_sit_down re-checks
// the wallet, bounds and gate). Returns no_open_table when nothing matches.
export async function quickPlay(preferredBigBlind?: number): Promise<EcoResult<{ tableId: string }>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('not_authenticated')

  // Quick play seats the caller at a PUBLIC table — gate on the public-lobby capability.
  const capErr = await checkPokerCapability('public_lobby')
  if (capErr) return fail(capErr)

  // Bootstrap the shared wallet (idempotent signup faucet) so a poker-first player is funded exactly
  // like a TLMN-first player — otherwise the entry gate would read a 0 balance and reject them.
  const balance = await ensurePokerWallet()
  if (balance < POKER_ENTRY_MIN_BALANCE) return fail('below_entry_gate')

  const admin = createAdminClient()
  const { data: tables, error } = await admin
    .from('poker_tables')
    .select('id, big_blind, min_buy_in_bb, capacity, status, is_private, created_at')
    .eq('status', 'open')
    .eq('is_private', false)
  if (error) return fail('quick_failed')

  const candidates = tables ?? []
  if (candidates.length === 0) return fail('no_open_table')

  const ids = candidates.map((t) => t.id)
  const { data: seatRows } = await admin
    .from('poker_seats')
    .select('table_id, user_id')
    .in('table_id', ids)
  const occupied = new Map<string, number>()
  const alreadyHere = new Set<string>()
  for (const s of seatRows ?? []) {
    if (s.user_id) {
      occupied.set(s.table_id, (occupied.get(s.table_id) ?? 0) + 1)
      if (s.user_id === user.id) alreadyHere.add(s.table_id)
    }
  }

  const affordable = candidates
    .filter((t) => !alreadyHere.has(t.id))
    .filter((t) => (occupied.get(t.id) ?? 0) < t.capacity)
    .filter((t) => balance >= t.big_blind * t.min_buy_in_bb)

  if (affordable.length === 0) return fail('no_open_table')

  // Deterministic ranking: honour the blind preference first; then prefer a table that already
  // has players (so the caller lands in live action, not an empty seat); then the smallest
  // blinds; then the oldest table. Pure, stable ordering → the same input picks the same seat.
  const ranked = affordable.sort((a, b) => {
    const aPref = preferredBigBlind && a.big_blind === preferredBigBlind ? 0 : 1
    const bPref = preferredBigBlind && b.big_blind === preferredBigBlind ? 0 : 1
    if (aPref !== bPref) return aPref - bPref
    const aOcc = occupied.get(a.id) ?? 0
    const bOcc = occupied.get(b.id) ?? 0
    if (aOcc !== bOcc) return bOcc - aOcc
    if (a.big_blind !== b.big_blind) return a.big_blind - b.big_blind
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  })
  return { ok: true, tableId: ranked[0].id }
}

// ── listRecentTables — tables the caller recently sat at / joined (still not closed) ─────
export async function listRecentTables(limit = 6): Promise<EcoResult<{ tables: LobbyTable[] }>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: true, tables: [] }

  const admin = createAdminClient()
  const { data: members } = await admin
    .from('poker_table_members')
    .select('table_id, last_seen_at')
    .eq('user_id', user.id)
    .order('last_seen_at', { ascending: false })
    .limit(limit * 3)
  const ids = Array.from(new Set((members ?? []).map((m) => m.table_id))).slice(0, limit * 2)
  if (ids.length === 0) return { ok: true, tables: [] }

  const { data: tables } = await admin
    .from('poker_tables')
    .select('id, name, is_private, small_blind, big_blind, min_buy_in_bb, max_buy_in_bb, capacity, status, allow_spectators, created_at, updated_at')
    .in('id', ids)
    .neq('status', 'closed')
  const { data: seatRows } = await admin
    .from('poker_seats')
    .select('table_id, user_id')
    .in('table_id', ids)
  const occ = new Map<string, number>()
  for (const s of seatRows ?? []) if (s.user_id) occ.set(s.table_id, (occ.get(s.table_id) ?? 0) + 1)

  const order = new Map(ids.map((id, i) => [id, i]))
  const projected = (tables ?? [])
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .slice(0, limit)
    .map((t) => {
      const raw: LobbyTableRaw = {
        id: t.id, name: t.name, isPrivate: !!t.is_private, smallBlind: t.small_blind, bigBlind: t.big_blind,
        minBuyInBb: t.min_buy_in_bb, maxBuyInBb: t.max_buy_in_bb, capacity: t.capacity,
        occupiedSeats: occ.get(t.id) ?? 0, status: t.status as LobbyTableRaw['status'],
        allowSpectators: !!t.allow_spectators, createdAt: new Date(t.created_at).getTime(),
        lastActivityAt: new Date(t.updated_at).getTime(),
      }
      return projectLobbyTable(raw)
    })
  return { ok: true, tables: projected }
}

// ── Hand-history shared types ───────────────────────────────────────────────────────────
export interface HandHistoryRow {
  handId: string
  handNo: number
  tableId: string
  tableName: string
  smallBlind: number
  bigBlind: number
  completedAt: number | null
  potTotal: number
  net: number // integer coins (can be negative)
  result: 'won' | 'lost' | 'even'
}

// Deserialize an engine state → the authoritative per-seat contributions (total committed +
// folded flag) the settlement was computed from. This carries everything net/showdown derivation
// needs: the committed amount, the fold state, and (via detectUncalledRefund) the uncalled refund.
function contribsFromEngine(engine: SerializedHand): SeatContribution[] {
  return handContributions(deserializeHand(engine))
}

// ── fetchHandHistory — the caller's OWN completed hands (read-own gated) ─────────────────
export async function fetchHandHistory(limit = 25): Promise<EcoResult<{ hands: HandHistoryRow[] }>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('not_authenticated')

  // RLS read-own: which hands was I dealt into, and at which seat. Order by recency so the 500-row
  // cap keeps the MOST RECENT hands (served by poker_hole_cards_user_recent_idx) instead of an
  // arbitrary window — a heavy player's latest hands were previously at risk of being truncated.
  const { data: mine } = await supabase
    .from('poker_hole_cards')
    .select('hand_id, seat_index')
    .order('created_at', { ascending: false })
    .limit(500)
  const seatByHand = new Map<string, number>()
  for (const r of mine ?? []) seatByHand.set(r.hand_id, r.seat_index)
  if (seatByHand.size === 0) return { ok: true, hands: [] }

  const admin = createAdminClient()
  const { data: hands } = await admin
    .from('poker_hands')
    .select('id, hand_no, table_id, completed_at')
    .in('id', Array.from(seatByHand.keys()))
    .eq('phase', 'COMPLETED')
    .order('completed_at', { ascending: false })
    .limit(limit)
  const page = hands ?? []
  if (page.length === 0) return { ok: true, hands: [] }

  const handIds = page.map((h) => h.id)
  const tableIds = Array.from(new Set(page.map((h) => h.table_id)))
  const [{ data: tables }, { data: settlements }, { data: states }] = await Promise.all([
    admin.from('poker_tables').select('id, name, small_blind, big_blind').in('id', tableIds),
    admin.from('poker_hand_settlements').select('hand_id, payouts, total_contributed').in('hand_id', handIds),
    admin.from('poker_hand_state').select('hand_id, engine_state').in('hand_id', handIds),
  ])
  const tableById = new Map((tables ?? []).map((t) => [t.id, t]))
  const settleByHand = new Map((settlements ?? []).map((s) => [s.hand_id, s]))
  const stateByHand = new Map((states ?? []).map((s) => [s.hand_id, s.engine_state as SerializedHand]))

  const rows: HandHistoryRow[] = page.map((h) => {
    const seat = seatByHand.get(h.id)!
    const tbl = tableById.get(h.table_id)
    const settle = settleByHand.get(h.id)
    const engine = stateByHand.get(h.id)
    const payouts = (settle?.payouts as { seatIndex: number; amount: number }[] | undefined) ?? null
    // net = payout + uncalled refund − committed (the refund is credited at settlement but NOT
    // stored in the payouts audit, so it is reconstructed from the engine contributions).
    const outcome = engine ? seatHandOutcome(contribsFromEngine(engine), payouts, seat) : null
    const net = outcome ? outcome.net : seatPayoutAmount(payouts, seat)
    return {
      handId: h.id,
      handNo: h.hand_no,
      tableId: h.table_id,
      tableName: tbl?.name ?? '',
      smallBlind: tbl?.small_blind ?? 0,
      bigBlind: tbl?.big_blind ?? 0,
      completedAt: h.completed_at ? new Date(h.completed_at).getTime() : null,
      potTotal: settle ? Number(settle.total_contributed) : 0,
      net,
      result: net > 0 ? 'won' : net < 0 ? 'lost' : 'even',
    }
  })
  return { ok: true, hands: rows }
}

// ── Hand detail + replay ────────────────────────────────────────────────────────────────
export type ReplayStreet = 'PREFLOP' | 'FLOP' | 'TURN' | 'RIVER' | 'SHOWDOWN'
export interface HandActionEntry {
  seatIndex: number
  street: ReplayStreet
  type: PokerActionType | 'post_sb' | 'post_bb' | 'timeout_fold' | 'timeout_check'
  amount: number | null
  actionSeq: number
}
export interface HandPlayerEntry {
  seatIndex: number
  userId: string | null
  displayName: string | null
  contributed: number
  payout: number
  net: number
  folded: boolean
  isViewer: boolean
  revealedCards: HoleCards | null // only legally revealed (showdown) OR the viewer's own
}
export interface HandDetail {
  handId: string
  handNo: number
  tableId: string
  tableName: string
  smallBlind: number
  bigBlind: number
  completedAt: number | null
  board: Card[]
  pots: Pots
  players: HandPlayerEntry[]
  actions: HandActionEntry[]
  viewerSeatIndex: number | null
}

export async function fetchHandDetail(handId: string): Promise<EcoResult<{ detail: HandDetail }>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Public projection: board / reveal / pots are all public-safe columns.
  const { data: hand } = await supabase
    .from('poker_hands')
    .select('id, hand_no, table_id, phase, board, pots, reveal, completed_at')
    .eq('id', handId)
    .maybeSingle()
  if (!hand) return fail('not_found')

  const { data: table } = await supabase
    .from('poker_tables')
    .select('id, name, small_blind, big_blind')
    .eq('id', hand.table_id)
    .maybeSingle()

  // Public actions (poker_actions is SELECT(true)) — the replay event source.
  const { data: actionRows } = await supabase
    .from('poker_actions')
    .select('seat_index, street, type, amount, action_seq, user_id')
    .eq('hand_id', handId)
    .order('action_seq', { ascending: true })

  const admin = createAdminClient()
  const [{ data: settle }, { data: stateRow }] = await Promise.all([
    admin.from('poker_hand_settlements').select('payouts, total_contributed').eq('hand_id', handId).maybeSingle(),
    admin.from('poker_hand_state').select('engine_state').eq('hand_id', handId).maybeSingle(),
  ])

  const contribs = stateRow?.engine_state ? contribsFromEngine(stateRow.engine_state as SerializedHand) : []
  const contribBySeat = new Map<number, number>()
  const foldedSeats = new Set<number>()
  for (const c of contribs) {
    contribBySeat.set(c.seatIndex, c.committed)
    if (c.folded) foldedSeats.add(c.seatIndex)
  }
  // Uncalled refund (POT-UNCALLED-001): credited at settlement but absent from the payouts audit,
  // so reconstruct it here to report each seat's true net = payout + refund − committed.
  const uncalledRefund = contribs.length > 0 ? detectUncalledRefund(contribs) : null

  // The viewer's seat (so we may show ONLY their own hole cards) + their own hole cards.
  let viewerSeatIndex: number | null = null
  let ownHole: HoleCards | null = null
  if (user) {
    const { data: ownRow } = await supabase
      .from('poker_hole_cards')
      .select('seat_index, cards')
      .eq('hand_id', handId)
      .maybeSingle()
    if (ownRow) {
      viewerSeatIndex = ownRow.seat_index
      ownHole = ownRow.cards as HoleCards
    }
  }

  // Legally revealed showdown cards (public, non-muckers only).
  const reveal = (hand.reveal as { seatIndex: number; cards: HoleCards }[] | null) ?? []
  const revealBySeat = new Map(reveal.map((r) => [r.seatIndex, r.cards]))

  // Resolve display names best-effort from profiles for the user_ids that acted.
  const userBySeat = new Map<number, string>()
  for (const a of actionRows ?? []) if (a.user_id) userBySeat.set(a.seat_index, a.user_id)
  let nameByUser = new Map<string, string>()
  const userIds = Array.from(new Set(userBySeat.values()))
  if (userIds.length) {
    const { data: profs } = await admin.from('profiles').select('id, display_name').in('id', userIds)
    nameByUser = new Map((profs ?? []).map((p) => [p.id, p.display_name as string]))
  }

  const seatSet = new Set<number>([
    ...Array.from(contribBySeat.keys()),
    ...(actionRows ?? []).map((a) => a.seat_index),
    ...Array.from(revealBySeat.keys()),
  ])
  if (viewerSeatIndex !== null) seatSet.add(viewerSeatIndex)

  const players: HandPlayerEntry[] = Array.from(seatSet).sort((a, b) => a - b).map((seat) => {
    const contributed = contribBySeat.get(seat) ?? 0
    const payout = seatPayoutAmount(settle?.payouts as { seatIndex: number; amount: number }[] | undefined, seat)
    const refund = uncalledRefund && uncalledRefund.seatIndex === seat ? uncalledRefund.amount : 0
    const isViewer = seat === viewerSeatIndex
    const revealed = revealBySeat.get(seat) ?? (isViewer ? ownHole : null)
    const uid = userBySeat.get(seat)
    return {
      seatIndex: seat,
      userId: uid ?? null,
      displayName: uid ? (nameByUser.get(uid) ?? null) : null,
      contributed,
      payout,
      net: payout + refund - contributed,
      folded: foldedSeats.has(seat),
      isViewer,
      revealedCards: revealed ?? null,
    }
  })

  const actions: HandActionEntry[] = (actionRows ?? []).map((a) => ({
    seatIndex: a.seat_index,
    street: a.street as ReplayStreet,
    type: a.type as HandActionEntry['type'],
    amount: a.amount != null ? Number(a.amount) : null,
    actionSeq: a.action_seq,
  }))

  const detail: HandDetail = {
    handId: hand.id,
    handNo: hand.hand_no,
    tableId: hand.table_id,
    tableName: table?.name ?? '',
    smallBlind: table?.small_blind ?? 0,
    bigBlind: table?.big_blind ?? 0,
    completedAt: hand.completed_at ? new Date(hand.completed_at).getTime() : null,
    board: ((hand.board as Card[]) ?? []),
    pots: (hand.pots as Pots) ?? { main: { amount: 0, eligibleSeatIndexes: [] }, sides: [] },
    players,
    actions,
    viewerSeatIndex,
  }
  return { ok: true, detail }
}

// ── fetchPokerStats — the caller's authoritative play-money record ───────────────────────
export interface PokerStats {
  handsPlayed: number
  handsWon: number
  showdownsReached: number
  showdownsWon: number
  biggestPotWon: number
  netChange: number
}
export async function fetchPokerStats(): Promise<EcoResult<{ stats: PokerStats }>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('not_authenticated')

  const { data: mine } = await supabase
    .from('poker_hole_cards')
    .select('hand_id, seat_index')
    .limit(2000)
  const seatByHand = new Map<string, number>()
  for (const r of mine ?? []) seatByHand.set(r.hand_id, r.seat_index)
  if (seatByHand.size === 0) {
    return { ok: true, stats: { handsPlayed: 0, handsWon: 0, showdownsReached: 0, showdownsWon: 0, biggestPotWon: 0, netChange: 0 } }
  }

  const admin = createAdminClient()
  const handIds = Array.from(seatByHand.keys())
  const [{ data: hands }, { data: settlements }, { data: states }] = await Promise.all([
    admin.from('poker_hands').select('id, reveal').in('id', handIds).eq('phase', 'COMPLETED'),
    admin.from('poker_hand_settlements').select('hand_id, payouts').in('hand_id', handIds),
    admin.from('poker_hand_state').select('hand_id, engine_state').in('hand_id', handIds),
  ])
  const settleByHand = new Map((settlements ?? []).map((s) => [s.hand_id, s.payouts as { seatIndex: number; amount: number }[]]))
  const stateByHand = new Map((states ?? []).map((s) => [s.hand_id, s.engine_state as SerializedHand]))

  // Each COMPLETED hand the caller was dealt into, mapped to the authoritative inputs the pure
  // aggregator needs. The engine contributions (committed + folded) drive net (incl. the
  // reconstructed uncalled refund) and showdown participation (independent of muck/reveal); the
  // public reveal seats are a degrade-safe fallback only when the engine state is missing.
  const forStats: HandForStats[] = []
  for (const h of hands ?? []) {
    const seat = seatByHand.get(h.id)
    if (seat == null) continue
    const engine = stateByHand.get(h.id)
    const reveal = (h.reveal as { seatIndex: number; cards: HoleCards }[] | null) ?? []
    forStats.push({
      contribs: engine ? contribsFromEngine(engine) : null,
      payouts: settleByHand.get(h.id) ?? null,
      seat,
      revealSeats: reveal.map((r) => r.seatIndex),
    })
  }
  return { ok: true, stats: aggregatePokerStats(forStats) }
}

// ── Report / block — self-scoped, degrade-safe before the social migration is applied ────
export async function reportPlayer(
  reportedId: string,
  reason: 'cheating' | 'abuse' | 'collusion' | 'spam' | 'other',
  note?: string,
  tableId?: string,
): Promise<EcoResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('login_required')
  if (reportedId === user.id) return fail('self')

  const { error } = await supabase.from('poker_player_reports').insert({
    reporter_id: user.id,
    reported_id: reportedId,
    reason,
    note: (note ?? '').trim() || null,
    table_id: tableId ?? null,
  })
  if (error) {
    if (isMissingRelation(error)) return fail('feature_unavailable')
    return fail('report_failed')
  }
  return { ok: true }
}

export async function blockPlayer(blockedId: string): Promise<EcoResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('login_required')
  if (blockedId === user.id) return fail('self')
  const { error } = await supabase.from('poker_player_blocks').upsert({ blocker_id: user.id, blocked_id: blockedId })
  if (error) {
    if (isMissingRelation(error)) return fail('feature_unavailable')
    return fail('block_failed')
  }
  return { ok: true }
}

export async function unblockPlayer(blockedId: string): Promise<EcoResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('login_required')
  const { error } = await supabase.from('poker_player_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', blockedId)
  if (error) {
    if (isMissingRelation(error)) return fail('feature_unavailable')
    return fail('block_failed')
  }
  return { ok: true }
}

export async function listMyBlocks(): Promise<EcoResult<{ blocked: { userId: string; displayName: string | null }[] }>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: true, blocked: [] }
  const { data, error } = await supabase.from('poker_player_blocks').select('blocked_id').eq('blocker_id', user.id)
  if (error) {
    if (isMissingRelation(error)) return { ok: true, blocked: [] }
    return fail('block_failed')
  }
  const ids = (data ?? []).map((b) => b.blocked_id)
  if (ids.length === 0) return { ok: true, blocked: [] }
  const admin = createAdminClient()
  const { data: profs } = await admin.from('profiles').select('id, display_name').in('id', ids)
  const nameById = new Map((profs ?? []).map((p) => [p.id, p.display_name as string]))
  return { ok: true, blocked: ids.map((id) => ({ userId: id, displayName: nameById.get(id) ?? null })) }
}
