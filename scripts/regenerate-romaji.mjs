/**
 * One-off: regenerate the stored `romaji` (and `romaji_normalized`) of every
 * japanese_words row from the authoritative kana `reading`, fixing collapsed
 * long vowels (e.g. "shusei" → "shuusei", "taio" → "taiou").
 *
 * The vocabulary UI already derives correct romaji at render time via
 * lib/japanese/romaji.ts#displayRomaji, so this script is only needed to fix the
 * STORED value used by romaji search (`romaji_normalized`, `search_text`).
 *
 * Run from web/:
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/regenerate-romaji.mjs            # dry run, prints diff sample
 *   ... node scripts/regenerate-romaji.mjs --apply  # write changes
 */
import { createClient } from '@supabase/supabase-js'
import { kanaToRomaji } from '../lib/japanese/romaji.ts'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const APPLY = process.argv.includes('--apply')
const supabase = createClient(URL, KEY, { auth: { persistSession: false } })

const BATCH = 1000
let from = 0
let scanned = 0
let changed = 0
const samples = []

for (;;) {
  const { data, error } = await supabase
    .from('japanese_words')
    .select('id, word, reading, romaji')
    .order('id', { ascending: true })
    .range(from, from + BATCH - 1)
  if (error) { console.error(error); process.exit(1) }
  if (!data || data.length === 0) break

  const updates = []
  for (const row of data) {
    scanned++
    if (!row.reading) continue
    const next = kanaToRomaji(row.reading)
    if (!next || next === row.romaji) continue
    changed++
    if (samples.length < 30) samples.push(`${row.word}\t${row.reading}\t${row.romaji ?? '∅'} -> ${next}`)
    updates.push({ id: row.id, romaji: next, romaji_normalized: next.toLowerCase() })
  }

  if (APPLY && updates.length) {
    for (const u of updates) {
      const { error: uErr } = await supabase
        .from('japanese_words')
        .update({ romaji: u.romaji, romaji_normalized: u.romaji_normalized })
        .eq('id', u.id)
      if (uErr) { console.error('update failed', u.id, uErr.message); process.exit(1) }
    }
  }

  if (data.length < BATCH) break
  from += BATCH
}

console.log(samples.join('\n'))
console.log(`\nscanned=${scanned} would-change=${changed} ${APPLY ? '(APPLIED)' : '(dry run — pass --apply to write)'}`)
