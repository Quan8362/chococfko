import { test } from 'node:test'
import assert from 'node:assert/strict'

import { toBracketCompetitors } from './types.ts'
import type { PublicCompetitor } from './types.ts'

// Regression (Prompt 15D-1BV): CompetitorRow gained a REQUIRED `composition` field for the FJP
// handicap layer. The public → BracketView adapter must still satisfy that shape WITHOUT ever leaking
// gender make-up to the Guest surface — it fills `composition: null`. A missing field used to fail the
// build (TS2322); a non-null value would over-expose. This locks both.
test('toBracketCompetitors sets composition to null (never leaks gender make-up to Guests)', () => {
  const input: PublicCompetitor[] = [
    { id: 'a', name: 'Đội A', shortName: 'A', seed: 1, groupId: 'g1', groupName: 'Bảng A' },
    { id: 'b', name: 'Đội B', shortName: null, seed: null, groupId: null, groupName: null },
  ]
  const rows = toBracketCompetitors(input)
  assert.equal(rows.length, 2)
  for (const r of rows) {
    assert.ok('composition' in r, 'CompetitorRow.composition must be present')
    assert.equal(r.composition, null, 'public bracket rows must never carry composition')
    assert.equal(r.updatedAt, '', 'no real updatedAt leak')
    assert.equal(r.displayOrder, 0, 'no real displayOrder leak')
  }
  assert.equal(rows[0].id, 'a')
  assert.equal(rows[0].name, 'Đội A')
  assert.equal(rows[0].seed, 1)
})
