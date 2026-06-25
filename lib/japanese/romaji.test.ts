// node --test lib/japanese/romaji.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { kanaToRomaji, displayRomaji } from './romaji.ts'

test('long vowels are written out (the original bug)', () => {
  assert.equal(kanaToRomaji('しゅうせい'), 'shuusei') // 修正 — was wrongly "shusei"
  assert.equal(kanaToRomaji('たいおう'), 'taiou')     // 対応 — was wrongly "taio"
  assert.equal(kanaToRomaji('せんせい'), 'sensei')    // えい kept as ei
  assert.equal(kanaToRomaji('おおさか'), 'oosaka')    // おお kept as oo
  assert.equal(kanaToRomaji('くうこう'), 'kuukou')
})

test('basic gojūon + dakuten/handakuten', () => {
  assert.equal(kanaToRomaji('ねこ'), 'neko')
  assert.equal(kanaToRomaji('がっこう'), 'gakkou')
  assert.equal(kanaToRomaji('でんわ'), 'denwa')
  assert.equal(kanaToRomaji('ぱん'), 'pan')
})

test('yōon (contracted sounds)', () => {
  assert.equal(kanaToRomaji('きゃく'), 'kyaku')
  assert.equal(kanaToRomaji('しゃしん'), 'shashin')
  assert.equal(kanaToRomaji('じゅう'), 'juu')
  assert.equal(kanaToRomaji('りょこう'), 'ryokou')
})

test('sokuon っ doubles the next consonant; っち → tchi', () => {
  assert.equal(kanaToRomaji('きって'), 'kitte')
  assert.equal(kanaToRomaji('ざっし'), 'zasshi')
  assert.equal(kanaToRomaji('まっちゃ'), 'matcha')
  assert.equal(kanaToRomaji('いっぱい'), 'ippai')
})

test('syllabic ん → n, n’ before vowel or y', () => {
  assert.equal(kanaToRomaji('しんぶん'), 'shinbun')
  assert.equal(kanaToRomaji('しんあい'), "shin'ai")
  assert.equal(kanaToRomaji('ほんや'), "hon'ya")
  assert.equal(kanaToRomaji('げんき'), 'genki')
})

test('katakana + long mark ー', () => {
  assert.equal(kanaToRomaji('コーヒー'), 'koohii')
  assert.equal(kanaToRomaji('テーブル'), 'teeburu')
  assert.equal(kanaToRomaji('スーパー'), 'suupaa')
  assert.equal(kanaToRomaji('カメラ'), 'kamera')
})

test('foreign combos', () => {
  assert.equal(kanaToRomaji('ファイル'), 'fairu')
  assert.equal(kanaToRomaji('パーティー'), 'paatii')
})

test('particle は/へ/を in fixed phrases romanize as wa/e/o (not ha/he/wo)', () => {
  // The new fix — particle は is "wa" in these greeting/phrase headwords.
  assert.equal(kanaToRomaji('こんにちは'), 'konnichiwa') // was wrongly "konnichiha"
  assert.equal(kanaToRomaji('こんばんは'), 'konbanwa')   // was wrongly "konbanha"
  assert.equal(kanaToRomaji('では'), 'dewa')
  assert.equal(kanaToRomaji('それでは'), 'soredewa')
  // Katakana spelling of a greeting still normalizes through the override.
  assert.equal(kanaToRomaji('コンニチハ'), 'konnichiwa')
})

test('word-は (not a particle) is still read "ha" — no over-correction', () => {
  assert.equal(kanaToRomaji('はな'), 'hana')   // 花
  assert.equal(kanaToRomaji('はし'), 'hashi')  // 橋 / 箸
  assert.equal(kanaToRomaji('はは'), 'haha')   // 母 — trailing は must stay ha
  assert.equal(kanaToRomaji('にほんは'), 'nihonha') // not whitelisted → unchanged
})

test('long-vowel fix still holds alongside the particle fix (no regression)', () => {
  assert.equal(kanaToRomaji('べんきょう'), 'benkyou')
  assert.equal(kanaToRomaji('しゅうせい'), 'shuusei')
  assert.equal(kanaToRomaji('おはよう'), 'ohayou')
  assert.equal(kanaToRomaji('おはようございます'), 'ohayougozaimasu')
})

test('displayRomaji prefers regenerating from kana over a bad stored value', () => {
  assert.equal(displayRomaji('しゅうせい', 'shusei'), 'shuusei')
  assert.equal(displayRomaji('たいおう', 'taio'), 'taiou')
  // no usable reading → fall back to stored
  assert.equal(displayRomaji(null, 'legacy'), 'legacy')
  assert.equal(displayRomaji('', 'legacy'), 'legacy')
})
