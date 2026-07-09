// Poker feature flags — PURE resolution from an env-like record, with SAFE
// (production-OFF) defaults. No process.env / server imports here so it stays
// unit-testable and importable from anywhere. The server wrapper that reads the
// real env + viewer access lives in `app/games/poker/access.ts`.
//
// Rollout model (see reports/poker-final-review-2026-07-01.md):
//   • Every flag defaults OFF. A fresh production deploy exposes poker to NOBODY
//     but admins — the "admin-only production visibility" stage — for free.
//   • Admins bypass every gate EXCEPT the two hard-off features below, so they can
//     validate on prod before any public flag is flipped.
//   • `bot` and `tournament` are HARD OFF regardless of env for this release.

export interface PokerFlags {
  enabled: boolean        // master switch — reach the poker feature at all
  createTable: boolean    // host a new cash table
  publicLobby: boolean    // browse/join the public table list
  privateTable: boolean   // create/join password-protected tables
  spectator: boolean      // watch a table without sitting
  bot: boolean            // live cash-game bots — HARD OFF this release (never on, even in env)
  tournament: boolean     // PUBLIC tournament — HARD OFF this release (never on, even in env)
  // tournamentInternalAlpha: the INTERNAL-ALPHA tournament surface (register/lobby/lifecycle +
  //   authoritative live play). A real env flag (POKER_TOURNAMENT_INTERNAL_ALPHA), default OFF.
  //   Distinct from the public `tournament` flag (which stays hard-off): this one, when ON, opens the
  //   tournament surface ONLY to viewers who can already SEE poker (admins, or Closed-Beta members
  //   when closedBeta is running) — never the public. It ships fully dark until ops flips the env.
  //   Tournament chips are isolated from game_wallets/coin_ledger (TNMT-CHIP-002); this flag never
  //   opens a cash-seating capability. Operator (create/start/transition/settle) additionally
  //   requires isAdmin — see pokerTournamentCanOperate.
  tournamentInternalAlpha: boolean
  // practiceBots: the ISOLATED, practice-only bot mode (Prompt 27B). Env-gated and default OFF.
  //   It gates a strictly separate practice runtime whose chips NEVER touch the real wallet
  //   (game_wallets/coin_ledger), whose results feed NO ranking/achievement/mission/stats, and
  //   whose bots are structurally barred from every human cash table. Unlike `bot` (which is a
  //   hard-off live-cash capability), this is a real env flag — but it stays OFF in production
  //   until explicitly approved. It never opens a cash-seating capability.
  practiceBots: boolean
  // ── Alpha operations ──────────────────────────────────────────────────────
  // alpha: controlled-Alpha mode. When ON the feature is reachable ONLY by the
  //   approved tester allowlist (+ admins), even if `enabled` is also ON — this
  //   keeps a production Alpha strictly private without opening it to the public.
  // blockNewJoins: freeze switch. Preserves every running table & stack but
  //   refuses new table creation / joins / sit-downs so an Alpha can be wound
  //   down gracefully without stranding coins mid-hand.
  alpha: boolean
  blockNewJoins: boolean
  // ── Closed Beta ───────────────────────────────────────────────────────────
  // closedBeta: the STAGE AFTER Alpha. When ON the feature is reachable ONLY by
  //   members of the beta cohorts (+ admins), even if `enabled` is also ON — a
  //   larger-but-still-private rollout with cohort assignment, terms acknowledg
  //   -ement and per-tester suspend. Cohort membership + suspension are resolved
  //   in lib/games/poker/beta.ts (env allowlists), NOT here, to keep this module
  //   a pure flag resolver. Typically run with alpha=0 and enabled=0.
  closedBeta: boolean
  // ── Social layer (each optional + independently toggleable) ────────────────────────────────
  // Additive, cosmetic/comms features layered on top of the gameplay gates. They NEVER open a
  // seating capability and NEVER move coins; they only decide whether a social surface renders.
  // A viewer must already be able to SEE poker (pokerVisibleTo) for any of these to apply.
  //   • achievements — cosmetic badge unlocks (server-authoritative, zero coin movement).
  //   • missions     — the one-time beginner "getting started" checklist.
  //   • friendInvites — invite a friend to a table (reuses the shared notification spine).
  //   • quickMessages — localized preset quick-messages / emotes at the table.
  //   • handSharing  — share a completed hand via a read-only, privacy-redacted link.
  achievements: boolean
  missions: boolean
  friendInvites: boolean
  quickMessages: boolean
  handSharing: boolean
}

