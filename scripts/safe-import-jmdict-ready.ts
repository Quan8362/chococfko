#!/usr/bin/env node
/**
 * safe-import-jmdict-ready.ts
 *
 * Phase 7: Import a reviewed JMdict CSV (meaning_vi + meaning_en filled)
 * into japanese_words safely. Full protection for manually-authored data.
 *
 * Dry-run (connects DB, reports — no writes):
 *   npx tsx scripts/safe-import-jmdict-ready.ts \
 *     --input ./data/japanese/jmdict-n5-vi-ready-001.csv --dry-run
 *
 * Commit (run dry-run first to verify):
 *   npx tsx scripts/safe-import-jmdict-ready.ts \
 *     --input ./data/japanese/jmdict-n5-vi-ready-001.csv --commit
 *
 * Run from the web/ directory.
 *
 * Safety guarantees:
 *   - source=self / license=self-authored rows: NEVER touched
 *   - review_status=approved + meaning_source=manual: NEVER touched
 *   - All inserted rows: is_published=false, review_status=ai_draft
 *   - meaning_vi on has_vi_meaning=true rows: NEVER overwritten
 *   - japanese_raw_jmdict converted_status: only updated after successful commit
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

// ─── DB INTERFACES ────────────────────────────────────────────
// Duck-typed to avoid Supabase generic conflicts — same pattern as other scripts.

interface FetchResult  { data: Record<string, unknown>[] | null; error: { message: string } | null }
interface MutateResult { error: { message: string } | null }

interface QB extends PromiseLike<FetchResult> {
  eq(col: string, val: unknown): QB
  in(col: string, vals: unknown[]): QB
}
interface MutQB extends PromiseLike<MutateResult> {
  eq(col: string, val: unknown): MutQB
  in(col: string, vals: unknown[]): MutQB
}
interface TableRef {
  select(cols: string): QB
  upsert(rows: Record<string, unknown>[], opts: { onConflict: string; ignoreDuplicates: boolean }): PromiseLike<MutateResult>
  update(values: Record<string, unknown>): MutQB
}
interface ScriptClient { from(table: string): TableRef }

// ─── ENV ──────────────────────────────────────────────────────

function loadEnvLocal(): void {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    const key = m[1].trim()
    const val = m[2].trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

// ─── CLI ARGS ─────────────────────────────────────────────────

interface CliArgs {
  input:   string | null
  dryRun:  boolean
  commit:  boolean
  maxRows: number | null
}

function parseArgs(argv: string[]): CliArgs {
  const a: CliArgs = { input: null, dryRun: false, commit: false, maxRows: null }
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i]
    if (f === '--dry-run')           { a.dryRun  = true;  continue }
    if (f === '--commit')            { a.commit  = true;  continue }
    if (f === '--input')             { a.input   = argv[++i] ?? null; continue }
    if (f === '--max-rows')          { a.maxRows = parseInt(argv[++i] ?? '0', 10) || null; continue }
    if (f.startsWith('--input='))    { a.input   = f.slice(8);  continue }
    if (f.startsWith('--max-rows=')) { a.maxRows = parseInt(f.slice(11), 10) || null; continue }
  }
  return a
}

// ─── CSV PARSER ───────────────────────────────────────────────

function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let i = 0
  while (i < line.length) {
    if (line[i] === '"') {
      i++ // skip opening quote
      let field = ''
      while (i < line.length) {
        if (line[i] === '"' && i + 1 < line.length && line[i + 1] === '"') {
          field += '"'; i += 2 // escaped quote
        } else if (line[i] === '"') {
          i++; break           // closing quote
        } else {
          field += line[i++]
        }
      }
      fields.push(field)
    } else {
      let field = ''
      while (i < line.length && line[i] !== ',') field += line[i++]
      fields.push(field)
    }
    if (i < line.length && line[i] === ',') {
      i++
      if (i === line.length) fields.push('') // trailing comma → empty last field
    }
  }
  return fields
}

const CSV_COLS = [
  'word', 'reading', 'romaji', 'jlpt_level', 'pos', 'meaning_vi', 'meaning_en',
  'tags', 'frequency', 'source', 'source_id', 'license', 'attribution',
  'example_jp', 'example_reading', 'example_vi', 'example_en',
  'review_status', 'meaning_source',
] as const
type CsvCol = typeof CSV_COLS[number]
type CsvRow = Record<CsvCol, string>

function parseCsv(content: string): { rows: CsvRow[]; parseErrors: string[] } {
  const parseErrors: string[] = []
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return { rows: [], parseErrors: ['File trống'] }

  const header = parseCsvLine(lines[0])
  const expected = CSV_COLS.join(',')
  if (header.join(',') !== expected) {
    parseErrors.push(`Header không khớp.\n  Expected: ${expected}\n  Got:      ${header.join(',')}`)
    return { rows: [], parseErrors }
  }

  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i])
    if (fields.length !== CSV_COLS.length) {
      parseErrors.push(`Dòng ${i + 1}: ${fields.length} cột (cần ${CSV_COLS.length})`)
      continue
    }
    const row = {} as CsvRow
    CSV_COLS.forEach((k, j) => { row[k] = fields[j] })
    rows.push(row)
  }
  return { rows, parseErrors }
}

// ─── VALIDATION ───────────────────────────────────────────────

interface ValidationResult {
  valid:               boolean
  blankVi:             string[]
  blankEn:             string[]
  duplicates:          string[]
  wrongSource:         string[]
  wrongReviewStatus:   string[]
  wrongMeaningSource:  string[]
}

function validateRows(rows: CsvRow[]): ValidationResult {
  const r: ValidationResult = {
    valid: true, blankVi: [], blankEn: [], duplicates: [],
    wrongSource: [], wrongReviewStatus: [], wrongMeaningSource: [],
  }
  const seen = new Set<string>()
  for (let i = 0; i < rows.length; i++) {
    const row   = rows[i]
    const label = `Dòng ${i + 2} (${row.word})`
    if (!row.meaning_vi || row.meaning_vi === 'TODO_VI') r.blankVi.push(label)
    if (!row.meaning_en)                                 r.blankEn.push(label)
    const key = `${row.word}|||${row.reading}`
    if (seen.has(key)) r.duplicates.push(`${label}: trùng word+reading`)
    seen.add(key)
    if (row.source         !== 'jmdict')     r.wrongSource.push(label)
    if (row.review_status  !== 'ai_draft')   r.wrongReviewStatus.push(label)
    if (row.meaning_source !== 'jmdict_ai')  r.wrongMeaningSource.push(label)
  }
  r.valid = r.blankVi.length === 0 && r.blankEn.length === 0 && r.duplicates.length === 0
  return r
}

// ─── MEANING HELPERS ──────────────────────────────────────────

const PIPE_SEP = ' | '

function splitPipe(s: string): string[] {
  return s ? s.split(PIPE_SEP).map(p => p.trim()).filter(Boolean) : []
}

// Build [{vi, en}] pairs from two pipe-separated strings.
// Aligns by position: vi[i] ↔ en[i].
function buildMeanings(viStr: string, enStr: string): { vi: string; en: string }[] {
  const vi = splitPipe(viStr)
  const en = splitPipe(enStr)
  const len = Math.max(vi.length, en.length)
  const result: { vi: string; en: string }[] = []
  for (let i = 0; i < len; i++) {
    const v = vi[i] ?? ''; const e = en[i] ?? ''
    if (v || e) result.push({ vi: v, en: e })
  }
  return result
}

// Backfill en into existing meanings without touching vi.
// Only fills positions where en is currently empty.
function backfillEn(
  existing: { vi: string; en: string }[] | null,
  incomingEnStr: string,
): { vi: string; en: string }[] | null {
  if (!existing?.length) return existing ?? null
  const enParts = splitPipe(incomingEnStr)
  return existing.map((m, i) => ({
    vi: m.vi,
    en: m.en || enParts[i] || '',
  }))
}

function buildExample(row: CsvRow): { jp: string; reading: string; vi: string; en: string }[] | null {
  if (!row.example_jp) return null
  return [{ jp: row.example_jp, reading: row.example_reading, vi: row.example_vi, en: row.example_en }]
}

// ─── EXISTING ROW ─────────────────────────────────────────────

interface ExistingRow {
  word:           string
  reading:        string | null
  meanings:       { vi: string; en: string }[] | null
  source:         string | null
  license:        string | null
  has_vi_meaning: boolean
  review_status:  string | null
  meaning_source: string | null
}

function isManualProtected(ex: ExistingRow): boolean {
  return (
    ex.source  === 'self'          ||
    ex.license === 'self-authored' ||
    (ex.review_status === 'approved' && ex.meaning_source === 'manual')
  )
}

function existingHasEn(ex: ExistingRow): boolean {
  return (ex.meanings ?? []).some(m => !!m.en)
}

// ─── CLASSIFICATION ───────────────────────────────────────────

interface Classification {
  toInsert:         CsvRow[]                             // not in DB, or exists with no vi (safe full upsert)
  toUpdateEnOnly:   { row: CsvRow; existing: ExistingRow }[]  // has vi, missing en → backfill en
  skipProtected:    { row: CsvRow; existing: ExistingRow }[]  // source=self / self-authored / approved+manual
  skipHasVi:        { row: CsvRow; existing: ExistingRow }[]  // has_vi_meaning=true + en present → no change needed
}

function classifyRows(rows: CsvRow[], existingMap: Map<string, ExistingRow>): Classification {
  const result: Classification = { toInsert: [], toUpdateEnOnly: [], skipProtected: [], skipHasVi: [] }
  for (const row of rows) {
    const existing = existingMap.get(`${row.word}|||${row.reading}`)
    if (!existing) { result.toInsert.push(row); continue }

    if (isManualProtected(existing)) {
      result.skipProtected.push({ row, existing }); continue
    }

    if (existing.has_vi_meaning) {
      if (existingHasEn(existing)) {
        result.skipHasVi.push({ row, existing })    // both vi+en present → skip
      } else {
        result.toUpdateEnOnly.push({ row, existing })  // vi present, en missing → backfill en
      }
      continue
    }

    // has_vi_meaning=false, not protected → safe full upsert
    result.toInsert.push(row)
  }
  return result
}

// ─── PAYLOAD BUILDER ──────────────────────────────────────────

function buildInsertPayload(row: CsvRow): Record<string, unknown> {
  const meanings = buildMeanings(row.meaning_vi, row.meaning_en)
  const example  = buildExample(row)
  const posArr   = row.pos  ? row.pos.split('|').map(p => p.trim()).filter(Boolean) : null
  const tagsArr  = row.tags ? row.tags.split(',').map(t => t.trim()).filter(Boolean) : null
  const freq     = parseInt(row.frequency, 10) || 0

  const viParts  = meanings.map(m => m.vi).filter(Boolean)
  const enParts  = meanings.map(m => m.en).filter(Boolean)
  const exVi     = example?.[0]?.vi ?? ''
  const exEn     = example?.[0]?.en ?? ''

  const searchText = [row.word, row.reading, row.romaji, ...viParts, ...enParts, exVi, exEn]
    .filter(Boolean).join(' ').trim()
  const viSearchText = [...viParts, exVi].filter(Boolean).join(' ').trim() || null

  return {
    word:              row.word,
    reading:           row.reading  || null,
    romaji:            row.romaji   || null,
    jlpt_level:        row.jlpt_level || null,
    pos:               posArr?.length ? posArr : null,
    meanings:          meanings.length ? meanings : null,
    examples:          example,
    tags:              tagsArr?.length ? tagsArr : null,
    frequency:         freq,
    is_published:      false,          // never auto-publish ai_draft
    source:            'jmdict',
    source_id:         row.source_id  || null,
    license:           row.license    || null,
    attribution:       row.attribution || null,
    has_vi_meaning:    meanings.some(m => !!m.vi),
    search_text:       searchText   || null,
    vi_search_text:    viSearchText,
    kana_normalized:   row.reading  || '',
    romaji_normalized: (row.romaji  || '').toLowerCase(),
    review_status:     'ai_draft',
    meaning_source:    'jmdict_ai',
  }
}

// ─── DB OPERATIONS ────────────────────────────────────────────

const CHUNK = 100

async function upsertBatch(
  client: ScriptClient,
  rows: CsvRow[],
): Promise<{ success: number; failed: number; errors: string[] }> {
  const payloads = rows.map(buildInsertPayload)
  let success = 0, failed = 0
  const errors: string[] = []

  for (let i = 0; i < payloads.length; i += CHUNK) {
    const slice     = payloads.slice(i, i + CHUNK)
    const sliceRows = rows.slice(i, i + CHUNK)
    const { error } = await client
      .from('japanese_words')
      .upsert(slice, { onConflict: 'word,reading', ignoreDuplicates: false })

    if (error) {
      for (let j = 0; j < slice.length; j++) {
        const { error: e2 } = await client
          .from('japanese_words')
          .upsert([slice[j]], { onConflict: 'word,reading', ignoreDuplicates: false })
        if (e2) { failed++; errors.push(`${sliceRows[j].word}: ${e2.message}`) }
        else    { success++ }
      }
    } else {
      success += slice.length
    }
  }
  return { success, failed, errors }
}

async function updateEnBatch(
  client: ScriptClient,
  items: { row: CsvRow; existing: ExistingRow }[],
): Promise<{ success: number; failed: number; errors: string[] }> {
  let success = 0, failed = 0
  const errors: string[] = []

  for (const { row, existing } of items) {
    const newMeanings = backfillEn(existing.meanings, row.meaning_en)
    if (!newMeanings) continue // can't backfill (null meanings despite has_vi — data inconsistency)

    const { error } = await client
      .from('japanese_words')
      .update({ meanings: newMeanings })
      .eq('word', row.word)
      .eq('reading', row.reading || null)

    if (error) { failed++; errors.push(`${row.word} en-backfill: ${error.message}`) }
    else       { success++ }
  }
  return { success, failed, errors }
}

async function markConverted(
  client: ScriptClient,
  entSeqs: string[],
): Promise<void> {
  if (entSeqs.length === 0) return
  const now = new Date().toISOString()
  const MARK_CHUNK = 200
  for (let i = 0; i < entSeqs.length; i += MARK_CHUNK) {
    const chunk = entSeqs.slice(i, i + MARK_CHUNK)
    const { error } = await client
      .from('japanese_raw_jmdict')
      .update({ converted_status: 'converted', converted_at: now })
      .in('ent_seq', chunk)
    if (error) console.warn(`⚠️  markConverted error (chunk ${i}): ${error.message}`)
  }
}

async function fetchExisting(
  client: ScriptClient,
  words: string[],
): Promise<Map<string, ExistingRow>> {
  const map = new Map<string, ExistingRow>()
  const PAGE = 400
  for (let i = 0; i < words.length; i += PAGE) {
    const chunk = words.slice(i, i + PAGE)
    const result = await client
      .from('japanese_words')
      .select('word,reading,meanings,source,license,has_vi_meaning,review_status,meaning_source')
      .in('word', chunk)
    if (result.error) throw new Error(`fetchExisting: ${result.error.message}`)
    for (const r of (result.data ?? [])) {
      const ex: ExistingRow = {
        word:           String(r['word']  ?? ''),
        reading:        r['reading']       != null ? String(r['reading'])       : null,
        meanings:       Array.isArray(r['meanings']) ? r['meanings'] as { vi: string; en: string }[] : null,
        source:         r['source']        != null ? String(r['source'])        : null,
        license:        r['license']       != null ? String(r['license'])       : null,
        has_vi_meaning: Boolean(r['has_vi_meaning']),
        review_status:  r['review_status'] != null ? String(r['review_status']) : null,
        meaning_source: r['meaning_source']!= null ? String(r['meaning_source']): null,
      }
      map.set(`${ex.word}|||${ex.reading ?? ''}`, ex)
    }
  }
  return map
}

// ─── REPORT ───────────────────────────────────────────────────

function printClassification(cls: Classification): void {
  const total = cls.toInsert.length + cls.toUpdateEnOnly.length
    + cls.skipProtected.length + cls.skipHasVi.length

  console.log(`\n📊 Classification:`)
  console.log(`   Total CSV rows:            ${total}`)
  console.log(`   ✅ INSERT (new/no-vi):     ${cls.toInsert.length}`)
  console.log(`   📝 UPDATE en-only:         ${cls.toUpdateEnOnly.length}`)
  console.log(`   🔒 SKIP manual protected:  ${cls.skipProtected.length}`)
  console.log(`   ⏭️  SKIP already has vi+en: ${cls.skipHasVi.length}`)

  if (cls.skipProtected.length > 0) {
    console.log(`\n🔒 Protected rows (will NOT be touched even with --commit):`)
    cls.skipProtected.slice(0, 5).forEach(({ row, existing }) => {
      console.log(`   ${row.word} [${row.reading}] — source=${existing.source}, license=${existing.license}`)
    })
    if (cls.skipProtected.length > 5) console.log(`   ... and ${cls.skipProtected.length - 5} more`)
  }

  if (cls.toUpdateEnOnly.length > 0) {
    console.log(`\n📝 En-backfill (vi kept intact, en added from CSV):`)
    cls.toUpdateEnOnly.slice(0, 3).forEach(({ row }) => {
      console.log(`   ${row.word} [${row.reading}]`)
    })
    if (cls.toUpdateEnOnly.length > 3) console.log(`   ... and ${cls.toUpdateEnOnly.length - 3} more`)
  }

  if (cls.toInsert.length > 0) {
    console.log(`\n✅ Sample inserts (first 5):`)
    cls.toInsert.slice(0, 5).forEach(row => {
      const viPreview = splitPipe(row.meaning_vi).slice(0, 2).join(' | ')
      const more = splitPipe(row.meaning_vi).length > 2 ? ' | ...' : ''
      console.log(`   ${row.word} [${row.reading}] — ${viPreview}${more}`)
    })
    if (cls.toInsert.length > 5) console.log(`   ... and ${cls.toInsert.length - 5} more`)
  }
}

// ─── MAIN ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  loadEnvLocal()
  const args = parseArgs(process.argv.slice(2))

  if (!args.dryRun && !args.commit) {
    console.warn('⚠️  Không có --dry-run hoặc --commit. Mặc định: --dry-run.')
    args.dryRun = true
  }
  if (args.dryRun && args.commit) {
    console.error('❌ --dry-run và --commit không dùng cùng nhau.')
    process.exit(1)
  }
  if (!args.input) {
    console.error('❌ --input <path/to/ready.csv> là bắt buộc')
    console.error('   Ví dụ: npx tsx scripts/safe-import-jmdict-ready.ts \\')
    console.error('     --input ./data/japanese/jmdict-n5-vi-ready-001.csv --dry-run')
    process.exit(1)
  }

  const inputPath = resolve(process.cwd(), args.input)
  if (!existsSync(inputPath)) {
    console.error(`❌ File không tìm thấy: ${inputPath}`)
    process.exit(1)
  }

  // ── Parse CSV ──
  const mode = args.dryRun ? 'DRY-RUN' : 'COMMIT'
  console.log(`\n📂 [${mode}] Reading: ${inputPath}`)
  const content = readFileSync(inputPath, 'utf-8')
  const { rows: allRows, parseErrors } = parseCsv(content)

  if (parseErrors.length > 0) {
    console.error('❌ Lỗi parse CSV:')
    parseErrors.forEach(e => console.error(`   ${e}`))
    process.exit(1)
  }

  const rows = args.maxRows ? allRows.slice(0, args.maxRows) : allRows
  console.log(`   Rows parsed: ${rows.length}${args.maxRows ? ` (capped at ${args.maxRows})` : ''}`)

  // ── Validate ──
  console.log(`\n🔍 Validating...`)
  const v = validateRows(rows)
  console.log(`   blank meaning_vi:       ${v.blankVi.length}`)
  console.log(`   blank meaning_en:       ${v.blankEn.length}`)
  console.log(`   duplicate word+reading: ${v.duplicates.length}`)
  console.log(`   source != jmdict:       ${v.wrongSource.length}`)
  console.log(`   review_status != ai_draft:    ${v.wrongReviewStatus.length}`)
  console.log(`   meaning_source != jmdict_ai:  ${v.wrongMeaningSource.length}`)

  if (!v.valid) {
    console.error('\n❌ Validation thất bại — sửa trước khi import:')
    ;[...v.blankVi, ...v.blankEn, ...v.duplicates].slice(0, 10).forEach(e => console.error(`   ${e}`))
    process.exit(1)
  }
  console.log(`   ✅ Validation OK`)

  // ── Connect DB ──
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ Thiếu env var: NEXT_PUBLIC_SUPABASE_URL và/hoặc SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as ScriptClient

  // ── Fetch existing ──
  const uniqueWords = Array.from(new Set(rows.map(r => r.word)))
  console.log(`\n🔍 Checking ${uniqueWords.length} words in japanese_words...`)
  const existingMap = await fetchExisting(client, uniqueWords)
  console.log(`   Existing matches: ${existingMap.size}`)

  // ── Classify ──
  const cls = classifyRows(rows, existingMap)
  printClassification(cls)

  // ── Dry-run stop ──
  if (args.dryRun) {
    console.log(`\n════════════════════════════════════════════════`)
    console.log(`✅ DRY-RUN hoàn thành — không có gì được ghi.`)
    const planned = cls.toInsert.length + cls.toUpdateEnOnly.length
    if (planned > 0) {
      console.log(`\n   Nếu commit: ${cls.toInsert.length} inserts + ${cls.toUpdateEnOnly.length} en-updates sẽ được thực hiện.`)
      console.log(`   Chạy lại với --commit để xác nhận.`)
    } else {
      console.log(`\n   ⚠️  Không có row nào cần insert/update.`)
    }
    if (cls.skipProtected.length > 0) {
      console.log(`\n   🔒 ${cls.skipProtected.length} row được bảo vệ — SẼ KHÔNG bị chạm ngay cả khi commit.`)
    }
    return
  }

  // ── Commit ──
  console.log(`\n🚀 Committing...`)
  let totalSuccess = 0, totalFailed = 0
  const allErrors: string[] = []

  if (cls.toInsert.length > 0) {
    console.log(`\n   INSERT ${cls.toInsert.length} rows (is_published=false, review_status=ai_draft)...`)
    const r = await upsertBatch(client, cls.toInsert)
    totalSuccess += r.success; totalFailed += r.failed; allErrors.push(...r.errors)
    console.log(`   ${r.success} OK, ${r.failed} failed`)
  }

  if (cls.toUpdateEnOnly.length > 0) {
    console.log(`\n   UPDATE en-backfill ${cls.toUpdateEnOnly.length} rows (vi untouched)...`)
    const r = await updateEnBatch(client, cls.toUpdateEnOnly)
    totalSuccess += r.success; totalFailed += r.failed; allErrors.push(...r.errors)
    console.log(`   ${r.success} OK, ${r.failed} failed`)
  }

  // Mark converted in staging
  const successSourceIds = [
    ...cls.toInsert.map(r => r.source_id),
    ...cls.toUpdateEnOnly.map(({ row }) => row.source_id),
  ].filter(Boolean) as string[]

  if (successSourceIds.length > 0) {
    console.log(`\n   Marking ${successSourceIds.length} staging entries as converted...`)
    await markConverted(client, successSourceIds)
    console.log(`   Done.`)
  }

  // ── Final report ──
  console.log(`\n════════════════════════════════════════════════`)
  console.log(`✅ Import complete:`)
  console.log(`   Inserted (target):         ${cls.toInsert.length}`)
  console.log(`   En-backfilled (target):    ${cls.toUpdateEnOnly.length}`)
  console.log(`   DB operations success:     ${totalSuccess}`)
  console.log(`   DB operations failed:      ${totalFailed}`)
  console.log(`   Skipped (protected):       ${cls.skipProtected.length}`)
  console.log(`   Skipped (already vi+en):   ${cls.skipHasVi.length}`)
  console.log(`   Staging marked converted:  ${successSourceIds.length}`)

  if (allErrors.length > 0) {
    console.log(`\n⚠️  Errors (first 10):`)
    allErrors.slice(0, 10).forEach(e => console.log(`   ✗ ${e}`))
    if (allErrors.length > 10) console.log(`   ... và ${allErrors.length - 10} lỗi khác`)
  }

  if (totalFailed > 0) {
    console.log(`\n❌ Có ${totalFailed} lỗi — kiểm tra errors ở trên và chạy lại nếu cần.`)
  } else {
    console.log(`\n⏭️  Next steps:`)
    console.log(`   1. Supabase: review japanese_words WHERE review_status='ai_draft'`)
    console.log(`   2. Với entry OK: UPDATE SET review_status='approved', is_published=true`)
    console.log(`   3. Quiz/test chỉ dùng review_status='approved' entries`)
  }
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
