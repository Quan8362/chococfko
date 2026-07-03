// ── Poker progress recorder (server, NOT 'use server') ─────────────────────────────────────
//
// Called from the AUTHORITATIVE settlement path (actions.ts#settleHand) right after coins have
// settled. Derives the cosmetic achievement + mission awards for a completed hand from the
// server's OWN settlement facts and records them via the idempotent DEFINER RPC
// poker_record_hand_progress. This module is NOT a 'use server' file — it takes a service-role
// client and is invoked only by trusted server code, never from the browser.
//
// 🔴 Two invariants this module must never break:
//   • BEST-EFFORT: it must NEVER throw into the settlement path. A recording failure (missing
//     migration, transient error) is swallowed — a hand's coins are already settled and correct.
//   • ZERO COINS: it only calls poker_record_hand_progress, which moves no coins. It reads
//     poker_hole_cards / poker_actions / poker_tables (public-ish) and NEVER logs a hole card.

import { createAdminClient } from '@/lib/supabase/admin'
import { handContributions, type HandState } from '@/lib/games/poker/hand'
import type { ShowdownResult } from '@/lib/games/poker/showdown'
import type { Card } from '@/lib/games/poker/types'
import {
  awardsForHand,
  winningCategoryLabel,
  type SeatHandFact,
} from '@/lib/games/poker/achievements'
import {
  handMissionIncrements,
  isBeginnerBigBlind,
  missionDef,
  type HandMissionFact,
} from '@/lib/games/poker/missions'
import { getEconomyConfig } from '@/lib/games/poker/economyConfig'

type AdminClient = ReturnType<typeof createAdminClient>

// The big blinds of every configured tier — used to decide the beginner-blind mission. Pure,
// derived from the ACTIVE economy config so the ceiling follows the config, not a magic number.
function tierBigBlinds(): number[] {
  return getEconomyConfig().blindTiers.map((t) => t.bigBlind)
}

// Record achievement + mission progress for one just-settled hand. Best-effort; never throws.
export async function recordHandProgress(
  admin: AdminClient,
  tableId: string,
  handId: string,
  state: HandState,
  showdown: ShowdownResult,
  holeBySeat: ReadonlyMap<number, readonly [Card, Card]>,
): Promise<void> {
  try {
    const contribs = handContributions(state)
    const seatCount = contribs.length
    if (seatCount === 0) return

    // seat → user (every dealt seat has a hole-cards row carrying user_id).
    const { data: holeRows } = await admin
      .from('poker_hole_cards')
      .select('seat_index, user_id')
      .eq('hand_id', handId)
    const userBySeat = new Map<number, string>()
    for (const r of holeRows ?? []) if (r.user_id) userBySeat.set(r.seat_index, r.user_id as string)
    if (userBySeat.size === 0) return

    // Per-seat won flags from the authoritative showdown result.
    const payoutBySeat = new Map<number, number>()
    for (const p of showdown.payouts) payoutBySeat.set(p.seatIndex, (payoutBySeat.get(p.seatIndex) ?? 0) + p.amount)
    const splitWinners = new Set<number>()
    const sideWinners = new Set<number>()
    showdown.winnersByPot.forEach((winners, potIndex) => {
      const potAmount = showdown.pots[potIndex]?.amount ?? 0
      if (winners.length >= 2) for (const s of winners) splitWinners.add(s)
      if (potIndex >= 1 && potAmount > 0) for (const s of winners) sideWinners.add(s)
    })
    const board = [...state.board] as Card[]

    // Which seats performed a legal 'check' this hand (for the use_check mission).
    const { data: actionRows } = await admin
      .from('poker_actions')
      .select('seat_index, type')
      .eq('hand_id', handId)
    const checkedSeats = new Set<number>()
    for (const a of actionRows ?? []) if (a.type === 'check') checkedSeats.add(a.seat_index)

    // Which users reconnected during this hand (degrade-safe: table may be absent).
    const reconnectedUsers = new Set<string>()
    try {
      const { data: recon } = await admin
        .from('poker_reconnect_events')
        .select('user_id')
        .eq('hand_id', handId)
      for (const r of recon ?? []) if (r.user_id) reconnectedUsers.add(r.user_id as string)
    } catch { /* reconnect marker is optional */ }

    // Table big blind (for the beginner-blind mission).
    const { data: table } = await admin
      .from('poker_tables')
      .select('big_blind')
      .eq('id', tableId)
      .maybeSingle()
    const bigBlind = Number(table?.big_blind ?? 0)
    const atBeginnerBlind = isBeginnerBigBlind(bigBlind, tierBigBlinds())

    const foldedBySeat = new Map<number, boolean>()
    for (const c of contribs) foldedBySeat.set(c.seatIndex, c.folded)

    // Build the per-seat settlement facts (only seats with a resolved user).
    const seatFacts: SeatHandFact[] = []
    const missionBySeat = new Map<number, ReturnType<typeof handMissionIncrements>>()
    for (const c of contribs) {
      const userId = userBySeat.get(c.seatIndex)
      if (!userId) continue
      const payout = payoutBySeat.get(c.seatIndex) ?? 0
      const wonAtShowdown = showdown.wentToShowdown && payout > 0 && !c.folded
      const category = wonAtShowdown ? winningCategoryLabel(holeBySeat.get(c.seatIndex), board) : null
      seatFacts.push({
        userId,
        seatIndex: c.seatIndex,
        folded: c.folded,
        payout,
        wonAtShowdown,
        wonSplitPot: splitWinners.has(c.seatIndex),
        wonSidePot: sideWinners.has(c.seatIndex),
        winningCategoryLabel: category,
        reconnectedDuringHand: reconnectedUsers.has(userId),
      })
      const reachedShowdown = showdown.wentToShowdown && !c.folded
      const missionFact: HandMissionFact = {
        playedHand: true,
        usedCheckLegally: checkedSeats.has(c.seatIndex),
        reachedShowdown,
        atBeginnerBlind,
      }
      missionBySeat.set(c.seatIndex, handMissionIncrements(missionFact))
    }
    if (seatFacts.length === 0) return

    const awards = awardsForHand({ seatCount, seats: seatFacts })

    // Assemble the RPC payload (achievements + counter + milestones + missions per user).
    const entries = awards.map((a, i) => {
      const fact = seatFacts[i]
      const missions = (missionBySeat.get(fact.seatIndex) ?? []).map((m) => ({
        key: m.key,
        inc: m.inc,
        target: missionDef(m.key).target,
      }))
      return {
        user_id: a.userId,
        achievements: a.achievements,
        counts_hand: a.countsHand,
        reached_showdown: fact.wonAtShowdown || (showdown.wentToShowdown && !fact.folded),
        milestones: a.milestones.map((m) => ({ key: m.key, at: m.at })),
        missions,
      }
    })

    await admin.rpc('poker_record_hand_progress', { p_hand_id: handId, p_entries: entries })
  } catch {
    // Best-effort: settlement already succeeded. A missing migration or transient error here
    // must never wedge a hand. (No card/PII is logged — swallow silently.)
  }
}
