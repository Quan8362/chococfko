import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatGloss, primarySense, hasRawMarkers, isPresentableText } from './gloss.ts'

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

// ── REGRESSION: việc-style truncation must never happen via formatGloss ──
const IDENTITY = [
  'việc học', 'viết bài', 'ví dụ', 'vị trí', 'vì vậy', 'vi phạm', 'tiếng Việt',
  'environment', 'enjoy', 'en route', 'Japanese', '한국어', '中文', '日本語',
]
test('REGRESSION: formatGloss preserves legitimate words (no leading-char loss)', () => {
  for (const w of IDENTITY) assert.equal(formatGloss(w), w, `corrupted: ${w}`)
})

test('REGRESSION: the exact broken grammar string survives formatGloss', () => {
  const s = 'việc ..., cái ... (danh từ hóa động từ / mệnh đề)'
  assert.equal(formatGloss(s), s)
  assert.ok(formatGloss(s).startsWith('việc'))
})

test('explicit locale metadata IS removed by formatGloss', () => {
  assert.equal(formatGloss('vi: việc học'), 'việc học')
  assert.equal(formatGloss('[vi] việc học'), 'việc học')
  assert.equal(formatGloss('vi - việc học'), 'việc học')
})

test('INVARIANT idempotence: formatGloss(formatGloss(x)) === formatGloss(x)', () => {
  const samples = ['[bắc] phía bắc; [bắc] thua trận', 'việc học', 'vi: ăn, uống', 'to fix, to repair', '日本語']
  for (const s of samples) assert.equal(formatGloss(formatGloss(s)), formatGloss(s), s)
})

test('INVARIANT non-empty: valid meaning never becomes empty', () => {
  for (const s of IDENTITY) assert.ok(formatGloss(s).length > 0, s)
})

test('INVARIANT no-mutation: input string is not modified', () => {
  const raw = '[bắc] phía bắc'
  const copy = String(raw)
  formatGloss(raw); primarySense(raw); hasRawMarkers(raw)
  assert.equal(raw, copy)
})

test('isPresentableText accepts clean content, rejects malformed', () => {
  assert.equal(isPresentableText('việc học'), true)
  assert.equal(isPresentableText('日本語'), true)
  assert.equal(isPresentableText(''), false)
  assert.equal(isPresentableText('   '), false)
  assert.equal(isPresentableText('phía � bắc'), false) // replacement char
  assert.equal(isPresentableText('[bắc] phía bắc'), false) // leftover annotation
  assert.equal(isPresentableText('<b>x</b>'), false) // raw HTML
  assert.equal(isPresentableText('vi:'), false) // dangling locale token
})
