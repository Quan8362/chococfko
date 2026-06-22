// node --test lib/placeOpenNow.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isOpenNow, jstParts, openStatus } from './placeOpenNow.ts'

// Helper: a UTC instant; JST = UTC + 9h. 2024-01-08 is a Monday.
const at = (y: number, m: number, d: number, hUtc: number, min = 0) => new Date(Date.UTC(y, m, d, hUtc, min))

test('jstParts reads Tokyo wall-clock regardless of host TZ', () => {
  const p = jstParts(at(2024, 0, 8, 1, 0)) // UTC 01:00 Mon → JST 10:00 Mon
  assert.equal(p.weekday, 'mon')
  assert.equal(p.minutes, 10 * 60)
})

test('isOpenNow: within / outside same-day slot', () => {
  const oh = { mon: [{ open: '09:00', close: '18:00' }] }
  assert.equal(isOpenNow(oh, null, at(2024, 0, 8, 1, 0)), true)   // JST Mon 10:00
  assert.equal(isOpenNow(oh, null, at(2024, 0, 8, 10, 0)), false) // JST Mon 19:00
  assert.equal(isOpenNow(oh, null, at(2024, 0, 8, 23, 0)), false) // JST Tue 08:00 (tue unknown → today undefined)...
})

test('isOpenNow: unknown data returns null', () => {
  assert.equal(isOpenNow(null, null, at(2024, 0, 8, 1, 0)), null)
  assert.equal(isOpenNow({ tue: [{ open: '09:00', close: '18:00' }] }, null, at(2024, 0, 8, 1, 0)), null) // Mon unknown, Sun unknown
})

test('isOpenNow: overnight slot wraps into the next day', () => {
  const oh = { fri: [{ open: '18:00', close: '02:00' }] }
  // JST Sat 01:00 = UTC Fri (Jan 5) 16:00 → yesterday(fri) wrap, still open
  assert.equal(isOpenNow(oh, null, at(2024, 0, 5, 16, 0)), true)
  // JST Fri 20:00 = UTC Fri (Jan 5) 11:00 → same-day after open
  assert.equal(isOpenNow(oh, null, at(2024, 0, 5, 11, 0)), true)
  // JST Sat 03:00 = UTC Fri (Jan 5) 18:00 → after wrap close → not open (Sat unknown)
  assert.equal(isOpenNow(oh, null, at(2024, 0, 5, 18, 0)), false)
})

test('isOpenNow: closed_days forces closed even with a slot', () => {
  const oh = { mon: [{ open: '09:00', close: '18:00' }] }
  assert.equal(isOpenNow(oh, ['mon'], at(2024, 0, 8, 1, 0)), false)
})

test('isOpenNow: explicit empty day = closed (known), not unknown', () => {
  assert.equal(isOpenNow({ mon: [] }, null, at(2024, 0, 8, 1, 0)), false)
})

// ── openStatus state machine ──
test('openStatus: open / closing_soon / opens_later / closed', () => {
  const oh = { mon: [{ open: '09:00', close: '18:00' }] }
  assert.equal(openStatus(oh, null, { now: at(2024, 0, 8, 1, 0) }), 'open')         // 10:00
  assert.equal(openStatus(oh, null, { now: at(2024, 0, 8, 8, 40) }), 'closing_soon') // 17:40 (≤30m)
  assert.equal(openStatus(oh, null, { now: at(2024, 0, 7, 23, 0) }), 'opens_later')  // Mon 08:00, before open
  assert.equal(openStatus(oh, null, { now: at(2024, 0, 8, 10, 0) }), 'closed')       // 19:00, after close
})

test('openStatus: temporary closure + unknown hours', () => {
  assert.equal(openStatus({ mon: [{ open: '09:00', close: '18:00' }] }, null, { now: at(2024, 0, 8, 1, 0), temporaryStatus: 'temporarily_closed' }), 'temporarily_closed')
  assert.equal(openStatus(null, null, { now: at(2024, 0, 8, 1, 0) }), 'hours_unknown')
  // Tuesday unknown (only mon defined, no wrap) → hours_unknown, not closed
  assert.equal(openStatus({ mon: [{ open: '09:00', close: '18:00' }] }, null, { now: at(2024, 0, 9, 1, 0) }), 'hours_unknown')
})

test('openStatus: closing_soon on overnight wrap + closed day', () => {
  const oh = { fri: [{ open: '18:00', close: '02:00' }] }
  // JST Sat 01:40 = UTC Fri 16:40 → 20m to 02:00 close → closing_soon
  assert.equal(openStatus(oh, null, { now: at(2024, 0, 5, 16, 40) }), 'closing_soon')
  // closed_days marks Monday closed
  assert.equal(openStatus({ mon: [{ open: '09:00', close: '18:00' }] }, ['mon'], { now: at(2024, 0, 8, 1, 0) }), 'closed')
})

test('openStatus: holiday uses ph slots when flagged', () => {
  const oh = { mon: [{ open: '09:00', close: '18:00' }], ph: [] }
  // Monday 10:00 but it's a holiday → ph=[] → closed (not open)
  assert.equal(openStatus(oh, null, { now: at(2024, 0, 8, 1, 0), isHoliday: true }), 'closed')
  assert.equal(openStatus(oh, null, { now: at(2024, 0, 8, 1, 0), isHoliday: false }), 'open')
})
