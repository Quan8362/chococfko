// node --test lib/calendar.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildICS, gcalUrl, planSummaryText, type CalStop } from './calendar.ts'
import { genShareToken, isValidShareToken } from './shareToken.ts'

const stops: CalStop[] = [
  { title: 'Hakata Ramen', date: '2024-01-08', arrivalTime: '12:00', durationMinutes: 60, location: 'Hakata', note: 'order tonkotsu', estCost: 1000 },
  { title: 'No-time stop', date: '2024-01-08' }, // skipped (no arrival time)
]

test('buildICS emits a VEVENT only for timed stops with correct stamps', () => {
  const ics = buildICS('Fukuoka Day', stops)
  assert.ok(ics.includes('BEGIN:VCALENDAR') && ics.includes('END:VCALENDAR'))
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1) // only the timed stop
  assert.ok(ics.includes('DTSTART;TZID=Asia/Tokyo:20240108T120000'))
  assert.ok(ics.includes('DTEND;TZID=Asia/Tokyo:20240108T130000')) // +60 min
  assert.ok(ics.includes('SUMMARY:Hakata Ramen'))
  // empty when nothing is timed
  assert.equal(buildICS('x', [{ title: 'a' }]), '')
})

test('gcalUrl builds a template link with JST and date range', () => {
  const url = gcalUrl(stops[0])!
  assert.ok(url.startsWith('https://calendar.google.com/calendar/render?'))
  assert.ok(url.includes('action=TEMPLATE'))
  assert.ok(url.includes('dates=20240108T120000%2F20240108T130000'))
  assert.ok(url.includes('ctz=Asia%2FTokyo'))
  assert.equal(gcalUrl({ title: 'no date' }), null)
})

test('planSummaryText is readable and ordered', () => {
  const s = planSummaryText('Fukuoka Day', '2024-01-08', stops)
  assert.ok(s.startsWith('Fukuoka Day — 2024-01-08'))
  assert.ok(s.includes('1. Hakata Ramen 12:00 (~¥1000)'))
  assert.ok(s.includes('order tonkotsu'))
})

test('share tokens are unguessable and validate', () => {
  const a = genShareToken(); const b = genShareToken()
  assert.notEqual(a, b)
  assert.ok(isValidShareToken(a))
  assert.ok(!isValidShareToken('short'))
  assert.ok(!isValidShareToken('has-dashes-xxxxxxxxxxxxxxxxxxxx'))
})
