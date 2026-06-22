// node --test lib/placeQa.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isReportKind, buildQuestionThreads, sortQuestions, type QaRow } from './placeQa.ts'

test('isReportKind validates the allowed set', () => {
  assert.ok(isReportKind('price_changed'))
  assert.ok(isReportKind('wrong_map'))
  assert.ok(!isReportKind('bogus'))
  assert.ok(!isReportKind(null))
})

const rows: QaRow[] = [
  { id: 'q1', user_id: 'u1', content: 'Need reservation?', created_at: '2024-01-01T00:00:00Z', author_name: 'A', author_avatar: null, kind: 'question', parent_id: null, helpful: false },
  { id: 'q2', user_id: 'u2', content: 'Parking?', created_at: '2024-02-01T00:00:00Z', author_name: 'B', author_avatar: null, kind: 'question', parent_id: null, helpful: false },
  { id: 'a1', user_id: 'u3', content: 'Yes, book ahead', created_at: '2024-01-02T00:00:00Z', author_name: 'C', author_avatar: null, kind: 'answer', parent_id: 'q1', helpful: true },
  { id: 'a2', user_id: 'u4', content: 'Maybe', created_at: '2024-01-03T00:00:00Z', author_name: 'D', author_avatar: null, kind: 'answer', parent_id: 'q1', helpful: false },
  { id: 'h1', user_id: 'u5', content: 'hidden answer', created_at: '2024-01-04T00:00:00Z', author_name: 'E', author_avatar: null, kind: 'answer', parent_id: 'q2', helpful: false, status: 'hidden' },
  { id: 'c1', user_id: 'u6', content: 'a plain comment', created_at: '2024-01-05T00:00:00Z', author_name: 'F', author_avatar: null, kind: 'comment', parent_id: null, helpful: false },
]

test('buildQuestionThreads nests answers, excludes comments + hidden', () => {
  const qs = buildQuestionThreads(rows)
  assert.equal(qs.length, 2) // q1, q2 (comment c1 excluded)
  const q1 = qs.find((q) => q.id === 'q1')!
  assert.equal(q1.answers.length, 2)
  assert.equal(q1.answers[0].id, 'a1') // helpful answer first
  const q2 = qs.find((q) => q.id === 'q2')!
  assert.equal(q2.answers.length, 0) // hidden answer excluded
})

test('sortQuestions: newest vs most-helpful', () => {
  const qs = buildQuestionThreads(rows)
  assert.deepEqual(sortQuestions(qs, 'newest').map((q) => q.id), ['q2', 'q1']) // q2 newer
  assert.deepEqual(sortQuestions(qs, 'helpful').map((q) => q.id), ['q1', 'q2']) // q1 has a helpful answer
})
