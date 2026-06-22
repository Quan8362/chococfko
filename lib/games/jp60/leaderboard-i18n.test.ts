import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'messages')
const LOCALES = ['vi', 'en', 'ja', 'ko', 'zh']
const load = (l: string) => JSON.parse(readFileSync(join(root, `${l}.json`), 'utf8')).games.jp60

test('every locale has the player-level + avatar-alt leaderboard keys', () => {
  for (const l of LOCALES) {
    const j = load(l)
    for (const k of ['lb_player_level', 'lb_level_value', 'lb_avatar_alt']) {
      assert.ok(j[k] && j[k].length > 0, `${l} missing ${k}`)
    }
  }
})

test('lb_level_value is an interpolated template with a separator — never "Cấp5"', () => {
  for (const l of LOCALES) {
    const v = load(l).lb_level_value as string
    assert.ok(v.includes('{n}'), `${l}: must interpolate {n}`)
    // The level number must be separated from the label (space or period),
    // so it never renders glued like "Cấp5".
    assert.match(v, /[ .]\{n\}|\{n\}[ .]|[. ]$|^Lv\. /, `${l}: "${v}" has no separator before/after the number`)
    // Rendered sample must contain a space or a "Lv." prefix.
    const rendered = v.replace('{n}', '5')
    assert.ok(/\s|Lv\./.test(rendered) && rendered !== 'Cấp5', `${l}: renders as "${rendered}"`)
  }
})

test('player-level label is distinct from the JLPT level filter label', () => {
  for (const l of LOCALES) {
    const j = load(l)
    // JLPT filter (lb_filter_level) and player-level column must not be identical.
    assert.notEqual(j.lb_player_level, j.lb_filter_level, `${l}: player level vs JLPT filter share a label`)
  }
})
