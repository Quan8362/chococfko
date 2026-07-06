'use server'

// Server-authoritative tournament actions (internal-alpha). Every privileged mutation runs HERE, not
// in the browser: participants call the DEFINER player RPCs (register/unregister) through the RLS
// cookie client; operators + the hand engine call the service_role-only orchestration RPCs through
// the admin client. The browser NEVER receives the service-role key and NEVER calls those RPCs.
//
// Authorization is enforced twice: (1) the internal-alpha gate + operator gate here (fail-closed,
// flag default OFF), and (2) the DB grants (admin_transition/settle/orchestration are service_role
// only, REVOKEd from anon+authenticated). Tournament chips move only via the audited RPCs; no hand
// touches game_wallets/coin_ledger.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getPokerAccess,
  pokerAccessTournamentVisible,
  pokerAccessTournamentOperator,
} from './access'
import {
  initialRegKey,
  unregisterKey,
  validateTournamentConfig,
  TOURNAMENT_TEMPLATES,
  canTransition,
  projectedPayouts,
  settleFinal,
  type TournamentConfig,
  type EliminationRecord,
} from '@/lib/games/poker/tournament'
import {
  liveView,
  applyAction as runnerApply,
  settle as runnerSettle,
  type TournamentHandConfig,
  type LoggedAction,
} from '@/lib/games/poker/tournament/handRunner'
import type { AppliedAction } from '@/lib/games/poker/betting'

export type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string }
function fail(error: string): { ok: false; error: string } { return { ok: false, error } }

// Deterministic 32-bit seed for a hand from the tournament seed + table + hand number (replayable).
function handSeed(tournamentSeed: string, tableNo: number, handNo: number): number {
  let h = 2166136261 >>> 0
  const s = `${tournamentSeed}:${tableNo}:${handNo}`
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

interface StoredHand { config: TournamentHandConfig; log: LoggedAction[] }

// ── Auth + gate helpers ────────────────────────────────────────────────────────────────────────
async function requireParticipant() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'not_authenticated' }
  const acc = await getPokerAccess()
  if (!pokerAccessTournamentVisible(acc)) return { ok: false as const, error: 'tournament_unavailable' }
  return { ok: true as const, user, supabase, acc }
}
async function requireOperator() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, error: 'not_authenticated' }
  const acc = await getPokerAccess()
  if (!pokerAccessTournamentOperator(acc)) return { ok: false as const, error: 'not_operator' }
  return { ok: true as const, user, supabase, acc, admin: createAdminClient() }
}

