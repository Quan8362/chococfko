// ── Poker BOT admin controls & disclosure policy (pure) ───────────────────────────────
//
// PURE module — no React, no Supabase, no clock. Tested by admin.test.ts.
//
// The pure config + validation layer for operating bots. It owns the RULES the server enforces
// (a future phase wires these to env + DB): where bots are allowed, how many, at what difficulty,
// how they are labeled, and how bot incidents are recorded. It moves NO coins and enables NOTHING
// on its own — the master `bot` feature flag remains hard-OFF (lib/games/poker/flags.ts) until
// explicitly approved (docs/poker/bots/user-disclosure.md).
//
// FAIRNESS RULES made structural here (docs/poker/bots/user-disclosure.md):
//   • Bots are ALWAYS clearly labeled — `botIdentity` carries an explicit isBot marker and a
//     stable i18n label key; there is no code path that produces an unlabeled bot identity.
//   • Bots are NEVER seated at a human-only / ranked table — `isBotAllowedAtTable` refuses it.
//   • A table's bot count is capped so at least the configured human capacity is preserved.

import type { BotDifficulty } from './policy.ts'
import { BOT_DIFFICULTIES } from './policy.ts'

// The kinds of table a bot MAY sit at. 'ranked' and 'human_only' are intentionally absent — bots
// must never occupy a competitive human seat (a hard fairness rule, not a config knob).
export type BotTableKind = 'practice' | 'casual_bot'

export const BOT_TABLE_KINDS: readonly BotTableKind[] = ['practice', 'casual_bot']

// Table kinds humans can create/join where bots are FORBIDDEN. Listed explicitly so the guard is
// a deny-by-default check rather than an allow-list omission.
export type HumanOnlyTableKind = 'ranked' | 'human_only'

export interface BotTableConfig {
  readonly enabled: boolean // master enable for THIS surface (still gated by the feature flag)
  readonly allowedTableKinds: readonly BotTableKind[]
  readonly maxBotsPerTable: number
  readonly defaultDifficulty: BotDifficulty
  readonly allowedDifficulties: readonly BotDifficulty[]
  // Whether hands at bot tables count toward a player's public statistics / ranking. Default
  // false — bot-table results are excluded so the human leaderboard reflects human play only.
  readonly affectsStats: boolean
  // Whether bot tables use a SEPARATE (or capped) coin economy vs the main wallet. Default true
  // for a conservative first rollout (docs/poker/bots/economy-policy.md).
  readonly separateEconomy: boolean
}

// Conservative, OFF-by-default configuration. Nothing here turns bots on by itself.
export const DEFAULT_BOT_TABLE_CONFIG: BotTableConfig = {
  enabled: false,
  allowedTableKinds: ['practice'],
  maxBotsPerTable: 5, // up to a full 6-max table minus one human
  defaultDifficulty: 'easy',
  allowedDifficulties: ['easy', 'normal', 'hard'], // 'simulation' is TEST-ONLY, never user-facing
  affectsStats: false,
  separateEconomy: true,
}

export interface ConfigValidation {
  readonly ok: boolean
  readonly errors: readonly string[]
}

// Validate an admin-supplied config. Returns all problems (not just the first) so an admin UI can
// show them together. Enforces the structural fairness rules.
export function validateBotTableConfig(config: BotTableConfig): ConfigValidation {
  const errors: string[] = []

  if (!Number.isInteger(config.maxBotsPerTable) || config.maxBotsPerTable < 0) {
    errors.push('maxBotsPerTable must be a non-negative integer')
  }
  if (config.maxBotsPerTable > 5) {
    errors.push('maxBotsPerTable cannot exceed 5 (a 6-max table must keep ≥1 human seat)')
  }
  if (config.allowedTableKinds.length === 0) {
    errors.push('allowedTableKinds must list at least one bot-eligible table kind')
  }
  for (const k of config.allowedTableKinds) {
    if (!BOT_TABLE_KINDS.includes(k)) errors.push(`unknown bot table kind "${k}"`)
  }
  if (config.allowedDifficulties.length === 0) {
    errors.push('allowedDifficulties must list at least one difficulty')
  }
  for (const d of config.allowedDifficulties) {
    if (!BOT_DIFFICULTIES.includes(d)) errors.push(`unknown difficulty "${d}"`)
    if (d === 'simulation') errors.push('the "simulation" policy is TEST-ONLY and must not be user-facing')
  }
  if (!config.allowedDifficulties.includes(config.defaultDifficulty)) {
    errors.push('defaultDifficulty must be one of allowedDifficulties')
  }

  return { ok: errors.length === 0, errors }
}

