import test from 'node:test'
import assert from 'node:assert/strict'
import {
  resolvePokerFlags,
  pokerVisibleTo,
  pokerCan,
  pokerSocialFeatureOn,
  pokerPracticeBotsOn,
  pokerTournamentInternalAlphaVisible,
  pokerTournamentCanOperate,
  parseAlphaTesters,
  isAlphaTester,
  POKER_FLAG_ENV,
  type PokerFlags,
  type PokerSocialFeature,
} from './flags.ts'

const OFF: PokerFlags = {
  enabled: false, createTable: false, publicLobby: false,
  privateTable: false, spectator: false, bot: false, tournament: false,
  tournamentInternalAlpha: false,
  practiceBots: false,
  alpha: false, blockNewJoins: false, closedBeta: false,
  achievements: false, missions: false, friendInvites: false,
  quickMessages: false, handSharing: false,
}
const admin = { isAdmin: true }
const player = { isAdmin: false }
const tester = { isAdmin: false, isAlphaTester: true }

test('FLAG-DEFAULT-001 empty env resolves every flag OFF', () => {
  assert.deepEqual(resolvePokerFlags({}), OFF)
})

test('FLAG-DEFAULT-002 unset/garbage values resolve OFF', () => {
  const f = resolvePokerFlags({
    POKER_ENABLED: '', POKER_CREATE_TABLE_ENABLED: '0',
    POKER_PUBLIC_LOBBY_ENABLED: 'false', POKER_PRIVATE_TABLE_ENABLED: 'off',
    POKER_SPECTATOR_ENABLED: 'nope',
  })
  assert.deepEqual(f, OFF)
})

test('FLAG-TRUTHY-001 accepts 1/true/on/yes (case-insensitive, trimmed)', () => {
  for (const v of ['1', 'true', 'TRUE', ' on ', 'Yes']) {
    assert.equal(resolvePokerFlags({ POKER_ENABLED: v }).enabled, true, `value=${v}`)
  }
})

test('FLAG-HARDOFF-001 bot/tournament stay OFF even when env sets them on', () => {
  const f = resolvePokerFlags({ POKER_BOT_ENABLED: 'true', POKER_TOURNAMENT_ENABLED: '1' })
  assert.equal(f.bot, false)
  assert.equal(f.tournament, false)
})

test('FLAG-ENVMAP-001 exposes exactly the canonical env names', () => {
  assert.deepEqual(Object.values(POKER_FLAG_ENV).sort(), [
    'POKER_ACHIEVEMENTS_ENABLED', 'POKER_ALPHA_MODE', 'POKER_BLOCK_NEW_JOINS',
    'POKER_BOT_ENABLED', 'POKER_CLOSED_BETA_ENABLED', 'POKER_CREATE_TABLE_ENABLED',
    'POKER_ENABLED', 'POKER_FRIEND_INVITES_ENABLED', 'POKER_HAND_SHARING_ENABLED',
    'POKER_MISSIONS_ENABLED', 'POKER_PRACTICE_BOTS_ENABLED', 'POKER_PRIVATE_TABLE_ENABLED',
    'POKER_PUBLIC_LOBBY_ENABLED', 'POKER_QUICK_MESSAGES_ENABLED', 'POKER_SPECTATOR_ENABLED',
    'POKER_TOURNAMENT_ENABLED', 'POKER_TOURNAMENT_INTERNAL_ALPHA',
  ])
})

// ── Internal-alpha tournament gate ─────────────────────────────────────────────────
const tnmtBeta = { isAdmin: false, isBetaMember: true }
const tnmtSuspended = { isAdmin: false, isBetaMember: true, suspended: true }

test('TNMT-GATE-001 internal-alpha flag is a real env flag, default OFF, not hard-off', () => {
  assert.equal(resolvePokerFlags({}).tournamentInternalAlpha, false)
  assert.equal(resolvePokerFlags({ POKER_TOURNAMENT_INTERNAL_ALPHA: '1' }).tournamentInternalAlpha, true)
  // public `tournament` stays hard-off independently
  assert.equal(resolvePokerFlags({ POKER_TOURNAMENT_INTERNAL_ALPHA: '1' }).tournament, false)
})

test('TNMT-GATE-002 surface is fully dark when the flag is OFF (nobody, not even admin)', () => {
  const off = { ...OFF, enabled: true, closedBeta: true } // poker visible, but tournament flag OFF
  assert.equal(pokerTournamentInternalAlphaVisible(off, admin), false)
  assert.equal(pokerTournamentInternalAlphaVisible(off, tnmtBeta), false)
  assert.equal(pokerTournamentCanOperate(off, admin), false)
})

