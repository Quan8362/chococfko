// Tests for TLMN avatar / identity resolution (avatar.ts). Proves the authoritative
// priority (profile → OAuth metadata → null), that a player always resolves to their
// OWN avatar, deterministic initials fallbacks, and the fixed bot-suit mapping.
// Run with:  node --test lib/games/tlmn/avatar.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resolveAvatarUrl, resolveDisplayName,
  botNumberFromName, botThemeIndex, BOT_SUITS,
} from './avatar.ts'

// ── Avatar priority ────────────────────────────────────────────────────────────────
test('avatar: profile.avatar_url wins over OAuth metadata', () => {
  const url = resolveAvatarUrl(
    { display_name: 'A', avatar_url: 'https://app/me.png' },
    { avatar_url: 'https://google/g.png', picture: 'https://google/p.png' },
  )
  assert.equal(url, 'https://app/me.png')
})

test('avatar: falls back to OAuth avatar_url when profile avatar is null', () => {
  const url = resolveAvatarUrl(
    { display_name: 'A', avatar_url: null },
    { avatar_url: 'https://google/g.png', picture: 'https://google/p.png' },
  )
  assert.equal(url, 'https://google/g.png')
})

test('avatar: falls back to OAuth picture when avatar_url metadata absent', () => {
  const url = resolveAvatarUrl(
    { display_name: 'A', avatar_url: '' },
    { picture: 'https://fb/p.png' },
  )
  assert.equal(url, 'https://fb/p.png')
})

test('avatar: null when the user genuinely has no avatar anywhere', () => {
  assert.equal(resolveAvatarUrl({ display_name: 'A', avatar_url: null }, null), null)
  assert.equal(resolveAvatarUrl(null, null), null)
  assert.equal(resolveAvatarUrl({ avatar_url: '   ' }, { picture: '' }), null)
})

test('avatar: two players resolve to their OWN distinct avatars (no cross-bleed)', () => {
  const a = resolveAvatarUrl({ avatar_url: 'https://app/a.png' }, null)
  const b = resolveAvatarUrl({ avatar_url: null }, { picture: 'https://google/b.png' })
  assert.equal(a, 'https://app/a.png')
  assert.equal(b, 'https://google/b.png')
  assert.notEqual(a, b)
})

// ── Display name priority ───────────────────────────────────────────────────────────
test('name: profile.display_name wins, then metadata chain, then email local-part', () => {
  assert.equal(resolveDisplayName({ display_name: 'Quan' }, { name: 'X' }), 'Quan')
  assert.equal(resolveDisplayName({ display_name: null }, { name: 'Meta Name' }), 'Meta Name')
  assert.equal(resolveDisplayName({}, { full_name: 'Full Name' }), 'Full Name')
  assert.equal(resolveDisplayName(null, { email: 'someone@example.com' }), 'someone')
  assert.equal(resolveDisplayName(null, null), '')
})

// ── Bot suit mapping ────────────────────────────────────────────────────────────────
const SPADE = 0, CLUB = 1, DIAMOND = 2, HEART = 3

test('bot: number parsed from the label', () => {
  assert.equal(botNumberFromName('Bot 1'), 1)
  assert.equal(botNumberFromName('Bot 3'), 3)
  assert.equal(botNumberFromName('Bot'), 0)
  assert.equal(botNumberFromName(null), 0)
})

test('bot: Bot 1 → spade, Bot 2 → diamond, Bot 3 → club (by bot number, not seat)', () => {
  assert.equal(BOT_SUITS[botThemeIndex('Bot 1')], SPADE)
  assert.equal(BOT_SUITS[botThemeIndex('Bot 2')], DIAMOND)
  assert.equal(BOT_SUITS[botThemeIndex('Bot 3')], CLUB)
  assert.equal(BOT_SUITS[botThemeIndex('Bot 4')], HEART)
})

test('bot: mapping follows the bot number even when its seat differs', () => {
  // Bot 2 sitting in seat 3 must still be the diamond, not the seat-3 (club) emblem.
  assert.equal(BOT_SUITS[botThemeIndex('Bot 2', 3)], DIAMOND)
})

test('bot: falls back to seat index only when the name has no number', () => {
  // Unnamed bot in seat 1 → index 0 → spade (legacy stable behaviour).
  assert.equal(BOT_SUITS[botThemeIndex('', 1)], SPADE)
  assert.equal(BOT_SUITS[botThemeIndex(null, 2)], DIAMOND)
})

test('bot: theme index always in range', () => {
  for (const name of ['Bot 1', 'Bot 99', 'Bot 0', '', null]) {
    const i = botThemeIndex(name, 7)
    assert.ok(i >= 0 && i < BOT_SUITS.length)
  }
})
