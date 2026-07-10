'use server'

// ── Poker PRACTICE-bot server actions (isolated, flag-gated, dark) ─────────────────────
//
// 'use server' — the ONLY authoritative surface for the ISOLATED practice-bot mode. The browser
// sends INTENT; identity is resolved server-side (auth.uid()). The browser NEVER decides cards,
// winners, pots, stacks, bot difficulty, or table classification, and NEVER submits trusted bot
// state — the server builds the BotObservation and drives the bots.
//
// 🔴 ISOLATION. This path reuses the SAME pure engine authority as the cash game
// (lib/games/poker/practice/* → lib/games/poker/hand.ts) but is walled off from the real economy:
//   • it reads/writes ONLY poker_practice_games (service-role; RLS deny-all to clients);
//   • it NEVER touches game_wallets / coin_ledger / poker_hands / poker_settle_hand;
//   • practice chips are an isolated integer sandbox — no faucet, no reward, no ranking, no stats.
//
// DARK. Gated by POKER_PRACTICE_BOTS_ENABLED (default OFF). Every entry point fails closed when the
// flag is off, and if the migration is not applied the missing-relation error (42P01) is caught
// and returned as an unavailable code — deploying this before the migration breaks nothing.

import { randomInt } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPokerAccess, viewerOf } from './access'
import { pokerPracticeBotsOn } from '@/lib/games/poker/flags'
import { makeRng } from '@/lib/games/tlmn/ai/seededRandom'
import type { AppliedAction } from '@/lib/games/poker/betting'
import {
  createPracticeGame,
  startPracticeHand,
  humanActionAuthoritative,
  runBotsUntilHumanOrEnd,
  toClientView,
  PRACTICE_ALLOWED_DIFFICULTIES,
  type PracticeGame,
  type PracticeTableConfig,
  type PracticeClientView,
} from '@/lib/games/poker/practice'
import type { BotDifficulty } from '@/lib/games/poker/bot/policy'

export type PracticeResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string }

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

// Gate: the practice-bots flag must be ON for THIS viewer, and the viewer must be authenticated
// (a human seat needs a real user id). Fails closed.
async function requirePractice(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const access = await getPokerAccess()
  if (!pokerPracticeBotsOn(access.flags, viewerOf(access))) {
    return fail('practice_bots_off')
  }
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fail('not_authenticated')
  return { ok: true, userId: user.id }
}

// Isolated jsonb (de)serialization. The full PracticeGame — including server-only secrets — is
// stored server-side ONLY; the client never receives this shape (it gets toClientView).
function serializeGame(game: PracticeGame): unknown {
  return game
}
function reviveGame(state: unknown): PracticeGame {
  return state as PracticeGame
}

const PRACTICE_SEAT_MAX = 6
const PRACTICE_STARTING_STACK = 10_000
const PRACTICE_BIG_BLIND = 100

// ── createPracticeTable — a fresh isolated practice game (1 human + N-1 bots) ─────────────
export async function createPracticeTable(input: {
  seatCount?: number
  difficulty?: BotDifficulty
}): Promise<PracticeResult<{ gameId: string }>> {
  const gate = await requirePractice()
  if (!gate.ok) return gate

  const seatCount = Math.min(PRACTICE_SEAT_MAX, Math.max(2, Math.floor(input.seatCount ?? 4)))
  const difficulty: BotDifficulty =
    input.difficulty && PRACTICE_ALLOWED_DIFFICULTIES.includes(input.difficulty) ? input.difficulty : 'easy'

  const config: PracticeTableConfig = {
    tableId: 'pending',
    kind: 'practice',
    bigBlind: PRACTICE_BIG_BLIND,
    smallBlind: Math.floor(PRACTICE_BIG_BLIND / 2),
    startingStack: PRACTICE_STARTING_STACK,
    actionTimeMs: 800,
    seats: [
      { seatIndex: 0, occupant: { kind: 'human', userId: gate.userId, displayName: 'You' }, stack: PRACTICE_STARTING_STACK },
      ...Array.from({ length: seatCount - 1 }, (_, i) => ({
        seatIndex: i + 1,
        occupant: { kind: 'bot' as const, botId: `bot-${i + 1}`, difficulty, displayName: `Bot ${i + 1}` },
        stack: PRACTICE_STARTING_STACK,
      })),
    ],
  }

  const admin = createAdminClient()
  const seed = randomInt(1, 0x7fffffff)
  let game = createPracticeGame(config, seed)

  try {
    const { data, error } = await admin
      .from('poker_practice_games')
      .insert({ owner_user_id: gate.userId, kind: 'practice', phase: game.phase, version: game.version, state: serializeGame(game) })
      .select('id')
      .single()
    if (error) return fail(missingTable(error) ? 'practice_unavailable' : 'create_failed')
    const gameId = (data as { id: string }).id

    // Start the first hand and run bots up to the human's turn (or hand end).
    game = startPracticeHand({ ...game, config: { ...game.config, tableId: gameId } })
    const rng = makeRng(seed ^ 0x51ed270b)
    game = runBotsUntilHumanOrEnd(game, rng).game
    await persist(admin, gameId, game)
    return { ok: true, gameId }
  } catch {
    return fail('create_failed')
  }
}