test('TNMT-GATE-003 with flag ON: admins + Closed-Beta members see it; public does not', () => {
  const on = { ...OFF, closedBeta: true, tournamentInternalAlpha: true }
  assert.equal(pokerTournamentInternalAlphaVisible(on, admin), true)      // admin always visible
  assert.equal(pokerTournamentInternalAlphaVisible(on, tnmtBeta), true)   // beta member in closedBeta
  assert.equal(pokerTournamentInternalAlphaVisible(on, player), false)    // public locked out
})

test('TNMT-GATE-004 suspended beta member is denied even with the flag ON', () => {
  const on = { ...OFF, closedBeta: true, tournamentInternalAlpha: true }
  assert.equal(pokerTournamentInternalAlphaVisible(on, tnmtSuspended), false)
  assert.equal(pokerTournamentCanOperate(on, tnmtSuspended), false)
})

test('TNMT-GATE-005 operator gate requires admin; a visible beta participant cannot operate', () => {
  const on = { ...OFF, closedBeta: true, tournamentInternalAlpha: true }
  assert.equal(pokerTournamentCanOperate(on, admin), true)
  assert.equal(pokerTournamentCanOperate(on, tnmtBeta), false)  // visible, but not an operator
})

test('TNMT-GATE-006 without closedBeta a beta member is NOT visible (needs poker visible first)', () => {
  const on = { ...OFF, tournamentInternalAlpha: true } // closedBeta OFF, enabled OFF
  assert.equal(pokerTournamentInternalAlphaVisible(on, tnmtBeta), false)
  assert.equal(pokerTournamentInternalAlphaVisible(on, admin), true) // admin bypasses visibility
})

// ── Social layer flags ──────────────────────────────────────────────────────────
const SOCIAL: [PokerSocialFeature, string][] = [
  ['achievements', 'POKER_ACHIEVEMENTS_ENABLED'],
  ['missions', 'POKER_MISSIONS_ENABLED'],
  ['friendInvites', 'POKER_FRIEND_INVITES_ENABLED'],
  ['quickMessages', 'POKER_QUICK_MESSAGES_ENABLED'],
  ['handSharing', 'POKER_HAND_SHARING_ENABLED'],
]

test('SOCIAL-DEFAULT-001 every social flag defaults OFF', () => {
  const f = resolvePokerFlags({})
  for (const [feature] of SOCIAL) assert.equal(f[feature], false, feature)
})

test('SOCIAL-RESOLVE-001 each social flag maps to its env key', () => {
  for (const [feature, env] of SOCIAL) {
    assert.equal(POKER_FLAG_ENV[feature], env)
    assert.equal(resolvePokerFlags({ [env]: '1' })[feature], true, feature)
  }
})

test('SOCIAL-GATE-001 a social feature is off unless its flag is on AND poker is visible', () => {
  // visible (enabled) but the feature flag off → gated off
  assert.equal(pokerSocialFeatureOn({ ...OFF, enabled: true }, player, 'achievements'), false)
  // flag on but poker not visible to this player → gated off
  assert.equal(pokerSocialFeatureOn({ ...OFF, achievements: true }, player, 'achievements'), false)
  // both → on
  assert.equal(pokerSocialFeatureOn({ ...OFF, enabled: true, achievements: true }, player, 'achievements'), true)
})

test('SOCIAL-GATE-002 no admin override — a dark social flag stays dark even for admins', () => {
  // admin is always visible, but the feature flag is off → feature does not render
  assert.equal(pokerSocialFeatureOn({ ...OFF }, admin, 'missions'), false)
  assert.equal(pokerSocialFeatureOn({ ...OFF, missions: true }, admin, 'missions'), true)
})

test('SOCIAL-GATE-003 a suspended tester never sees a social feature even with the flag on', () => {
  const f = { ...OFF, closedBeta: true, achievements: true }
  const suspended = { isAdmin: false, isBetaMember: true, suspended: true }
  assert.equal(pokerSocialFeatureOn(f, suspended, 'achievements'), false)
})

// ── Practice-bots flag (Prompt 27B) ────────────────────────────────────────────
test('PRACTICE-DEFAULT-001 practiceBots defaults OFF and maps to its env key', () => {
  assert.equal(resolvePokerFlags({}).practiceBots, false)
  assert.equal(POKER_FLAG_ENV.practiceBots, 'POKER_PRACTICE_BOTS_ENABLED')
  assert.equal(resolvePokerFlags({ POKER_PRACTICE_BOTS_ENABLED: '1' }).practiceBots, true)
})

