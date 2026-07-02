// ── Poker RANKING read-side loader (service role; server-only; READ-ONLY) ───────────────
//
// A plain async loader (NOT 'use server') that assembles PlayerRankStats from the AUTHORITATIVE
// settled-hand tables and produces a ranked leaderboard + collusion-risk signals. It is strictly
// read-only: it NEVER writes, NEVER moves coins, and NEVER returns hole cards / decks / seeds
// (it reads only seat_index / user_id / payout amounts / reveal seat indexes).
//
// Data sources (all authoritative):
//   • poker_hand_settlements (kind='settle') — winners' payouts + total pot, one row per hand.
//   • poker_hole_cards        — the dealt-in seat→user mapping (WHO played; NO card values read).
//   • poker_hands.reveal      — which seats reached showdown.
//   • poker_tables.big_blind  — stake normalization.
//   • coin_ledger (poker reasons) — EXACT realized net chips per user (wallet↔stack crossings).
//
// Degrade-safe: any missing table / error yields an empty leaderboard rather than throwing.

import { createAdminClient } from '@/lib/supabase/admin'
import { buildRankStats, type HandResultRecord } from '@/lib/games/poker/rankingAggregate'
import {
  rankPlayers,
  collusionRiskScore,
  type RankedEntry,
  type PokerRankingMetric,
  type CollusionSignal,
} from '@/lib/games/poker/ranking'
import { POKER_LEDGER_REASONS } from '@/lib/games/poker/economy'
import { getActiveEconomyConfig } from './economy-server'

export interface Leaderboard {
  metric: PokerRankingMetric
  entries: RankedEntry[]
  collusion: CollusionSignal[]
  coverage: {
    settledHands: number
    // netProfit is exact (coin ledger); bb-normalization is an approximation. See ranking-definition.md.
    netProfit: 'measured'
    netBb: 'approximated'
  }
}

const EMPTY: Leaderboard = {
  metric: 'bb_per_100',
  entries: [],
  collusion: [],
  coverage: { settledHands: 0, netProfit: 'measured', netBb: 'approximated' },
}

// Load the leaderboard over the most recent `maxHands` settled hands. Admin/ops read path.
export async function loadPokerLeaderboard(maxHands = 5000): Promise<Leaderboard> {
  try {
    const admin = createAdminClient()
    const cfg = await getActiveEconomyConfig()

    const { data: settlements, error: sErr } = await admin
      .from('poker_hand_settlements')
      .select('hand_id, table_id, payouts, kind, settled_at')
      .eq('kind', 'settle')
      .order('settled_at', { ascending: false })
      .limit(maxHands)
    if (sErr || !settlements || settlements.length === 0) return { ...EMPTY, metric: cfg.leaderboardMetric }

    const handIds = settlements.map((s) => s.hand_id as string)
    const tableIds = Array.from(new Set(settlements.map((s) => s.table_id as string)))

    const [holeRes, handsRes, tablesRes] = await Promise.all([
      admin.from('poker_hole_cards').select('hand_id, seat_index, user_id').in('hand_id', handIds),
      admin.from('poker_hands').select('id, table_id, reveal').in('id', handIds),
      admin.from('poker_tables').select('id, big_blind').in('id', tableIds),
    ])

    const bbByTable = new Map<string, number>()
    for (const t of tablesRes.data ?? []) bbByTable.set(t.id as string, t.big_blind as number)

    const revealByHand = new Map<string, number[]>()
    const tableByHand = new Map<string, string>()
    for (const h of handsRes.data ?? []) {
      tableByHand.set(h.id as string, h.table_id as string)
      const reveal = (h.reveal as { seatIndex: number }[] | null) ?? []
      revealByHand.set(h.id as string, reveal.map((r) => r.seatIndex))
    }

    const seatsByHand = new Map<string, { seatIndex: number; userId: string }[]>()
    for (const r of holeRes.data ?? []) {
      const arr = seatsByHand.get(r.hand_id as string) ?? []
      arr.push({ seatIndex: r.seat_index as number, userId: r.user_id as string })
      seatsByHand.set(r.hand_id as string, arr)
    }

    const records: HandResultRecord[] = []
    for (const s of settlements) {
      const handId = s.hand_id as string
      const tableId = (s.table_id as string) ?? tableByHand.get(handId) ?? ''
      const bb = bbByTable.get(tableId) ?? 0
      const seats = seatsByHand.get(handId) ?? []
      if (bb <= 0 || seats.length === 0) continue
      const payouts = (s.payouts as { seatIndex: number; amount: number }[] | null) ?? []
      records.push({
        handId,
        bigBlind: bb,
        seats,
        payouts: payouts.map((p) => ({ seatIndex: p.seatIndex, amount: p.amount })),
        revealSeatIndexes: revealByHand.get(handId) ?? [],
      })
    }

    // Exact realized net chips per user from the poker wallet↔stack crossings.
    const involvedUsers = Array.from(new Set(records.flatMap((r) => r.seats.map((s) => s.userId))))
    const ledgerNet = new Map<string, number>()
    if (involvedUsers.length > 0) {
      const { data: ledger } = await admin
        .from('coin_ledger')
        .select('user_id, delta, reason')
        .eq('game_code', 'poker')
        .in('reason', POKER_LEDGER_REASONS as unknown as string[])
        .in('user_id', involvedUsers)
      for (const row of ledger ?? []) {
        const uid = row.user_id as string
        ledgerNet.set(uid, (ledgerNet.get(uid) ?? 0) + (row.delta as number))
      }
    }

    const stats = buildRankStats(records, ledgerNet)
    const entries = rankPlayers(stats, cfg.leaderboardMetric)

    // Collusion review signals: winnings concentration per counterparty, from the same records.
    const perOpponent = new Map<string, Map<string, number>>() // user → opponent → chips won attributed
    for (const r of records) {
      for (const p of r.payouts) {
        if (p.amount <= 0) continue
        const winner = r.seats.find((s) => s.seatIndex === p.seatIndex)?.userId
        if (!winner) continue
        const m = perOpponent.get(winner) ?? new Map<string, number>()
        for (const s of r.seats) {
          if (s.userId === winner) continue
          m.set(s.userId, (m.get(s.userId) ?? 0) + Math.round(p.amount / Math.max(1, r.seats.length - 1)))
        }
        perOpponent.set(winner, m)
      }
    }
    const statByUser = new Map(stats.map((s) => [s.userId, s]))
    const collusion: CollusionSignal[] = []
    for (const [userId, m] of Array.from(perOpponent.entries())) {
      const st = statByUser.get(userId)
      if (!st) continue
      const sig = collusionRiskScore({
        userId,
        netProfitChips: st.netProfitChips,
        perOpponentProfitChips: Array.from(m.entries()).map(([opponentId, chips]) => ({ opponentId, chips })),
        handsPlayed: st.handsPlayed,
        distinctOpponents: st.distinctOpponents,
      })
      if (sig.score > 0) collusion.push(sig)
    }
    collusion.sort((a, b) => b.score - a.score)

    return {
      metric: cfg.leaderboardMetric,
      entries,
      collusion: collusion.slice(0, 25),
      coverage: { settledHands: records.length, netProfit: 'measured', netBb: 'approximated' },
    }
  } catch {
    return EMPTY
  }
}
