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

test('displayRomaji prefers regenerating from kana over a bad stored value', () => {
  assert.equal(displayRomaji('しゅうせい', 'shusei'), 'shuusei')
  assert.equal(displayRomaji('たいおう', 'taio'), 'taiou')
  // no usable reading → fall back to stored
  assert.equal(displayRomaji(null, 'legacy'), 'legacy')
  assert.equal(displayRomaji('', 'legacy'), 'legacy')
})
