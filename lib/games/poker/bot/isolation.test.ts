import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

// Structural isolation guards for the BOT layer (Prompt 27C-A audit). These prove, from source,
// that the bot subsystem stays walled off from the real economy and from the tournament domain —
// there is NO tournament-bot path and NO wallet path anywhere in the bot layer.

const HERE = dirname(fileURLToPath(import.meta.url))
const TOURNAMENT_DIR = join(HERE, '..', 'tournament')

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

function runtimeFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .filter((f) => !f.endsWith('.test.ts'))
}

test('the BOT layer imports NO Supabase client and NO real-economy table/RPC', () => {
  const forbidden = [
    '@/lib/supabase',
    'createAdminClient',
    'createClient(',
    'game_wallets',
    'coin_ledger',
    'poker_settle_hand',
    'poker_commit_action',
  ]
  for (const file of runtimeFiles(HERE)) {
    const code = stripComments(readFileSync(join(HERE, file), 'utf8'))
    for (const bad of forbidden) {
      assert.ok(!code.includes(bad), `bot/${file} references forbidden economy symbol "${bad}"`)
    }
  }
})

test('NO tournament-bot path: the bot layer never imports the tournament domain', () => {
  for (const file of runtimeFiles(HERE)) {
    const code = stripComments(readFileSync(join(HERE, file), 'utf8'))
    assert.ok(!/from ['"][^'"]*tournament/.test(code), `bot/${file} imports the tournament domain`)
  }
})

test('NO tournament-bot path: the tournament domain never imports the bot layer', () => {
  for (const file of runtimeFiles(TOURNAMENT_DIR)) {
    const code = stripComments(readFileSync(join(TOURNAMENT_DIR, file), 'utf8'))
    assert.ok(!/from ['"][^'"]*\/bot\//.test(code), `tournament/${file} imports the bot layer`)
    assert.ok(!/from ['"][^'"]*bot\/(policy|policies|runner|sim|observation|equity)/.test(code), `tournament/${file} imports a bot policy module`)
  }
})