test('PRACTICE-GATE-001 practice bots need the flag ON and poker visible; no admin override', () => {
  // visible but flag off → off
  assert.equal(pokerPracticeBotsOn({ ...OFF, enabled: true }, player), false)
  // flag on but not visible → off
  assert.equal(pokerPracticeBotsOn({ ...OFF, practiceBots: true }, player), false)
  // both → on
  assert.equal(pokerPracticeBotsOn({ ...OFF, enabled: true, practiceBots: true }, player), true)
  // admin visible but dark flag → still off (ships dark)
  assert.equal(pokerPracticeBotsOn({ ...OFF }, admin), false)
})

test('PRACTICE-GATE-002 the live cash `bot` flag is NEVER turned on by env (unchanged hard-off)', () => {
  assert.equal(resolvePokerFlags({ POKER_BOT_ENABLED: 'true', POKER_PRACTICE_BOTS_ENABLED: 'true' }).bot, false)
})

test('PRACTICE-GATE-003 alpha playtest config: allowlisted tester ON, anon + non-allowlisted OFF', () => {
  // Mirrors .env.playtest.local: alpha mode + practiceBots on, everything else off.
  const f: PokerFlags = { ...OFF, alpha: true, practiceBots: true }
  // Allowlisted alpha tester → the practice entry is visible.
  assert.equal(pokerPracticeBotsOn(f, tester), true)
  // Authenticated but NOT on the allowlist → denied (alpha gate closes).
  assert.equal(pokerPracticeBotsOn(f, player), false)
  // A suspended allowlisted tester → denied.
  assert.equal(pokerPracticeBotsOn(f, { ...tester, suspended: true }), false)
  // With the practice flag itself off, even an allowlisted tester sees nothing (fully dark).
  assert.equal(pokerPracticeBotsOn({ ...f, practiceBots: false }, tester), false)
})

test('VIS-001 nobody but admin sees poker when master flag is off', () => {
  assert.equal(pokerVisibleTo(OFF, player), false)
  assert.equal(pokerVisibleTo(OFF, admin), true)
})

test('VIS-002 master flag on makes it visible to everyone', () => {
  const f = { ...OFF, enabled: true }
  assert.equal(pokerVisibleTo(f, player), true)
})

test('CAP-001 a disabled feature is closed to players but open to admins', () => {
  const f = { ...OFF, enabled: true } // visible, but no capability flags on
  assert.equal(pokerCan(f, player, 'create'), false)
  assert.equal(pokerCan(f, player, 'public_lobby'), false)
  assert.equal(pokerCan(f, player, 'private_table'), false)
  assert.equal(pokerCan(f, player, 'spectate'), false)
  assert.equal(pokerCan(f, player, 'enter'), true)
  // admin overrides every capability
  for (const cap of ['create', 'public_lobby', 'private_table', 'spectate', 'enter'] as const) {
    assert.equal(pokerCan(f, admin, cap), true, `admin cap=${cap}`)
  }
})

test('CAP-002 capability requires visibility first', () => {
  const f = { ...OFF, createTable: true } // create on but master off
  assert.equal(pokerCan(f, player, 'create'), false)
})

test('CAP-003 a specific capability flag opens exactly that capability', () => {
  const f = { ...OFF, enabled: true, publicLobby: true }
  assert.equal(pokerCan(f, player, 'public_lobby'), true)
  assert.equal(pokerCan(f, player, 'create'), false)
})

// ── Alpha mode ────────────────────────────────────────────────────────────────
test('ALPHA-VIS-001 alpha mode locks the public out and admits only testers', () => {
  const f = { ...OFF, alpha: true } // note: enabled stays false
  assert.equal(pokerVisibleTo(f, player), false)
  assert.equal(pokerVisibleTo(f, tester), true)
  assert.equal(pokerVisibleTo(f, admin), true)
})

test('ALPHA-VIS-002 alpha mode overrides an ON master flag (public still locked out)', () => {
  const f = { ...OFF, alpha: true, enabled: true }
  assert.equal(pokerVisibleTo(f, player), false, 'public must not slip in via enabled')
  assert.equal(pokerVisibleTo(f, tester), true)
})