// The ops-facing flag names (env keys + documentation), in canonical order.
export const POKER_FLAG_ENV: Record<keyof PokerFlags, string> = {
  enabled: 'POKER_ENABLED',
  createTable: 'POKER_CREATE_TABLE_ENABLED',
  publicLobby: 'POKER_PUBLIC_LOBBY_ENABLED',
  privateTable: 'POKER_PRIVATE_TABLE_ENABLED',
  spectator: 'POKER_SPECTATOR_ENABLED',
  bot: 'POKER_BOT_ENABLED',
  tournament: 'POKER_TOURNAMENT_ENABLED',
  tournamentInternalAlpha: 'POKER_TOURNAMENT_INTERNAL_ALPHA',
  practiceBots: 'POKER_PRACTICE_BOTS_ENABLED',
  alpha: 'POKER_ALPHA_MODE',
  blockNewJoins: 'POKER_BLOCK_NEW_JOINS',
  closedBeta: 'POKER_CLOSED_BETA_ENABLED',
  achievements: 'POKER_ACHIEVEMENTS_ENABLED',
  missions: 'POKER_MISSIONS_ENABLED',
  friendInvites: 'POKER_FRIEND_INVITES_ENABLED',
  quickMessages: 'POKER_QUICK_MESSAGES_ENABLED',
  handSharing: 'POKER_HAND_SHARING_ENABLED',
}

// Env key holding the comma-separated tester allowlist (emails), mirroring the
// ADMIN_EMAILS convention. Not a boolean flag, so it lives outside POKER_FLAG_ENV.
export const POKER_ALPHA_TESTERS_ENV = 'POKER_ALPHA_TESTERS'

// Only an explicit affirmative turns a flag on. Everything else — unset, empty,
// '0', 'false', 'off', a typo — resolves OFF. For a real-coin-adjacent game the
// safe default is always "closed".
function truthy(v: string | undefined): boolean {
  if (!v) return false
  const s = v.trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'on' || s === 'yes'
}

export function resolvePokerFlags(env: Record<string, string | undefined>): PokerFlags {
  return {
    enabled: truthy(env[POKER_FLAG_ENV.enabled]),
    createTable: truthy(env[POKER_FLAG_ENV.createTable]),
    publicLobby: truthy(env[POKER_FLAG_ENV.publicLobby]),
    privateTable: truthy(env[POKER_FLAG_ENV.privateTable]),
    spectator: truthy(env[POKER_FLAG_ENV.spectator]),
    // Live cash-game bots are out of scope for this release — never on, even if env says so.
    bot: false,
    tournament: false,
    // Internal-alpha tournament surface: a REAL env flag, default OFF. Fail-closed — unset/empty/typo
    // resolves OFF, so the tournament surface ships fully dark until POKER_TOURNAMENT_INTERNAL_ALPHA
    // is explicitly flipped. The public `tournament` flag above stays hard-off independently.
    tournamentInternalAlpha: truthy(env[POKER_FLAG_ENV.tournamentInternalAlpha]),
    // Practice-only bots: a REAL env flag, default OFF. Stays off in production this phase.
    practiceBots: truthy(env[POKER_FLAG_ENV.practiceBots]),
    alpha: truthy(env[POKER_FLAG_ENV.alpha]),
    blockNewJoins: truthy(env[POKER_FLAG_ENV.blockNewJoins]),
    closedBeta: truthy(env[POKER_FLAG_ENV.closedBeta]),
    achievements: truthy(env[POKER_FLAG_ENV.achievements]),
    missions: truthy(env[POKER_FLAG_ENV.missions]),
    friendInvites: truthy(env[POKER_FLAG_ENV.friendInvites]),
    quickMessages: truthy(env[POKER_FLAG_ENV.quickMessages]),
    handSharing: truthy(env[POKER_FLAG_ENV.handSharing]),
  }
}

// Parse the tester allowlist (comma-separated, lower-cased, de-duped emails).
// Mirrors ADMIN_EMAILS parsing so ops uses one mental model for both lists.
export function parseAlphaTesters(raw: string | undefined | null): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  for (const part of raw.split(',')) {
    const e = part.trim().toLowerCase()
    if (e) seen.add(e)
  }
  return Array.from(seen)
}

// Is this email on the tester allowlist? Case-insensitive; empty email is never
// a tester. The list is authoritative on the server only.
export function isAlphaTester(email: string | null | undefined, raw: string | undefined | null): boolean {
  if (!email) return false
  return parseAlphaTesters(raw).includes(email.trim().toLowerCase())
}

// ── Capability layer (flags + viewer) ─────────────────────────────────────────
// 'join' = take/reserve a seat at (or join membership of) a table. Distinct from
// 'create' so a freeze can block new joins while existing tables keep running.
export type PokerCapability = 'enter' | 'create' | 'join' | 'public_lobby' | 'private_table' | 'spectate'

export interface PokerViewer {
  isAdmin: boolean
  // On the Alpha allowlist (server-resolved from POKER_ALPHA_TESTERS). Optional
  // so existing callers that never set it default to "not a tester".
  isAlphaTester?: boolean
  // In a Closed Beta cohort (server-resolved from the cohort allowlists in
  // lib/games/poker/beta.ts). Optional; defaults to "not a beta member".
  isBetaMember?: boolean
  // Suspended from the private test (Alpha/Beta) at the ACCESS layer — locked out
  // of the feature entirely even if otherwise a member. Distinct from a gameplay
  // player_restriction (which lets them view but not sit). Admins are never
  // suspended by this flag. Optional; defaults to "not suspended".
  suspended?: boolean
}

