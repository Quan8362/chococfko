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
  type TournamentState,
} from '@/lib/games/poker/tournament'
import {
  liveView,
  applyAction as runnerApply,
  settle as runnerSettle,
  type TournamentHandConfig,
  type LoggedAction,
} from '@/lib/games/poker/tournament/handRunner'
import {
  buildTournamentTableView,
  type TournamentTableView,
  type RawSeatRow,
  type TableHandInput,
} from '@/lib/games/poker/tournament/tableView'
import { participantDisplayState, type EntryLike } from '@/lib/games/poker/tournament/uiModel'
import type { AppliedAction } from '@/lib/games/poker/betting'

// Tournament states in which a table may run hands. Fail-closed everywhere else.
const RUNNING_STATES = new Set<TournamentState>(['RUNNING', 'BREAK', 'FINAL_TABLE'])
type AdminClient = ReturnType<typeof createAdminClient>

// Showdown grace before the SERVER auto-opens the next hand on a read (so both players see the
// completed hand's cards/pot first). The read-path advance in getTournamentTableView is what makes
// next-hand advancement resilient: it never depends on one client firing a one-shot request.
const SETTLE_GRACE_MS = 1600
function graceElapsed(settledAt: string | null | undefined): boolean {
  if (!settledAt) return true
  const t = new Date(settledAt).getTime()
  if (Number.isNaN(t)) return true
  return Date.now() - t >= SETTLE_GRACE_MS
}

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
export interface TournamentListItem {
  id: string; title: string; state: string; entry_fee: number; starting_stack: number
  min_entries: number; max_entries: number; seats_per_table: number; guaranteed_prize_pool: number
  current_level_index: number
  registered: number            // live (non-withdrawn) entries
  myEntryState: string | null   // this viewer's entry state, if any
  myTableNo: number | null
}

export async function listTournaments(): Promise<ActionResult<{ tournaments: TournamentListItem[] }>> {
  const g = await requireParticipant()
  if (!g.ok) return fail(g.error)
  const { data, error } = await g.supabase
    .from('poker_tournaments')
    .select('id,title,state,entry_fee,starting_stack,min_entries,max_entries,seats_per_table,guaranteed_prize_pool,current_level_index')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) return fail('list_failed')
  // Non-withdrawn entry rows (small at internal-alpha scale) → per-tournament count + this viewer's entry.
  const { data: entries } = await g.supabase
    .from('poker_tournament_entries')
    .select('tournament_id,user_id,state,table_no')
    .neq('state', 'WITHDRAWN')
  const counts = new Map<string, number>()
  const mine = new Map<string, { state: string; table_no: number | null }>()
  for (const e of (entries ?? []) as { tournament_id: string; user_id: string; state: string; table_no: number | null }[]) {
    counts.set(e.tournament_id, (counts.get(e.tournament_id) ?? 0) + 1)
    if (e.user_id === g.user.id) mine.set(e.tournament_id, { state: e.state, table_no: e.table_no })
  }
  const tournaments: TournamentListItem[] = ((data ?? []) as Omit<TournamentListItem, 'registered' | 'myEntryState' | 'myTableNo'>[]).map((tr) => ({
    ...tr,
    registered: counts.get(tr.id) ?? 0,
    myEntryState: mine.get(tr.id)?.state ?? null,
    myTableNo: mine.get(tr.id)?.table_no ?? null,
  }))
  return { ok: true, tournaments }
}

