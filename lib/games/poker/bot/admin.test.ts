import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_BOT_TABLE_CONFIG,
  validateBotTableConfig,
  isBotAllowedAtTable,
  botIdentity,
  assertBotLabeled,
  makeBotIncident,
  redactCards,
  type BotTableConfig,
} from './admin.ts'

test('default config is disabled and safe', () => {
  assert.equal(DEFAULT_BOT_TABLE_CONFIG.enabled, false)
  assert.equal(DEFAULT_BOT_TABLE_CONFIG.affectsStats, false)
  assert.equal(DEFAULT_BOT_TABLE_CONFIG.separateEconomy, true)
  assert.ok(!DEFAULT_BOT_TABLE_CONFIG.allowedDifficulties.includes('simulation'))
  assert.equal(validateBotTableConfig(DEFAULT_BOT_TABLE_CONFIG).ok, true)
})

test('validateBotTableConfig rejects the TEST-ONLY simulation policy for user-facing play', () => {
  const cfg: BotTableConfig = { ...DEFAULT_BOT_TABLE_CONFIG, allowedDifficulties: ['simulation'], defaultDifficulty: 'simulation' }
  const v = validateBotTableConfig(cfg)
  assert.equal(v.ok, false)
  assert.ok(v.errors.some((e) => e.includes('TEST-ONLY')))
})

test('validateBotTableConfig caps bots so a human seat is always preserved', () => {
  const cfg: BotTableConfig = { ...DEFAULT_BOT_TABLE_CONFIG, maxBotsPerTable: 6 }
  const v = validateBotTableConfig(cfg)
  assert.equal(v.ok, false)
  assert.ok(v.errors.some((e) => e.includes('6-max')))
})

test('bots are NEVER allowed at a human-only or ranked table', () => {
  const cfg: BotTableConfig = { ...DEFAULT_BOT_TABLE_CONFIG, enabled: true }
  assert.equal(isBotAllowedAtTable(cfg, 'human_only', 1, 5).ok, false)
  assert.equal(isBotAllowedAtTable(cfg, 'ranked', 1, 5).ok, false)
})

test('bots are allowed at an enabled practice table within the cap', () => {
  const cfg: BotTableConfig = { ...DEFAULT_BOT_TABLE_CONFIG, enabled: true }
  assert.equal(isBotAllowedAtTable(cfg, 'practice', 5, 1).ok, true)
  assert.equal(isBotAllowedAtTable(cfg, 'practice', 6, 1).ok, false) // over cap AND over seats
  assert.equal(isBotAllowedAtTable(cfg, 'practice', 3, 0).ok, false) // no human seat
})

test('a disabled config forbids bots everywhere', () => {
  assert.equal(isBotAllowedAtTable(DEFAULT_BOT_TABLE_CONFIG, 'practice', 1, 1).ok, false)
})

test('a bot identity is always labeled isBot=true', () => {
  const id = botIdentity(2, 'normal')
  assert.equal(id.isBot, true)
  assert.equal(id.difficulty, 'normal')
  assert.ok(id.labelI18nKey.length > 0)
  assert.doesNotThrow(() => assertBotLabeled(id))
  assert.throws(() => assertBotLabeled({ isBot: false }))
  assert.throws(() => assertBotLabeled({}))
})

test('bot incidents redact any card token (a crash must not leak cards)', () => {
  assert.equal(redactCards('policy threw holding As Kd on Qc board'), 'policy threw holding ** ** on ** board')
  const inc = makeBotIncident({
    kind: 'crash',
    tableId: 't1',
    seatIndex: 3,
    difficulty: 'hard',
    handNo: 12,
    code: 'BOOM',
    detail: 'crashed with Ah in hand',
  })
  assert.ok(!/\bAh\b/.test(inc.detail))
  assert.equal(inc.handNo, 12)
  assert.equal(inc.kind, 'crash')
})
