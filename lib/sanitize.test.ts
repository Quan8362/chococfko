import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanMeaningText, stripLocalePrefix } from './sanitize.ts'

// ── the critical regression: legitimate words must NOT be truncated ──
const KEEP_INTACT = [
  'việc', 'việc học', 'viết', 'viết bài', 'ví dụ', 'vì', 'vì vậy',
  'vi phạm', 'vị trí', 'viên', 'viền', 'viếng', 'việt', 'tiếng Việt',
  'environment', 'enjoy', 'en route', 'Japanese', 'jam', 'koala', 'zone',
  '한국어', '中文', '日本語',
]

test('REGRESSION: a bare leading language-code sequence is never stripped from a word', () => {
  for (const w of KEEP_INTACT) {
    assert.equal(cleanMeaningText(w), w, `cleanMeaningText corrupted: ${w}`)
  }
})

test('REGRESSION: the exact broken grammar string is preserved', () => {
  const s = 'việc ..., cái ... (danh từ hóa động từ / mệnh đề)'
  assert.equal(cleanMeaningText(s), s)
})

test('explicit metadata forms ARE stripped', () => {
  assert.equal(cleanMeaningText('vi: việc học'), 'việc học')
  assert.equal(cleanMeaningText('[vi] việc học'), 'việc học')
  assert.equal(cleanMeaningText('vi - việc học'), 'việc học')
  assert.equal(cleanMeaningText('EN: to eat'), 'to eat')
  assert.equal(cleanMeaningText('[en] enjoy'), 'enjoy')
  assert.equal(cleanMeaningText('vn | sửa chữa'), 'sửa chữa')
  assert.equal(cleanMeaningText('GB： correction'), 'correction')
})

test('bare "code + space" (no delimiter) is left intact — too ambiguous to strip', () => {
  // Would otherwise corrupt "vi phạm" → "phạm", so we deliberately keep it.
  assert.equal(cleanMeaningText('vi phạm'), 'vi phạm')
  assert.equal(cleanMeaningText('en route'), 'en route')
})

test('idempotence', () => {
  for (const s of ['vi: việc học', '[en] enjoy', 'việc học', 'vn | sửa chữa']) {
    assert.equal(cleanMeaningText(cleanMeaningText(s)), cleanMeaningText(s))
  }
})

test('empty / null safety', () => {
  assert.equal(cleanMeaningText(''), '')
  assert.equal(cleanMeaningText(null), '')
  assert.equal(cleanMeaningText(undefined), '')
})

test('stripLocalePrefix only removes recognized boundary forms', () => {
  assert.equal(stripLocalePrefix('việc'), 'việc')
  assert.equal(stripLocalePrefix('ja: 日本'), '日本')
  assert.equal(stripLocalePrefix('ko - 한국'), '한국')
})