export async function getTournamentDetail(tournamentId: string): Promise<ActionResult<{
  tournament: Record<string, unknown> | null
  entries: unknown[]
  seats: unknown[]
  payouts: unknown[]
  myEntry: Record<string, unknown> | null
  isOperator: boolean
}>> {
  const g = await requireParticipant()
  if (!g.ok) return fail(g.error)
  // Explicit non-secret columns only — `seed` is sealed from clients (migration_poker_tournament_realtime).
  const { data: t } = await g.supabase.from('poker_tournaments')
    .select('id,title,state,entry_fee,starting_stack,min_entries,max_entries,seats_per_table,guaranteed_prize_pool,config,current_level_index,level_started_at,scheduled_at,started_at,completed_at,cancelled_at,created_at')
    .eq('id', tournamentId).maybeSingle()
  if (!t) return fail('not_found')
  const { data: entries } = await g.supabase
    .from('poker_tournament_entries').select('id,user_id,seq,state,chips,table_no,seat_index,finishing_place')
    .eq('tournament_id', tournamentId)
  const { data: seats } = await g.supabase
    .from('poker_tournament_seats').select('entry_id,user_id,table_no,seat_index,stack,state')
    .eq('tournament_id', tournamentId)
  const { data: payouts } = await g.supabase
    .from('poker_tournament_payouts').select('entry_id,user_id,place,amount,kind')
    .eq('tournament_id', tournamentId)
  const myEntry = (entries ?? []).find((e: { user_id: string }) => e.user_id === g.user.id) ?? null
  return {
    ok: true, tournament: t, entries: entries ?? [], seats: seats ?? [], payouts: payouts ?? [],
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

// True iff the tournament still holds escrowed entry fees (any entry that has neither been refunded
// (WITHDRAWN) nor paid (PAID)). A plain Cancel of such a tournament would strand those fees, so the
// operator must use the refund-recovery path instead.
async function tournamentHoldsEscrow(admin: AdminClient, tournamentId: string): Promise<boolean> {
  const { data } = await admin.from('poker_tournament_entries')
    .select('id').eq('tournament_id', tournamentId).not('state', 'in', '("WITHDRAWN","PAID")').limit(1)
  return (data?.length ?? 0) > 0
}

// Operator state transition through the audited FSM (mirrors + re-checked by the DB).
export async function transitionTournament(tournamentId: string, to: string): Promise<ActionResult> {
  const g = await requireOperator()
  if (!g.ok) return fail(g.error)
  const { data: t } = await g.admin.from('poker_tournaments').select('state').eq('id', tournamentId).maybeSingle()
  if (!t) return fail('not_found')
  if (!canTransition((t as { state: string }).state as never, to as never)) return fail('illegal_transition')
  // Never let a plain Cancel silently strand escrow — route the operator to the refund-recovery path
  // (recoverAndRefundTournament) whenever entry fees are still held.
  if (to === 'CANCELLED' && await tournamentHoldsEscrow(g.admin, tournamentId)) return fail('use_recover_refund')
  const { error } = await g.admin.rpc('poker_tournament_admin_transition', {
    p_tournament_id: tournamentId, p_to: to, p_actor: g.user.id,
  })
  if (error) return fail('transition_failed')
  const { data: lvl } = await g.admin.from('poker_tournaments').select('current_level_index').eq('id', tournamentId).maybeSingle()
  await touchAllTables(g.admin, tournamentId, to, (lvl as { current_level_index: number } | null)?.current_level_index ?? 0)
  return { ok: true }
}

export async function drawSeats(tournamentId: string): Promise<ActionResult<{ seated: number }>> {
  const g = await requireOperator()
  if (!g.ok) return fail(g.error)
  const { data, error } = await g.admin.rpc('poker_tournament_seat_draw', { p_tournament_id: tournamentId })
  if (error) return fail('seat_draw_failed')
  const { data: t } = await g.admin.from('poker_tournaments').select('state,current_level_index').eq('id', tournamentId).maybeSingle()
  await touchAllTables(g.admin, tournamentId, (t as { state: string } | null)?.state ?? 'STARTING', (t as { current_level_index: number } | null)?.current_level_index ?? 0)
  return { ok: true, seated: (data as number) ?? 0 }
}

// Bump the realtime pointer for EVERY live table (tournament-wide changes: level, status). Cheap at
// internal-alpha scale (few tables). Best-effort; never blocks the mutation.
async function touchAllTables(admin: AdminClient, tournamentId: string, state: string, levelIndex: number): Promise<void> {
  const { data: seats } = await admin.from('poker_tournament_seats')
    .select('table_no').eq('tournament_id', tournamentId)
  const tables = Array.from(new Set((seats ?? []).map((s: { table_no: number }) => s.table_no)))
  for (const tableNo of tables) await touchTable(admin, tournamentId, tableNo, 0, state, levelIndex)
}

export async function advanceLevel(tournamentId: string, toLevel: number): Promise<ActionResult> {
  const g = await requireOperator()
  if (!g.ok) return fail(g.error)
  const { error } = await g.admin.rpc('poker_tournament_advance_level', {
    p_tournament_id: tournamentId, p_to_level: toLevel,
  })
  if (error) return fail('advance_level_failed')
  const { data: t } = await g.admin.from('poker_tournaments').select('state').eq('id', tournamentId).maybeSingle()
  await touchAllTables(g.admin, tournamentId, (t as { state: string } | null)?.state ?? 'RUNNING', toLevel)
  return { ok: true }
}

// ── Live hand orchestration ──────────────────────────────────────────────────────────────────
// Bump the non-secret realtime pointer so subscribers re-fetch the viewer-safe snapshot. Never
// carries a seed/hole card (only version + hand_no + state/level mirror). Best-effort: a failed
// bump only delays a re-fetch (the watchdog still reconciles), so it never blocks a mutation.
async function touchTable(admin: AdminClient, tournamentId: string, tableNo: number, handNo: number, state: string, levelIndex: number): Promise<void> {
  try {
    await admin.rpc('poker_tournament_touch_table', {
      p_tournament_id: tournamentId, p_table_no: tableNo, p_hand_no: handNo, p_state: state, p_level: levelIndex,
    })
  } catch { /* notification-only; ignore */ }
}

// Open a hand at a table using the CURRENT tournament chip stacks + level blinds. Shared by the
// operator control and the participant-safe next-hand path. HARDENED against the retry-reset bug:
// start_hand is idempotent (returns the same hand row for a reused key), so we NEVER blindly
// overwrite `state` — an already-initialized hand is returned untouched (a mid-hand action log is
// never clobbered). The state jsonb is written ONLY when it is still empty (atomic guard on
// state->config IS NULL).
async function openHandAtTable(
  admin: AdminClient, tournamentId: string, tableNo: number,
): Promise<{ ok: true; handId: string; opened: boolean } | { ok: false; error: string }> {
  const { data: t } = await admin.from('poker_tournaments')
    .select('seed,current_level_index,config,state').eq('id', tournamentId).maybeSingle()
  if (!t) return { ok: false, error: 'not_found' }
  const tState = (t as { state: TournamentState }).state
  if (!RUNNING_STATES.has(tState)) return { ok: false, error: 'not_running' }

  const levelIdx = (t as { current_level_index: number }).current_level_index

  // An unsettled, already-initialized hand at this table → reuse it (idempotent, no reset).
  const { data: latest } = await admin.from('poker_tournament_hands')
    .select('id,hand_no,settled,state').eq('tournament_id', tournamentId).eq('table_no', tableNo)
    .order('hand_no', { ascending: false }).limit(1).maybeSingle()
  const latestRow = latest as { id: string; hand_no: number; settled: boolean; state: StoredHand } | null
  if (latestRow && !latestRow.settled && latestRow.state?.config) {
    return { ok: true, handId: latestRow.id, opened: false }
  }

  const { data: seats } = await admin.from('poker_tournament_seats')
    .select('seat_index,stack,state').eq('tournament_id', tournamentId).eq('table_no', tableNo).eq('state', 'active')
    .order('seat_index')
  const live = (seats ?? []).filter((s: { stack: number }) => s.stack > 0)
  if (live.length < 2) return { ok: false, error: 'not_enough_players' }

  const cfg = (t as { config: { blindStructure?: { levels?: { smallBlind: number; bigBlind: number; ante?: number }[] } } }).config
  const level = cfg.blindStructure?.levels?.[levelIdx] ?? { smallBlind: 25, bigBlind: 50, ante: 0 }
  const nextHandNo = (latestRow?.hand_no ?? 0) + 1
  const buttonSeat = live[nextHandNo % live.length].seat_index as number

  const { data: handId, error } = await admin.rpc('poker_tournament_start_hand', {
    p_tournament_id: tournamentId, p_table_no: tableNo, p_level_index: levelIdx,
    p_sb: level.smallBlind, p_bb: level.bigBlind, p_ante: level.ante ?? 0,
    p_idempotency_key: `sh:${tournamentId}:${tableNo}:${nextHandNo}`,
  })
  if (error || !handId) return { ok: false, error: 'start_hand_failed' }

  const config: TournamentHandConfig = {
    seed: handSeed((t as { seed: string }).seed, tableNo, nextHandNo),
    handNo: nextHandNo, bigBlind: level.bigBlind, smallBlind: level.smallBlind, buttonSeat,
    seats: live.map((s: { seat_index: number; stack: number }) => ({ seatIndex: s.seat_index, stack: s.stack })),
  }
  // Initialize `state` ATOMICALLY via the DEFINER RPC: it writes ONLY while the row is still
  // uninitialized + unsettled (WHERE state->'config' IS NULL). start_hand is idempotent (a reused key
  // returns an existing row that a concurrent/earlier opener may already have initialized), so a
  // duplicate / stale / racing caller can NEVER clobber an in-progress action log or a settled hand —
  // the atomic guard, not a TOCTOU re-read, is the arbiter. `wrote===false` ⇒ someone already opened
  // this hand; return it unchanged.
  const stored: StoredHand = { config, log: [] }
  const { data: wrote, error: initErr } = await admin.rpc('poker_tournament_init_hand_state', {
    p_hand_id: handId as string,
    p_tournament_id: tournamentId,
    p_state: stored as unknown as Record<string, unknown>,
  })
  if (initErr) return { ok: false, error: 'start_hand_failed' }
  const opened = wrote === true
  if (opened) await touchTable(admin, tournamentId, tableNo, nextHandNo, tState, levelIdx)
  return { ok: true, handId: handId as string, opened }
}

// Operator: open the first / a specific hand at a table (deal button in the operator panel).
export async function startTournamentHand(tournamentId: string, tableNo: number): Promise<ActionResult<{ handId: string }>> {
  const g = await requireOperator()
  if (!g.ok) return fail(g.error)
  const res = await openHandAtTable(g.admin, tournamentId, tableNo)
  if (!res.ok) return fail(res.error)
  return { ok: true, handId: res.handId }
}

// Operator RECOVERY: force the next hand at every live table via the SAME authoritative idempotent
// path (openHandAtTable). This is the manual escape hatch for a wedged table (a completed hand with
// no next hand) — it never duplicates logic and never opens two hands. Safe to click repeatedly:
// a table that already has a live hand is returned unchanged, and a table that can't play (heads-up
// down to one) is skipped. The read-path auto-advance normally makes this unnecessary; it exists so
// an operator can recover instantly without waiting for a client to reconcile.
export async function advanceTournamentTables(tournamentId: string): Promise<ActionResult<{ opened: number }>> {
  const g = await requireOperator()
  if (!g.ok) return fail(g.error)
  const { data: t } = await g.admin.from('poker_tournaments').select('state').eq('id', tournamentId).maybeSingle()
  if (!t) return fail('not_found')
  if (!RUNNING_STATES.has((t as { state: TournamentState }).state)) return fail('not_running')
  const { data: seats } = await g.admin.from('poker_tournament_seats')
    .select('table_no').eq('tournament_id', tournamentId)
  const tables = Array.from(new Set((seats ?? []).map((s: { table_no: number }) => s.table_no)))
  let opened = 0
  for (const tableNo of tables) {
    const res = await openHandAtTable(g.admin, tournamentId, tableNo)
    if (res.ok && res.opened) opened += 1
  }
  return { ok: true, opened }
}

// Participant-safe: ensure a hand is running at the CALLER's own table. Server-authoritative — the
// caller must actually be seated at the table (verified below), the tournament must be running, and
// the table must have ≥2 chipped seats. This is what keeps play flowing hand-to-hand without an
// operator babysitting each deal; it only OPENS a hand (chips still move solely via the audited
// apply-hand RPC on completion). Idempotent: if a hand is already live it returns it unchanged.
export async function ensureTournamentTableHand(tournamentId: string): Promise<ActionResult<{ handId: string; opened: boolean }>> {
  const g = await requireParticipant()
  if (!g.ok) return fail(g.error)
  const admin = createAdminClient()
  const { data: mySeat } = await admin.from('poker_tournament_seats')
    .select('table_no').eq('tournament_id', tournamentId).eq('user_id', g.user.id).maybeSingle()
  if (!mySeat) return fail('not_seated_here')
  const tableNo = (mySeat as { table_no: number }).table_no
  const res = await openHandAtTable(admin, tournamentId, tableNo)
  if (!res.ok) return fail(res.error)
  return { ok: true, handId: res.handId, opened: res.opened }
}

// The ONE viewer-safe snapshot the live table renders from. Assembles: tournament meta + level
// blinds (public), the seats at the viewer's OWN table (public identities/stacks), and — if a hand
// is live — the redacted public hand view PLUS the viewer's OWN two cards (never anyone else's).
// The seed-bearing hand row is read with the service role (sealed from clients) and only the
// redacted projection crosses back. A non-participant / cross-table caller never reaches a table.
export async function getTournamentTableView(tournamentId: string): Promise<ActionResult<{ view: TournamentTableView }>> {
  const g = await requireParticipant()
  if (!g.ok) return fail(g.error)
  const admin = createAdminClient()

  const { data: t } = await g.supabase.from('poker_tournaments')
    .select('id,title,state,current_level_index,config').eq('id', tournamentId).maybeSingle()
  if (!t) return fail('not_found')
  const tr = t as { id: string; title: string; state: TournamentState; current_level_index: number; config: { blindStructure?: { levels?: { smallBlind: number; bigBlind: number; ante?: number }[] } } }
  const levelIdx = tr.current_level_index
  const level = tr.config.blindStructure?.levels?.[levelIdx] ?? { smallBlind: 0, bigBlind: 0, ante: 0 }
  const meta = {
    tournamentId: tr.id, title: tr.title, state: tr.state, levelIndex: levelIdx,
    smallBlind: level.smallBlind, bigBlind: level.bigBlind, ante: level.ante ?? 0,
  }

  // Viewer's own entry → participant display state (own-scoped read).
  const { data: myEntry } = await g.supabase.from('poker_tournament_entries')
    .select('state,finishing_place,table_no,seat_index').eq('tournament_id', tournamentId).eq('user_id', g.user.id).maybeSingle()
  const participantState = participantDisplayState(tr.state, (myEntry as EntryLike | null) ?? null)

  // Viewer's live seat (the ONLY table they may view). No seat → a table-less view carrying just
  // their participant state (waiting / eliminated / champion).
  const { data: mySeat } = await g.supabase.from('poker_tournament_seats')
    .select('table_no,seat_index').eq('tournament_id', tournamentId).eq('user_id', g.user.id).maybeSingle()
  if (!mySeat) {
    const view = buildTournamentTableView({ meta, seats: [], tableNo: 0, viewerSeatIndex: null, participantState, hand: null })
    return { ok: true, view }
  }
  const tableNo = (mySeat as { table_no: number }).table_no
  const viewerSeatIndex = (mySeat as { seat_index: number }).seat_index

  // Public seats at the viewer's table + their public profiles (name/avatar via service role —
  // profiles RLS may hide cross-user rows; only non-secret display fields are surfaced).
  const { data: seatRows } = await g.supabase.from('poker_tournament_seats')
    .select('user_id,seat_index,stack,state').eq('tournament_id', tournamentId).eq('table_no', tableNo).order('seat_index')
  const rows = (seatRows ?? []) as { user_id: string | null; seat_index: number; stack: number; state: string }[]
  const userIds = rows.map((r) => r.user_id).filter((x): x is string => !!x)
  const profById = new Map<string, { display_name: string | null; avatar_url: string | null }>()
  if (userIds.length > 0) {
    const { data: profs } = await admin.from('profiles').select('id,display_name,avatar_url').in('id', userIds)
    for (const p of (profs ?? []) as { id: string; display_name: string | null; avatar_url: string | null }[]) {
      profById.set(p.id, { display_name: p.display_name, avatar_url: p.avatar_url })
    }
  }
  const seats: RawSeatRow[] = rows.map((r) => ({
    seatIndex: r.seat_index,
    userId: r.user_id,
    displayName: r.user_id ? profById.get(r.user_id)?.display_name ?? null : null,
    avatarUrl: r.user_id ? profById.get(r.user_id)?.avatar_url ?? null : null,
    stack: r.stack,
    state: r.state,
  }))

  // ── Keep play flowing — SERVER-authoritative, retry/refresh/multi-client safe ─────────────────
  // Advancement is a property of READING the table, not of any one client firing a one-shot request:
  // if the latest hand is settled (past the showdown grace) or no hand is open, and the table can
  // still play, open the next hand HERE. openHandAtTable is idempotent + atomically guarded, so
  // concurrent reads (both players, the watchdog, a refresh/reopen) converge on exactly ONE next
  // hand and can never clobber a live hand. A best-effort failure (e.g. heads-up down to one chipped
  // seat → not_enough_players) just leaves the completed/terminal view for the operator to settle.
  if (RUNNING_STATES.has(tr.state)) {
    const { data: latestForAdvance } = await admin.from('poker_tournament_hands')
      .select('settled,settled_at,state').eq('tournament_id', tournamentId).eq('table_no', tableNo)
      .order('hand_no', { ascending: false }).limit(1).maybeSingle()
    const lr = latestForAdvance as { settled: boolean; settled_at: string | null; state: StoredHand } | null
    const noOpenHand = !lr || !lr.state?.config
    const settledPastGrace = !!lr && lr.settled && graceElapsed(lr.settled_at)
    if (noOpenHand || settledPastGrace) {
      await openHandAtTable(admin, tournamentId, tableNo)
    }
  }

  // Latest hand at the table (service role — the seed-bearing row is sealed from clients).
  const { data: handRow } = await admin.from('poker_tournament_hands')
    .select('id,hand_no,settled,state').eq('tournament_id', tournamentId).eq('table_no', tableNo)
    .order('hand_no', { ascending: false }).limit(1).maybeSingle()
  const hr = handRow as { id: string; state: StoredHand } | null
  const hand: TableHandInput | null = hr && hr.state?.config
    ? { handId: hr.id, config: hr.state.config, log: hr.state.log ?? [] }
    : null

  const view = buildTournamentTableView({ meta, seats, tableNo, viewerSeatIndex, participantState, hand })
  return { ok: true, view }
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
  // Bump the non-secret realtime pointer so BOTH players re-fetch the authoritative view (turn,
  // pot, board, and — on completion — the settled stacks). The mirror carries no secret.
  const { data: meta } = await admin.from('poker_tournaments')
    .select('state,current_level_index').eq('id', tournamentId).maybeSingle()
  await touchTable(admin, tournamentId, tableNo,
    stored.config.handNo,
    (meta as { state: string } | null)?.state ?? 'RUNNING',
    (meta as { current_level_index: number } | null)?.current_level_index ?? 0)
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
  const tState = (t as { state: string }).state
  // Terminal tournaments never settle: COMPLETED already paid; CANCELLED was recovery-refunded (holds
  // no escrow, has no champion). The DB re-enforces both — this is a fast fail-closed guard.
  if (tState === 'COMPLETED') return fail('already_settled')
  if (tState === 'CANCELLED') return fail('illegal_transition')
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
  const { data: st } = await g.admin.from('poker_tournaments').select('state,current_level_index').eq('id', tournamentId).maybeSingle()
  await touchAllTables(g.admin, tournamentId, (st as { state: string } | null)?.state ?? 'COMPLETED', (st as { current_level_index: number } | null)?.current_level_index ?? 0)
  return { ok: true, paid: payoutRows.filter((p) => p.amount > 0).length }
}

// ── Recovery refund ──────────────────────────────────────────────────────────────────────────
// Operator RECOVERY for a tournament that has STARTED but cannot continue or be settled (e.g. a
// wedged table with no safe champion). Refunds every still-escrowed entry EXACTLY ONCE through the
// audited, row-locked, idempotent DEFINER RPC (poker_tournament_recover_refund) and drives the
// tournament to terminal CANCELLED. The RPC — not this wrapper — enforces once-only refunds, the
// "no prize row" and "not after settlement" guards, and the append-only refund ledger. This is the
// ONLY safe way to release escrow after play begins; normal Cancel is blocked while escrow is held.
export async function recoverAndRefundTournament(tournamentId: string): Promise<ActionResult<{ refunded: number }>> {
  const g = await requireOperator()
  if (!g.ok) return fail(g.error)
  const { data: t } = await g.admin.from('poker_tournaments').select('state').eq('id', tournamentId).maybeSingle()
  if (!t) return fail('not_found')
  if ((t as { state: string }).state === 'COMPLETED') return fail('already_settled')
  const { data, error } = await g.admin.rpc('poker_tournament_recover_refund', {
    p_tournament_id: tournamentId,
    p_actor: g.user.id,
    p_idempotency_key: `recover:${tournamentId}`,
  })
  if (error) return fail(error.message.includes('already settled') ? 'already_settled'
    : error.message.includes('prize payouts') ? 'already_settled' : 'recover_failed')
  // Tournament is now CANCELLED — bump every table so live clients re-fetch the terminal view.
  await touchAllTables(g.admin, tournamentId, 'CANCELLED', 0)
  return { ok: true, refunded: (data as number) ?? 0 }
}