// ── Reads ────────────────────────────────────────────────────────────────────────────────────
export async function listTournaments(): Promise<ActionResult<{ tournaments: unknown[] }>> {
  const g = await requireParticipant()
  if (!g.ok) return fail(g.error)
  const { data, error } = await g.supabase
    .from('poker_tournaments')
    .select('id,title,state,entry_fee,starting_stack,min_entries,max_entries,seats_per_table,guaranteed_prize_pool,current_level_index,scheduled_at,started_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return fail('list_failed')
  return { ok: true, tournaments: data ?? [] }
}

export async function getTournamentDetail(tournamentId: string): Promise<ActionResult<{
  tournament: Record<string, unknown> | null
  entries: unknown[]
  seats: unknown[]
  myEntry: Record<string, unknown> | null
  isOperator: boolean
}>> {
  const g = await requireParticipant()
  if (!g.ok) return fail(g.error)
  const { data: t } = await g.supabase.from('poker_tournaments').select('*').eq('id', tournamentId).maybeSingle()
  if (!t) return fail('not_found')
  const { data: entries } = await g.supabase
    .from('poker_tournament_entries').select('id,user_id,seq,state,chips,table_no,seat_index,finishing_place')
    .eq('tournament_id', tournamentId)
  const { data: seats } = await g.supabase
    .from('poker_tournament_seats').select('entry_id,user_id,table_no,seat_index,stack,state')
    .eq('tournament_id', tournamentId)
  const myEntry = (entries ?? []).find((e: { user_id: string }) => e.user_id === g.user.id) ?? null
  return {
    ok: true, tournament: t, entries: entries ?? [], seats: seats ?? [],
    myEntry: (myEntry as Record<string, unknown>) ?? null,
    isOperator: pokerAccessTournamentOperator(g.acc),
  }
}

// ── Participant actions ──────────────────────────────────────────────────────────────────────
export async function registerForTournament(tournamentId: string): Promise<ActionResult<{ entryId: string }>> {
  const g = await requireParticipant()
  if (!g.ok) return fail(g.error)
  const { data, error } = await g.supabase.rpc('poker_tournament_register', {
    p_tournament_id: tournamentId,
    p_idempotency_key: initialRegKey(tournamentId, g.user.id),
  })
  if (error) return fail(error.message.includes('already registered') ? 'already_registered'
    : error.message.includes('field full') ? 'field_full'
    : error.message.includes('insufficient') ? 'insufficient_balance'
    : error.message.includes('registration closed') ? 'registration_closed' : 'register_failed')
  return { ok: true, entryId: data as string }
}

export async function unregisterFromTournament(tournamentId: string): Promise<ActionResult> {
  const g = await requireParticipant()
  if (!g.ok) return fail(g.error)
  const { error } = await g.supabase.rpc('poker_tournament_unregister', {
    p_tournament_id: tournamentId,
    p_idempotency_key: unregisterKey(tournamentId, g.user.id),
  })
  if (error) return fail(error.message.includes('cannot unregister') ? 'too_late_to_unregister' : 'unregister_failed')
  return { ok: true }
}

// ── Operator actions ───────────────────────────────────────────────────────────────────────────
export interface CreateTournamentInput {
  title: string
  template: keyof typeof TOURNAMENT_TEMPLATES
  entryFee?: number
  startingStack?: number
  maxEntries?: number
  seatsPerTable?: number
  guaranteedPrizePool?: number
}

export async function createTournament(input: CreateTournamentInput): Promise<ActionResult<{ id: string }>> {
  const g = await requireOperator()
  if (!g.ok) return fail(g.error)
  const base = TOURNAMENT_TEMPLATES[input.template]
  if (!base) return fail('unknown_template')
  const config: TournamentConfig = {
    ...base,
    entryFee: input.entryFee ?? base.entryFee,
    startingStack: input.startingStack ?? base.startingStack,
    maxEntries: input.maxEntries ?? base.maxEntries,
    seatsPerTable: input.seatsPerTable ?? base.seatsPerTable,
    guaranteedPrizePool: input.guaranteedPrizePool ?? base.guaranteedPrizePool,
  }
  const valid = validateTournamentConfig(config)
  if (!valid.ok) return fail(`invalid_config:${valid.reason}`)
  const { data, error } = await g.admin.from('poker_tournaments').insert({
    title: input.title.trim().slice(0, 120) || 'Tournament',
    state: 'DRAFT',
    entry_fee: config.entryFee,
    starting_stack: config.startingStack,
    min_entries: config.minEntries,
    max_entries: config.maxEntries,
    seats_per_table: config.seatsPerTable,
    guaranteed_prize_pool: config.guaranteedPrizePool,
    config: config as unknown as Record<string, unknown>,
    created_by: g.user.id,
  }).select('id').single()
  if (error) return fail('create_failed')
  return { ok: true, id: (data as { id: string }).id }
}

// Operator state transition through the audited FSM (mirrors + re-checked by the DB).
export async function transitionTournament(tournamentId: string, to: string): Promise<ActionResult> {
  const g = await requireOperator()
  if (!g.ok) return fail(g.error)
  const { data: t } = await g.admin.from('poker_tournaments').select('state').eq('id', tournamentId).maybeSingle()
  if (!t) return fail('not_found')
  if (!canTransition((t as { state: string }).state as never, to as never)) return fail('illegal_transition')
  const { error } = await g.admin.rpc('poker_tournament_admin_transition', {
    p_tournament_id: tournamentId, p_to: to, p_actor: g.user.id,
  })
  if (error) return fail('transition_failed')
  return { ok: true }
}

export async function drawSeats(tournamentId: string): Promise<ActionResult<{ seated: number }>> {
  const g = await requireOperator()
  if (!g.ok) return fail(g.error)
  const { data, error } = await g.admin.rpc('poker_tournament_seat_draw', { p_tournament_id: tournamentId })
  if (error) return fail('seat_draw_failed')
  return { ok: true, seated: (data as number) ?? 0 }
}

export async function advanceLevel(tournamentId: string, toLevel: number): Promise<ActionResult> {
  const g = await requireOperator()
  if (!g.ok) return fail(g.error)
  const { error } = await g.admin.rpc('poker_tournament_advance_level', {
    p_tournament_id: tournamentId, p_to_level: toLevel,
  })
  if (error) return fail('advance_level_failed')
  return { ok: true }
}

// ── Live hand orchestration ──────────────────────────────────────────────────────────────────
// Operator/server: open a hand at a table using the CURRENT tournament chip stacks + level blinds.
export async function startTournamentHand(tournamentId: string, tableNo: number): Promise<ActionResult<{ handId: string }>> {
  const g = await requireOperator()
  if (!g.ok) return fail(g.error)
  const { data: t } = await g.admin.from('poker_tournaments')
    .select('seed,current_level_index,config').eq('id', tournamentId).maybeSingle()
  if (!t) return fail('not_found')
  const { data: seats } = await g.admin.from('poker_tournament_seats')
    .select('seat_index,stack,state').eq('tournament_id', tournamentId).eq('table_no', tableNo).eq('state', 'active')
    .order('seat_index')
  const live = (seats ?? []).filter((s: { stack: number }) => s.stack > 0)
  if (live.length < 2) return fail('not_enough_players')

  const cfg = (t as { config: { blindStructure?: { levels?: { smallBlind: number; bigBlind: number; ante?: number }[] } } }).config
  const levelIdx = (t as { current_level_index: number }).current_level_index
  const level = cfg.blindStructure?.levels?.[levelIdx] ?? { smallBlind: 25, bigBlind: 50, ante: 0 }
  const { data: existing } = await g.admin.from('poker_tournament_hands')
    .select('hand_no').eq('tournament_id', tournamentId).eq('table_no', tableNo).order('hand_no', { ascending: false }).limit(1)
  const nextHandNo = ((existing?.[0] as { hand_no: number } | undefined)?.hand_no ?? 0) + 1
  const buttonSeat = live[nextHandNo % live.length].seat_index as number

  const { data: handId, error } = await g.admin.rpc('poker_tournament_start_hand', {
    p_tournament_id: tournamentId, p_table_no: tableNo, p_level_index: levelIdx,
    p_sb: level.smallBlind, p_bb: level.bigBlind, p_ante: level.ante ?? 0,
    p_idempotency_key: `sh:${tournamentId}:${tableNo}:${nextHandNo}`,
  })
  if (error || !handId) return fail('start_hand_failed')

  const config: TournamentHandConfig = {
    seed: handSeed((t as { seed: string }).seed, tableNo, nextHandNo),
    handNo: nextHandNo, bigBlind: level.bigBlind, smallBlind: level.smallBlind, buttonSeat,
    seats: live.map((s: { seat_index: number; stack: number }) => ({ seatIndex: s.seat_index, stack: s.stack })),
  }
  const stored: StoredHand = { config, log: [] }
  await g.admin.from('poker_tournament_hands').update({ state: stored as unknown as Record<string, unknown> })
    .eq('id', handId as string)
  return { ok: true, handId: handId as string }
}

// Participant submits ONE authoritative action. The server validates seat ownership + turn +
// action-seq (stale rejection), applies via the pure runner, and on completion settles chip deltas
// through the audited RPC (never wallets). Returns only the PUBLIC view (never opponents' cards).
export async function submitTournamentAction(
  tournamentId: string, handId: string, action: AppliedAction, expectedActionSeq: number,
): Promise<ActionResult<{ complete: boolean; actionSeq: number }>> {
  const g = await requireParticipant()
  if (!g.ok) return fail(g.error)
  const admin = createAdminClient()

  const { data: hand } = await admin.from('poker_tournament_hands')
    .select('id,tournament_id,table_no,settled,state').eq('id', handId).maybeSingle()
  if (!hand || (hand as { tournament_id: string }).tournament_id !== tournamentId) return fail('hand_not_found')
  if ((hand as { settled: boolean }).settled) return fail('hand_complete')
  const stored = (hand as { state: StoredHand }).state
  if (!stored?.config) return fail('hand_not_initialized')

  const tableNo = (hand as { table_no: number }).table_no
  // Seat ownership: the caller must occupy the seat that is on turn at this table.
  const { data: mySeat } = await admin.from('poker_tournament_seats')
    .select('seat_index').eq('tournament_id', tournamentId).eq('table_no', tableNo).eq('user_id', g.user.id).maybeSingle()
  if (!mySeat) return fail('not_seated_here')
  const seatIndex = (mySeat as { seat_index: number }).seat_index

  const view = liveView(stored.config, stored.log)
  if (view.complete) return fail('hand_complete')
  if (view.turnSeat !== seatIndex) return fail('not_your_turn')
  if (view.actionSeq !== expectedActionSeq) return fail('stale_action')

  const applied = runnerApply(stored.config, stored.log, seatIndex, action)
  if (!applied.ok) return fail(applied.error)

  const nextStored: StoredHand = { config: stored.config, log: applied.log }
  // Persist the new log. Concurrency is bounded by: only the on-turn seat may act (checked above via
  // turnSeat + action-seq), settled=false, and the apply_hand_result idempotency key (keyed by
  // hand_no) which makes a double-settle a no-op even under a rare race.
  await admin.from('poker_tournament_hands')
    .update({ state: nextStored as unknown as Record<string, unknown> })
    .eq('id', handId).eq('settled', false)

  if (applied.complete) {
    const deltas = runnerSettle(stored.config, applied.log)
    const { error: applyErr } = await admin.rpc('poker_tournament_apply_hand_result', {
      p_tournament_id: tournamentId, p_hand_id: handId,
      p_deltas: deltas.map((d) => ({ seat_index: d.seatIndex, delta: d.delta })),
      p_idempotency_key: `ah:${tournamentId}:${tableNo}:${stored.config.handNo}`,
    })
    if (applyErr) return fail('apply_hand_failed')
    await admin.rpc('poker_tournament_eliminate', { p_tournament_id: tournamentId })
  }
  const newView = liveView(nextStored.config, nextStored.log)
  return { ok: true, complete: applied.complete, actionSeq: newView.actionSeq }
}

// ── Settlement ───────────────────────────────────────────────────────────────────────────────
// Operator: settle a tournament whose field is down to one. Builds payout rows from the finishing
// places with the pure payout engine and calls the audited, conservation-checked settle RPC.
export async function settleTournament(tournamentId: string): Promise<ActionResult<{ paid: number }>> {
  const g = await requireOperator()
  if (!g.ok) return fail(g.error)
  const { data: t } = await g.admin.from('poker_tournaments').select('config,state').eq('id', tournamentId).maybeSingle()
  if (!t) return fail('not_found')
  const config = (t as { config: TournamentConfig }).config
  const { data: entries } = await g.admin.from('poker_tournament_entries')
    .select('id,user_id,state,finishing_place,chips').eq('tournament_id', tournamentId).neq('state', 'WITHDRAWN')
  const rows = (entries ?? []) as { id: string; user_id: string; state: string; finishing_place: number | null; chips: number }[]
  const entriesGranted = rows.length
  if (entriesGranted < 1) return fail('no_entries')

  // Champion = the single live entry with no finishing_place → place 1. Everyone else has a place.
  const champions = rows.filter((r) => r.finishing_place == null)
  if (champions.length !== 1) return fail('not_heads_up_complete') // exactly one survivor required
  const records: EliminationRecord[] = rows.map((r) => ({
    entryId: r.id, userId: r.user_id,
    finishingPlace: r.finishing_place ?? 1,
    handNo: 0, chipsAtHandStart: r.chips, tied: false,
  }))
  const placePrizes = projectedPayouts(config, entriesGranted, entriesGranted)
  const payoutRows = settleFinal(records, placePrizes)

  const { error } = await g.admin.rpc('poker_tournament_settle', {
    p_tournament_id: tournamentId,
    p_payouts: payoutRows.map((p) => ({ entry_id: p.entryId, user_id: p.userId, place: p.place, amount: p.amount, kind: 'prize' })),
    p_idempotency_key: `settle:${tournamentId}`,
  })
  if (error) return fail(error.message.includes('already settled') ? 'already_settled'
    : error.message.includes('conserve') ? 'conservation_failed' : 'settle_failed')
  return { ok: true, paid: payoutRows.filter((p) => p.amount > 0).length }
}