test('ALPHA-VIS-003 with alpha OFF behaviour is unchanged (enabled || admin)', () => {
  assert.equal(pokerVisibleTo({ ...OFF, enabled: true }, player), true)
  assert.equal(pokerVisibleTo({ ...OFF }, tester), false, 'tester flag is inert when alpha off')
})

test('ALPHA-RESOLVE-001 env maps POKER_ALPHA_MODE / POKER_BLOCK_NEW_JOINS', () => {
  const f = resolvePokerFlags({ POKER_ALPHA_MODE: 'on', POKER_BLOCK_NEW_JOINS: '1' })
  assert.equal(f.alpha, true)
  assert.equal(f.blockNewJoins, true)
})

test('FREEZE-001 blockNewJoins closes create + join for everyone (incl. admin)', () => {
  const f = { ...OFF, enabled: true, createTable: true, blockNewJoins: true }
  assert.equal(pokerCan(f, player, 'join'), false)
  assert.equal(pokerCan(f, player, 'create'), false)
  assert.equal(pokerCan(f, admin, 'join'), false)
  assert.equal(pokerCan(f, admin, 'create'), false)
})

test('FREEZE-002 a freeze does NOT block entering / spectating a running table', () => {
  const f = { ...OFF, enabled: true, spectator: true, blockNewJoins: true }
  assert.equal(pokerCan(f, player, 'enter'), true)
  assert.equal(pokerCan(f, player, 'spectate'), true)
})

test('FREEZE-003 without a freeze, join is allowed for any visible viewer', () => {
  const f = { ...OFF, enabled: true }
  assert.equal(pokerCan(f, player, 'join'), true)
})

test('TESTER-PARSE-001 allowlist is trimmed, lower-cased, de-duped', () => {
  assert.deepEqual(parseAlphaTesters(' A@x.com, b@x.com ,A@X.COM,'), ['a@x.com', 'b@x.com'])
  assert.deepEqual(parseAlphaTesters(''), [])
  assert.deepEqual(parseAlphaTesters(null), [])
})

test('TESTER-MATCH-001 membership is case-insensitive; empty email never matches', () => {
  const raw = 'tester@fko.com, quan@fko.com'
  assert.equal(isAlphaTester('QUAN@fko.com', raw), true)
  assert.equal(isAlphaTester('nobody@x.com', raw), false)
  assert.equal(isAlphaTester(null, raw), false)
  assert.equal(isAlphaTester('tester@fko.com', ''), false)
})

// ── Closed Beta stage ─────────────────────────────────────────────────────────
const betaMember = { isAdmin: false, isBetaMember: true }

test('BETA-VIS-001 closed beta locks the public out and admits only cohort members', () => {
  const f = { ...OFF, closedBeta: true }
  assert.equal(pokerVisibleTo(f, player), false)
  assert.equal(pokerVisibleTo(f, betaMember), true)
  assert.equal(pokerVisibleTo(f, admin), true)
})

test('BETA-VIS-002 closed beta overrides an ON master flag (public still locked out)', () => {
  const f = { ...OFF, closedBeta: true, enabled: true }
  assert.equal(pokerVisibleTo(f, player), false, 'public must not slip in via enabled')
  assert.equal(pokerVisibleTo(f, betaMember), true)
})

test('BETA-VIS-003 with closed beta OFF the member flag is inert', () => {
  assert.equal(pokerVisibleTo({ ...OFF }, betaMember), false)
  assert.equal(pokerVisibleTo({ ...OFF, enabled: true }, betaMember), true, 'public flag admits everyone')
})

test('BETA-SUSPEND-001 a suspended non-admin is locked out even if a member', () => {
  const f = { ...OFF, closedBeta: true }
  assert.equal(pokerVisibleTo(f, { isAdmin: false, isBetaMember: true, suspended: true }), false)
  assert.equal(pokerVisibleTo(f, { isAdmin: true, suspended: true }), true, 'admin is never suspended by this flag')
})

test('BETA-RESOLVE-001 env maps POKER_CLOSED_BETA_ENABLED', () => {
  assert.equal(resolvePokerFlags({ POKER_CLOSED_BETA_ENABLED: '1' }).closedBeta, true)
  assert.equal(resolvePokerFlags({}).closedBeta, false)
  assert.equal(POKER_FLAG_ENV.closedBeta, 'POKER_CLOSED_BETA_ENABLED')
})