// May the viewer reach the poker feature at all?
//   • Admins always get in (admin-only production-visibility rollout stage).
//   • A suspended tester is locked out regardless of membership.
//   • In Closed Beta mode the feature is reachable ONLY by cohort members — even
//     if the public master flag is also on, the public stays locked out.
//   • In Alpha mode the feature is reachable ONLY by approved testers — likewise.
//   • Otherwise the public master flag decides.
// Closed Beta and Alpha are mutually-exclusive stages in practice (run one at a
// time). If both are left on, the MORE RESTRICTIVE combination applies: a viewer
// must satisfy whichever gate is checked first, so a mis-set flag fails closed.
export function pokerVisibleTo(flags: PokerFlags, viewer: PokerViewer): boolean {
  if (viewer.isAdmin) return true
  if (viewer.suspended) return false
  if (flags.alpha) return !!viewer.isAlphaTester
  if (flags.closedBeta) return !!viewer.isBetaMember
  return flags.enabled
}

// Resolve a single capability. A viewer must first be able to enter; then the
// per-capability flag (or admin override) decides. bot/tournament are not
// capabilities here because they never ship on in this release. The join freeze
// (blockNewJoins) overrides create/join for EVERYONE, including admins, so a
// wind-down is total and predictable — lift the freeze to test seating again.
export function pokerCan(flags: PokerFlags, viewer: PokerViewer, cap: PokerCapability): boolean {
  if (!pokerVisibleTo(flags, viewer)) return false
  switch (cap) {
    case 'enter':
      return true
    case 'create':
      return (flags.createTable || viewer.isAdmin) && !flags.blockNewJoins
    case 'join':
      return !flags.blockNewJoins
    case 'public_lobby':
      return flags.publicLobby || viewer.isAdmin
    case 'private_table':
      return flags.privateTable || viewer.isAdmin
    case 'spectate':
      return flags.spectator || viewer.isAdmin
    default:
      return false
  }
}

// ── Social feature gate ───────────────────────────────────────────────────────────────────────
// The additive social/comms features. Unlike a seating capability, a social feature is NOT
// admin-overridden: it renders only when its own flag is ON (so the feature truly ships dark until
// ops flips the flag, and an admin previewing prod flips the env like anyone else). The viewer
// must still be able to SEE poker at all — a suspended tester or a locked-out public user gets
// nothing. There is no coin or seating side effect, so no freeze/maintenance interaction.
export type PokerSocialFeature = 'achievements' | 'missions' | 'friendInvites' | 'quickMessages' | 'handSharing'

export function pokerSocialFeatureOn(
  flags: PokerFlags,
  viewer: PokerViewer,
  feature: PokerSocialFeature,
): boolean {
  return pokerVisibleTo(flags, viewer) && flags[feature]
}

// ── Practice-bots gate ─────────────────────────────────────────────────────────────────────
// The isolated practice-bot mode is available only when its own env flag is ON and the viewer can
// see poker at all. Like a social feature it is NOT admin-overridden — it ships fully dark until
// `POKER_PRACTICE_BOTS_ENABLED` is flipped, so an admin previewing prod flips the env like anyone
// else. It NEVER interacts with cash seating, coins, or the join/maintenance freeze.
export function pokerPracticeBotsOn(flags: PokerFlags, viewer: PokerViewer): boolean {
  return pokerVisibleTo(flags, viewer) && flags.practiceBots
}

// ── Internal-alpha tournament gate ───────────────────────────────────────────────────────────
// The internal-alpha tournament surface is reachable ONLY when its own env flag
// (POKER_TOURNAMENT_INTERNAL_ALPHA) is ON *and* the viewer can already see poker at all
// (pokerVisibleTo → admins always; Closed-Beta members when closedBeta is running; a suspended
// tester or locked-out public user gets nothing). Fail-closed: flag OFF ⇒ nobody, not even an admin,
// so the whole surface ships dark. This never opens a cash-seating capability and never moves coins
// per hand (tournament chips are isolated, TNMT-CHIP-002). Mirrors the practice-bots gate shape.
export function pokerTournamentInternalAlphaVisible(flags: PokerFlags, viewer: PokerViewer): boolean {
  return pokerVisibleTo(flags, viewer) && flags.tournamentInternalAlpha
}

// Operator (create / start / transition / settle a tournament) additionally requires admin rights.
// Participants (register / unregister) only need visibility above. Management is server-authorized
// here and again at the DB (admin_transition / settle are GRANTed to service_role only).
export function pokerTournamentCanOperate(flags: PokerFlags, viewer: PokerViewer): boolean {
  return pokerTournamentInternalAlphaVisible(flags, viewer) && viewer.isAdmin
}

// True when the PUBLIC tournament capability is active (the public `tournament` flag). Hard-off this
// release. Its ONLY effect today is to arm the public launch-shape enforcement (27G-M1 / B2): when
// this is true, tournament creation is technically restricted to the validated heads-up single-table
// shape. Internal-alpha / closed-beta creation (public flag OFF) is unchanged.
export function pokerTournamentPublicEnabled(flags: PokerFlags): boolean {
  return flags.tournament === true
}
