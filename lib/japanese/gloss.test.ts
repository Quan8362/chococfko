import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatGloss, primarySense, hasRawMarkers } from './gloss.ts'

test('formatGloss strips [bắc]-style reading annotations', () => {
  assert.equal(
    formatGloss('[bắc] phía bắc, phương bắc; [bắc] thua trận'),
    'phía bắc, phương bắc; thua trận'
  )
})

test('primarySense returns only the first sense group, no raw markers', () => {
  assert.equal(primarySense('[bắc] phía bắc, phương bắc; [bắc] thua trận'), 'phía bắc, phương bắc')
  // unrelated later sense ("thua trận") never contaminates the prompt
  assert.ok(!primarySense('[bắc] phía bắc; [bắc] thua trận').includes('thua trận'))
})

test('formatGloss strips leading language codes and tidies separators', () => {
  assert.equal(formatGloss('vn: ăn ,  uống ;'), 'ăn, uống')
  assert.equal(formatGloss('GB - to eat'), 'to eat')
})

test('formatGloss removes duplicate senses (case-insensitive)', () => {
  assert.equal(formatGloss('to eat, To Eat, eat'), 'to eat, eat')
})

test('primarySense caps the number of glosses', () => {
  assert.equal(primarySense('a, b, c, d, e', 3), 'a, b, c')
})

test('empty / garbage input never invents a translation', () => {
  assert.equal(formatGloss(''), '')
  assert.equal(formatGloss(null), '')
  assert.equal(formatGloss('[bắc]'), '') // annotation only → nothing left
  assert.equal(primarySense(undefined), '')
})

test('hasRawMarkers flags suspicious source rows but not clean ones', () => {
  assert.equal(hasRawMarkers('[bắc] phía bắc'), true)
  assert.equal(hasRawMarkers('to eat <b>'), true)
  assert.equal(hasRawMarkers('phía bắc, phương bắc'), false)
  // stateless: repeated calls give the same answer (regex global-flag guard)
  assert.equal(hasRawMarkers('[x] y'), true)
  assert.equal(hasRawMarkers('[x] y'), true)
})

test('does not mutate meaningful content without brackets', () => {
  assert.equal(formatGloss('to fix, to repair'), 'to fix, to repair')
})