// Is a table with `humans` human seats and a requested `botCount` allowed under `config`?
// Enforces: feature enabled, table kind is bot-eligible, bot count within cap, and at least one
// human present (bots never play a 100%-bot table that is exposed as a human game — an all-bot
// PRACTICE sandbox uses a different, non-wallet path).
export function isBotAllowedAtTable(
  config: BotTableConfig,
  tableKind: BotTableKind | HumanOnlyTableKind,
  requestedBots: number,
  humanSeats: number,
): ConfigValidation {
  const errors: string[] = []
  if (!config.enabled) errors.push('bots are disabled by configuration')
  if (!isBotTableKind(tableKind)) {
    errors.push(`bots are not permitted at a "${tableKind}" table`)
  } else if (!config.allowedTableKinds.includes(tableKind)) {
    errors.push(`bots are not enabled for "${tableKind}" tables`)
  }
  if (!Number.isInteger(requestedBots) || requestedBots < 0) {
    errors.push('requestedBots must be a non-negative integer')
  }
  if (requestedBots > config.maxBotsPerTable) {
    errors.push(`requestedBots ${requestedBots} exceeds the cap ${config.maxBotsPerTable}`)
  }
  if (requestedBots + humanSeats > 6) {
    errors.push('a table has at most 6 seats')
  }
  if (humanSeats < 1) {
    errors.push('a bot-eligible table exposed to players must seat at least one human')
  }
  return { ok: errors.length === 0, errors }
}

function isBotTableKind(kind: string): kind is BotTableKind {
  return (BOT_TABLE_KINDS as readonly string[]).includes(kind)
}

// ── Bot identity (ALWAYS labeled — never disguised as a human) ────────────────────────────

// i18n key the UI localizes for the "Bot" badge/label. Machine constant — never a hardcoded
// display string (respects the zero-hardcode i18n rule).
export const BOT_LABEL_I18N_KEY = 'games.poker.bot.label'

export interface BotIdentity {
  readonly isBot: true // structural marker — a bot identity can never be created without it
  readonly seatIndex: number
  readonly difficulty: BotDifficulty
  readonly nameI18nKey: string // localized display name key (e.g. "Bot 1")
  readonly labelI18nKey: string // the "Bot" badge key
}

// Build a bot's public identity. The `isBot` marker and label key are non-optional, so there is
// no way to mint a bot that is not clearly disclosed as one.
export function botIdentity(seatIndex: number, difficulty: BotDifficulty): BotIdentity {
  if (!Number.isInteger(seatIndex) || seatIndex < 0) {
    throw new Error('botIdentity: seatIndex must be a non-negative integer')
  }
  return {
    isBot: true,
    seatIndex,
    difficulty,
    nameI18nKey: 'games.poker.bot.name',
    labelI18nKey: BOT_LABEL_I18N_KEY,
  }
}

// Guard used before publishing a seat occupant: a bot occupant MUST carry the isBot marker.
export function assertBotLabeled(identity: { isBot?: boolean }): void {
  if (identity.isBot !== true) {
    throw new Error('bot admin: a bot seat occupant must be labeled isBot=true')
  }
}

// ── Bot incident log (audit — NEVER contains cards) ───────────────────────────────────────

export type BotIncidentKind =
  | 'fallback' // policy degraded to a safe action (threw / illegal / timed out)
  | 'timeout' // policy exceeded its decision budget and was defaulted
  | 'illegal_action' // policy produced an action the engine rejected
  | 'crash' // policy raised an unexpected error
  | 'removed' // a bot was removed from a table by an admin/lifecycle event

export interface BotIncident {
  readonly kind: BotIncidentKind
  readonly tableId: string
  readonly seatIndex: number
  readonly difficulty: BotDifficulty
  readonly handNo: number | null
  readonly code: string // stable machine code, e.g. 'RAISE_NOT_REOPENED'
  readonly detail: string // short, redacted human note — NEVER hole cards
}

// Redact any 2-char card token (rank+suit) that might slip into a detail string, so a bot
// incident can never leak private cards into the audit log (a crash must not reveal cards).
const CARD_TOKEN = /\b([2-9TJQKA])([cdhs])\b/g

export function redactCards(detail: string): string {
  return detail.replace(CARD_TOKEN, '**')
}

export function makeBotIncident(input: {
  kind: BotIncidentKind
  tableId: string
  seatIndex: number
  difficulty: BotDifficulty
  handNo?: number | null
  code: string
  detail?: string
}): BotIncident {
  return {
    kind: input.kind,
    tableId: input.tableId,
    seatIndex: input.seatIndex,
    difficulty: input.difficulty,
    handNo: input.handNo ?? null,
    code: input.code,
    detail: redactCards(input.detail ?? ''),
  }
}
