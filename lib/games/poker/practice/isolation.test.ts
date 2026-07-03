import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { assertPracticeKind, assertNoBotOnCashTable } from './classification.ts'
import { botSeat, humanSeat } from './fixtures.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

// Runtime (non-test) modules in the practice layer. These must be structurally isolated from the
// real economy + human-only progression systems.
function runtimeModules(): string[] {
  return readdirSync(HERE)
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => !f.endsWith('.test.ts'))
    .filter((f) => f !== 'fixtures.ts') // test-support, never bundled
}

// Strip line + block comments so documentation prose (which legitimately DESCRIBES the isolation)
// is not mistaken for a real reference. Only executable code is scanned.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1') // line comments (leave `://` in URLs intact)
}

// Forbidden references in CODE: importing a Supabase client or naming a real-economy /
// human-progression table or RPC would breach practice isolation.
const FORBIDDEN = [
  '@/lib/supabase',
  'createAdminClient',
  'createClient(',
  'game_wallets',
  'coin_ledger',
  'poker_settle_hand',
  'poker_commit_action',
  'progress-record',
  'recordHandProgress',
  'ranking-data',
  'from \'./achievements',
  'from \'../achievements',
  'from \'./missions',
  'from \'../missions',
]

test('CASE 17/18/19/20 — practice runtime imports NO wallet/ranking/achievement/mission system', () => {
  for (const file of runtimeModules()) {
    const code = stripComments(readFileSync(join(HERE, file), 'utf8'))
    for (const bad of FORBIDDEN) {
      assert.ok(!code.includes(bad), `${file} references forbidden real-economy symbol "${bad}"`)
    }
  }
})

test('CASE 21 — a bot identity has NO userId (cannot impersonate a real user)', () => {
  const bot = botSeat(1, 'normal', 10000)
  assert.equal(bot.occupant.kind, 'bot')
  // A bot occupant carries a botId + difficulty, never a userId.
  assert.ok(!('userId' in bot.occupant))
  assert.ok('botId' in bot.occupant)
  const human = humanSeat(0, 'real-user-id', 10000)
  assert.equal(human.occupant.kind, 'human')
  assert.ok('userId' in human.occupant)
})

test('CASE 15/16 — bots may never sit at, nor convert, a cash table', () => {
  assert.throws(() => assertPracticeKind('cash'))
  assert.throws(() => assertNoBotOnCashTable('cash', 'bot'))
  assert.doesNotThrow(() => assertPracticeKind('practice'))
})
