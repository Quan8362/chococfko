// node --test lib/placeIntent.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractIntent } from './placeIntent.ts'
import { normalizeText } from './placeSearch.ts'

test('price: "dưới 3500 yên" → priceMax, residual keeps the dish', () => {
  const i = extractIntent('tabe nomihodai dưới 3500 yên')
  assert.equal(i.priceMax, 3500)
  assert.equal(i.priceMin, undefined)
  assert.ok(i.rest.includes('tabe'))
  assert.ok(!i.rest.includes('yen'))
  assert.ok(!i.rest.includes('3500'))
})

test('price: range, over, JA 以下, and <N forms', () => {
  assert.deepEqual([extractIntent('1000 den 3000 yen').priceMin, extractIntent('1000 den 3000 yen').priceMax], [1000, 3000])
  assert.equal(extractIntent('trên 5000 yên').priceMin, 5000)
  assert.equal(extractIntent('3000円以下').priceMax, 3000)
  assert.equal(extractIntent('under 2000').priceMax, 2000)
  assert.equal(extractIntent('<1500').priceMax, 1500)
})

test('open now across locales', () => {
  assert.equal(extractIntent('quán đang mở gần tôi').openNow, true)
  assert.equal(extractIntent('今営業中のベトナム料理店').openNow, true)
  assert.equal(extractIntent('restaurants open now').openNow, true)
  assert.equal(extractIntent('지금 영업 중인 곳').openNow, true)
})

test('nearby intent vs area "near X"', () => {
  const a = extractIntent('quán đang mở gần tôi')
  assert.equal(a.nearby, true)
  assert.equal(a.area, undefined) // "gần tôi" is nearby, not an area named "tôi"
  const b = extractIntent('quán Việt gần Tenjin')
  assert.equal(b.nearby, undefined)
  assert.equal(b.area, 'tenjin')
  assert.ok(b.rest.includes('viet'))
})

test('station resolution (VI ga / EN station / JA 駅)', () => {
  assert.equal(extractIntent('quán nhậu gần ga Hakata').station, 'hakata')
  assert.equal(extractIntent('restaurant near Hakata Station').station, 'hakata')
  assert.equal(extractIntent('博多駅 ラーメン').station, '博多')
  // residual keeps the real query terms, drops the station markers
  const r = extractIntent('quán nhậu gần ga Hakata')
  assert.ok(r.rest.includes('nhau'))
  assert.ok(!r.rest.includes('hakata'))
  assert.ok(!/\bga\b/.test(r.rest))
})

test('suitability + facilities + rainy', () => {
  const i = extractIntent('chỗ đi cùng trẻ em khi trời mưa')
  assert.equal(i.children, true)
  assert.equal(i.rainy, true)
  assert.equal(extractIntent('quán có chỗ đỗ xe').parking, true)
  assert.equal(extractIntent('nhà hàng cần đặt chỗ').reservationAvailable, true)
  assert.equal(extractIntent('đi một mình').solo, true)
})

test('weekend + evening time-of-day detected as metadata', () => {
  const i = extractIntent('địa điểm miễn phí cuối tuần')
  assert.equal(i.weekend, true)
  assert.ok(i.rest.includes('mien')) // fee phrase left for the relevance engine
  assert.equal(extractIntent('nơi đi chơi buổi tối').timeOfDay, 'evening')
})

test('residual is clean (no orphan markers) for messy NL', () => {
  const i = extractIntent('quán nhậu gần ga Hakata')
  assert.equal(i.rest.trim(), 'nhau')
  const j = extractIntent('restaurant near Hakata Station')
  assert.equal(j.rest.trim(), '') // pure station query → no residual text
  const k = extractIntent('今営業中のベトナム料理店')
  assert.equal(k.openNow, true)
  assert.equal(k.rest.includes(normalizeText('ベトナム料理')), true) // rest is NFKD-normalized
})

test('plain queries pass through untouched', () => {
  const i = extractIntent('Keya Beach')
  assert.equal(i.rest, 'keya beach')
  assert.equal(i.matched.length, 0)
})