// ── fetchPracticeState — the privacy-safe per-viewer projection (server-built) ────────────
export async function fetchPracticeState(gameId: string): Promise<PracticeResult<{ view: PracticeClientView }>> {
  const gate = await requirePractice()
  if (!gate.ok) return gate
  const admin = createAdminClient()
  const loaded = await loadOwned(admin, gameId, gate.userId)
  if (!loaded.ok) return loaded
  const view = toClientView(loaded.game, humanSeatIndex(loaded.game, gate.userId))
  return { ok: true, view }
}

// ── practiceAct — submit ONE human intent; the server validates + drives the bots ─────────
export async function practiceAct(
  gameId: string,
  action: AppliedAction,
  expectedSeq: number,
): Promise<PracticeResult<{ view: PracticeClientView }>> {
  const gate = await requirePractice()
  if (!gate.ok) return gate
  const admin = createAdminClient()
  const loaded = await loadOwned(admin, gameId, gate.userId)
  if (!loaded.ok) return loaded

  const seat = humanSeatIndex(loaded.game, gate.userId)
  if (seat === null) return fail('not_seated')

  // Human action through the SAME authoritative core the bots use.
  const res = humanActionAuthoritative(loaded.game, seat, action, expectedSeq)
  if (!res.ok) return fail(res.error)

  // Drive bots to the next human turn (or hand end), then persist with a version CAS.
  const rng = makeRng(res.game.seed ^ res.game.version)
  const after = runBotsUntilHumanOrEnd(res.game, rng).game
  const saved = await persistCas(admin, gameId, loaded.game.version, after)
  if (!saved) return fail('stale_state')
  const view = toClientView(after, seat)
  return { ok: true, view }
}

// ── practiceStartNextHand — deal a fresh hand once one is complete ─────────────────────────
export async function practiceStartNextHand(gameId: string): Promise<PracticeResult<{ view: PracticeClientView }>> {
  const gate = await requirePractice()
  if (!gate.ok) return gate
  const admin = createAdminClient()
  const loaded = await loadOwned(admin, gameId, gate.userId)
  if (!loaded.ok) return loaded
  if (loaded.game.phase === 'BETTING') return fail('hand_in_progress')

  try {
    let game = startPracticeHand(loaded.game)
    const rng = makeRng(game.seed ^ 0x2545f491)
    game = runBotsUntilHumanOrEnd(game, rng).game
    const saved = await persistCas(admin, gameId, loaded.game.version, game)
    if (!saved) return fail('stale_state')
    return { ok: true, view: toClientView(game, humanSeatIndex(game, gate.userId)) }
  } catch {
    return fail('start_failed')
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────────────────

type AdminClient = ReturnType<typeof createAdminClient>

function missingTable(error: { code?: string } | null): boolean {
  return (error as { code?: string } | null)?.code === '42P01'
}

function humanSeatIndex(game: PracticeGame, userId: string): number | null {
  const seat = game.config.seats.find((s) => s.occupant.kind === 'human' && s.occupant.userId === userId)
  return seat ? seat.seatIndex : null
}

async function loadOwned(
  admin: AdminClient,
  gameId: string,
  userId: string,
): Promise<{ ok: true; game: PracticeGame } | { ok: false; error: string }> {
  try {
    const { data, error } = await admin
      .from('poker_practice_games')
      .select('id, owner_user_id, state')
      .eq('id', gameId)
      .maybeSingle()
    if (error) return fail(missingTable(error) ? 'practice_unavailable' : 'load_failed')
    if (!data) return fail('not_found')
    if ((data as { owner_user_id: string }).owner_user_id !== userId) return fail('not_owner')
    return { ok: true, game: reviveGame((data as { state: unknown }).state) }
  } catch {
    return fail('load_failed')
  }
}

async function persist(admin: AdminClient, gameId: string, game: PracticeGame): Promise<void> {
  await admin
    .from('poker_practice_games')
    .update({ phase: game.phase, version: game.version, state: serializeGame(game) })
    .eq('id', gameId)
}

// Optimistic-concurrency write: only commits if the stored version still equals `expected`, so a
// duplicate/stale writer cannot double-apply. Returns false on a version conflict (stale).
async function persistCas(admin: AdminClient, gameId: string, expected: number, game: PracticeGame): Promise<boolean> {
  const { data, error } = await admin
    .from('poker_practice_games')
    .update({ phase: game.phase, version: game.version, state: serializeGame(game) })
    .eq('id', gameId)
    .eq('version', expected)
    .select('id')
  if (error) return false
  return Array.isArray(data) && data.length === 1
}