test('BETA-ALPHA-PRECEDENCE-001 alpha gate is checked before beta (fails closed if both on)', () => {
  const f = { ...OFF, alpha: true, closedBeta: true }
  // a beta member who is NOT an alpha tester is kept out while alpha is left on
  assert.equal(pokerVisibleTo(f, betaMember), false)
  assert.equal(pokerVisibleTo(f, tester), true)
})

// ── Public launch (27G-U2): publicDiscovery + publicPlayer ─────────────────────
// publicDiscovery = public poker fully rolled out (opens discovery to everyone, incl. anon).
// publicPlayer   = an authenticated, non-suspended viewer at full rollout (opens player capabilities).
const anonDiscovery = { isAdmin: false, publicDiscovery: true }
const publicPlayer = { isAdmin: false, publicDiscovery: true, publicPlayer: true }

test('PUBLIC-VIS-001 publicDiscovery makes poker visible with every env flag OFF (legacy master off)', () => {
  // The live prod shape: POKER_ENABLED off, but the public rollout is at 100% → discovery is open.
  assert.equal(pokerVisibleTo(OFF, anonDiscovery), true)
  assert.equal(pokerVisibleTo(OFF, publicPlayer), true)
  // A plain viewer with no public signal still sees nothing (unchanged).
  assert.equal(pokerVisibleTo(OFF, player), false)
})

test('PUBLIC-VIS-002 a suspended viewer is denied even at full public launch', () => {
  assert.equal(pokerVisibleTo(OFF, { isAdmin: false, publicDiscovery: true, publicPlayer: true, suspended: true }), false)
})

test('PUBLIC-CAP-001 publicPlayer opens the standard player capabilities without per-cap env flags', () => {
  for (const cap of ['enter', 'create', 'join', 'public_lobby', 'private_table', 'spectate'] as const) {
    assert.equal(pokerCan(OFF, publicPlayer, cap), true, `publicPlayer cap=${cap}`)
  }
})

test('PUBLIC-CAP-002 discovery-only (anonymous) is visible but holds NO seating capability', () => {
  // Visible for discovery, but create/join/lobby/private/spectate stay closed until sign-in.
  assert.equal(pokerCan(OFF, anonDiscovery, 'enter'), true)
  assert.equal(pokerCan(OFF, anonDiscovery, 'join'), false, 'anon must sign in before joining')
  assert.equal(pokerCan(OFF, anonDiscovery, 'create'), false)
  assert.equal(pokerCan(OFF, anonDiscovery, 'public_lobby'), false)
  assert.equal(pokerCan(OFF, anonDiscovery, 'private_table'), false)
  assert.equal(pokerCan(OFF, anonDiscovery, 'spectate'), false)
})

test('PUBLIC-CAP-003 the wind-down freeze still closes create + join for a public player', () => {
  const frozen = { ...OFF, blockNewJoins: true }
  assert.equal(pokerCan(frozen, publicPlayer, 'create'), false)
  assert.equal(pokerCan(frozen, publicPlayer, 'join'), false)
  // …but never blocks entering / spectating a running table.
  assert.equal(pokerCan(frozen, publicPlayer, 'enter'), true)
  assert.equal(pokerCan(frozen, publicPlayer, 'spectate'), true)
})

test('PUBLIC-CAP-004 publicPlayer confers NO operator/admin capability (tournament stays privileged)', () => {
  // Internal-alpha tournament flag OFF → even a full public player cannot see/operate it.
  assert.equal(pokerTournamentInternalAlphaVisible(OFF, publicPlayer), false)
  assert.equal(pokerTournamentCanOperate(OFF, publicPlayer), false)
  // With the flag ON, a public player still cannot OPERATE (needs admin).
  const on = { ...OFF, tournamentInternalAlpha: true }
  assert.equal(pokerTournamentCanOperate(on, publicPlayer), false)
})

test('PUBLIC-PRACTICE-001 practice bots open to a public player without the practice env flag', () => {
  assert.equal(pokerPracticeBotsOn(OFF, publicPlayer), true)
  // …but a discovery-only anon does not get the practice runtime (visible, yet not a public player).
  assert.equal(pokerPracticeBotsOn(OFF, anonDiscovery), false)
})

test('PUBLIC-SOCIAL-001 additive social features stay dark for a public player until their own flag flips', () => {
  // publicPlayer does NOT open achievements/missions/etc — those keep their own env flags.
  assert.equal(pokerSocialFeatureOn(OFF, publicPlayer, 'achievements'), false)
  assert.equal(pokerSocialFeatureOn({ ...OFF, achievements: true }, publicPlayer, 'achievements'), true)
})
