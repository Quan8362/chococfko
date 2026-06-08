#!/usr/bin/env node
/**
 * map-jlpt-level.ts
 *
 * Reads a CSV of (word, reading, jlpt_level) and updates the jlpt_level
 * column in japanese_raw_jmdict. Does NOT touch japanese_words.
 *
 * Dry-run:
 *   npx tsx scripts/map-jlpt-level.ts --file ./data/source/jlpt-vocab-list.csv --dry-run
 *
 * Commit:
 *   npx tsx scripts/map-jlpt-level.ts --file ./data/source/jlpt-vocab-list.csv --commit
 *
 * Run from web/ directory so .env.local is found automatically.
 *
 * Expected CSV columns (header required, order flexible, case-insensitive):
 *   word, reading, jlpt_level   (or: level)
 * Example:
 *   食べる,たべる,N5
 *   飲む,のむ,N5
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve }                   from 'node:path'
import { createClient }              from '@supabase/supabase-js'

// ─── DB INTERFACE ────────────────────────────────────────────
// Minimal typed interface for this script — avoids Supabase generic conflicts.
interface FetchResult { data: Record<string, unknown>[] | null; error: { message: string } | null }
interface VoidResult  { error: { message: string } | null }

interface SelectBuilder { range(from: number, to: number): Promise<FetchResult> }
interface UpdateBuilder  { in(col: string, vals: string[]): Promise<VoidResult>  }
interface DbTable        { select(cols: string): SelectBuilder; update(data: Record<string, unknown>): UpdateBuilder }
interface Db             { from(table: string): DbTable }

// ─── ENV LOADER ──────────────────────────────────────────────
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
interface CliArgs { file: string | null; dryRun: boolean; commit: boolean }

function parseArgs(argv: string[]): CliArgs {
  const a: CliArgs = { file: null, dryRun: false, commit: false }
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i]
    if (f === '--dry-run')        { a.dryRun  = true; continue }
    if (f === '--commit')         { a.commit  = true; continue }
    if (f === '--file')           { a.file    = argv[++i] ?? null; continue }
    if (f.startsWith('--file='))  { a.file    = f.slice(7); continue }
  }
  return a
}

// ─── TYPES ───────────────────────────────────────────────────
const VALID_LEVELS = new Set(['N5', 'N4', 'N3', 'N2', 'N1'])

interface CsvRow     { word: string; reading: string; level: string; lineNo: number }
interface StagingRow { ent_seq: string; word: string; reading: string; jlpt_level: string | null }
interface UpdateItem { ent_seq: string; jlpt_level: string }

interface MatchPlan {
  exactMatches:   UpdateItem[]
  wordMatches:    UpdateItem[]
  ambiguous:      { word: string; reading: string; candidates: number }[]
  notFound:       { word: string; reading: string }[]
  invalidLevel:   { word: string; reading: string; level: string; lineNo: number }[]
}

// ─── CSV PARSER ──────────────────────────────────────────────
// Parses a single CSV field, stripping outer quotes.
function parseField(s: string): string {
  s = s.trim()
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim()
  }
  return s
}

function parseCSV(content: string): CsvRow[] {
  // Strip BOM and normalise line endings
  const lines = content.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

  if (lines.length === 0) throw new Error('CSV file is empty')

  // Detect column indexes from header (case-insensitive)
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const iWord    = headers.findIndex(h => h === 'word')
  const iReading = headers.findIndex(h => h === 'reading')
  const iLevel   = headers.findIndex(h => h === 'jlpt_level' || h === 'level')

  if (iWord    < 0) throw new Error('CSV missing column: word')
  if (iReading < 0) throw new Error('CSV missing column: reading')
  if (iLevel   < 0) throw new Error('CSV missing column: jlpt_level (or level)')

  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line || line.startsWith('#')) continue

    const cols = line.split(',')
    const word    = parseField(cols[iWord]    ?? '')
    const reading = parseField(cols[iReading] ?? '')
    const level   = parseField(cols[iLevel]   ?? '').toUpperCase()

    if (!word || !reading) continue
    rows.push({ word, reading, level, lineNo: i + 1 })
  }
  return rows
}

// ─── FETCH STAGING ROWS (paginated) ──────────────────────────
async function fetchAllStagingRows(db: Db): Promise<StagingRow[]> {
  const PAGE = 1000
  const rows: StagingRow[] = []
  let from = 0

  while (true) {
    const { data, error } = await db
      .from('japanese_raw_jmdict')
      .select('ent_seq,word,reading,jlpt_level')
      .range(from, from + PAGE - 1)

    if (error) throw new Error(`DB fetch error: ${error.message}`)
    if (!data || data.length === 0) break

    for (const r of data) {
      rows.push({
        ent_seq:    String(r['ent_seq']    ?? ''),
        word:       String(r['word']       ?? ''),
        reading:    String(r['reading']    ?? ''),
        jlpt_level: r['jlpt_level'] != null ? String(r['jlpt_level']) : null,
      })
    }

    if (data.length < PAGE) break
    from += PAGE

    if (from % 10000 === 0) process.stdout.write(`\r   Fetched ${from} staging rows...`)
  }
  if (from > 0) process.stdout.write('\n')

  return rows
}

// ─── MATCHING ────────────────────────────────────────────────
function buildMatchPlan(csvRows: CsvRow[], stagingRows: StagingRow[]): MatchPlan {
  // Index 1: exact word+reading → single staging row
  const byWordReading = new Map<string, StagingRow>()
  // Index 2: word → all staging rows with that word
  const byWord = new Map<string, StagingRow[]>()

  for (const r of stagingRows) {
    byWordReading.set(`${r.word}|||${r.reading}`, r)
    const list = byWord.get(r.word) ?? []
    list.push(r)
    byWord.set(r.word, list)
  }

  const plan: MatchPlan = {
    exactMatches:  [],
    wordMatches:   [],
    ambiguous:     [],
    notFound:      [],
    invalidLevel:  [],
  }
  const committed = new Set<string>()  // ent_seq already queued (first-wins)

  for (const csv of csvRows) {
    const level = csv.level.toUpperCase()

    if (!VALID_LEVELS.has(level)) {
      plan.invalidLevel.push({ word: csv.word, reading: csv.reading, level: csv.level, lineNo: csv.lineNo })
      continue
    }

    // ── Priority 1: exact word + reading ───────────────────
    const exact = byWordReading.get(`${csv.word}|||${csv.reading}`)
    if (exact) {
      if (!committed.has(exact.ent_seq)) {
        committed.add(exact.ent_seq)
        plan.exactMatches.push({ ent_seq: exact.ent_seq, jlpt_level: level })
      }
      continue
    }

    // ── Priority 2: word only ──────────────────────────────
    const wordRows     = byWord.get(csv.word) ?? []
    const uniqueSeqs   = Array.from(new Set(wordRows.map(r => r.ent_seq)))

    if (uniqueSeqs.length === 0) {
      plan.notFound.push({ word: csv.word, reading: csv.reading })
    } else if (uniqueSeqs.length === 1) {
      const seq = uniqueSeqs[0]
      if (!committed.has(seq)) {
        committed.add(seq)
        plan.wordMatches.push({ ent_seq: seq, jlpt_level: level })
      }
    } else {
      plan.ambiguous.push({ word: csv.word, reading: csv.reading, candidates: uniqueSeqs.length })
    }
  }

  return plan
}

// ─── BATCH UPDATE ────────────────────────────────────────────
const UPDATE_CHUNK = 500

async function applyUpdates(
  db: Db,
  updates: UpdateItem[],
): Promise<{ updated: number; failed: number; errors: string[] }> {
  if (updates.length === 0) return { updated: 0, failed: 0, errors: [] }

  // Group by jlpt_level for efficient batch updates
  const byLevel: Record<string, string[]> = {}
  for (const u of updates) {
    byLevel[u.jlpt_level] ??= []
    byLevel[u.jlpt_level].push(u.ent_seq)
  }

  let updated = 0
  let failed  = 0
  const errors: string[] = []
  const table  = db.from('japanese_raw_jmdict')

  for (const [level, entSeqs] of Object.entries(byLevel)) {
    // Chunk to stay within Supabase .in() limits
    for (let i = 0; i < entSeqs.length; i += UPDATE_CHUNK) {
      const chunk = entSeqs.slice(i, i + UPDATE_CHUNK)
      const { error } = await table
        .update({ jlpt_level: level })
        .in('ent_seq', chunk)

      if (error) {
        failed  += chunk.length
        errors.push(`Level ${level}, chunk ${Math.floor(i / UPDATE_CHUNK) + 1}: ${error.message}`)
      } else {
        updated += chunk.length
      }
    }
  }

  return { updated, failed, errors }
}

// ─── MAIN ─────────────────────────────────────────────────────
async function main(): Promise<void> {
  loadEnvLocal()
  const args = parseArgs(process.argv.slice(2))

  if (!args.dryRun && !args.commit) {
    console.warn('⚠️  Neither --dry-run nor --commit specified. Defaulting to --dry-run.')
    args.dryRun = true
  }

  if (!args.file) {
    console.error('❌ --file <path/to/jlpt-vocab-list.csv> is required')
    console.error('   Example: npx tsx scripts/map-jlpt-level.ts --file ./data/source/jlpt-vocab-list.csv --dry-run')
    process.exit(1)
  }

  const filePath = resolve(process.cwd(), args.file)
  if (!existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`)
    console.error('   Place your JLPT vocab list CSV at web/data/source/jlpt-vocab-list.csv')
    console.error('   See README or Phase 4 docs for recommended sources.')
    process.exit(1)
  }

  // ── Parse CSV ──
  console.log(`📂 Reading: ${filePath}`)
  let csvRows: CsvRow[]
  try {
    csvRows = parseCSV(readFileSync(filePath, 'utf-8'))
  } catch (err) {
    console.error(`❌ CSV parse error: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }
  console.log(`   CSV rows loaded: ${csvRows.length}`)

  // ── Validate levels distribution ──
  const levelCounts: Record<string, number> = {}
  for (const r of csvRows) {
    const l = r.level.toUpperCase()
    levelCounts[l] = (levelCounts[l] ?? 0) + 1
  }
  console.log(`   Level distribution in CSV:`)
  for (const lvl of ['N5', 'N4', 'N3', 'N2', 'N1']) {
    if (levelCounts[lvl]) console.log(`     ${lvl}: ${levelCounts[lvl]}`)
  }
  const unknownLevels = Object.keys(levelCounts).filter(l => !VALID_LEVELS.has(l))
  if (unknownLevels.length > 0) {
    console.warn(`   ⚠️  Unknown levels in CSV (will be skipped): ${unknownLevels.join(', ')}`)
  }

  if (args.dryRun) {
    // In dry-run, we still need staging rows to report match stats
    // Check env before trying to connect
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      console.log(`\n✅ DRY-RUN (offline) — env vars not set, skipping match simulation.`)
      console.log(`   CSV is valid. ${csvRows.length} rows parsed successfully.`)
      console.log(`   Re-run with env vars set to simulate DB matching.`)
      return
    }

    const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) as unknown as Db

    console.log(`\n🔍 Fetching staging rows for match simulation...`)
    const stagingRows = await fetchAllStagingRows(db)
    console.log(`   Staging rows: ${stagingRows.length}`)

    if (stagingRows.length === 0) {
      console.warn('   ⚠️  japanese_raw_jmdict is empty — run import-jmdict-raw.ts first.')
      return
    }

    const plan = buildMatchPlan(csvRows, stagingRows)
    printMatchReport(plan)
    console.log(`\n✅ DRY-RUN complete — no data written.`)
    console.log(`   Run with --commit to apply these updates.`)
    return
  }

  // ── Commit ──
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('\n❌ Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) as unknown as Db

  console.log(`\n🔍 Fetching all staging rows...`)
  const stagingRows = await fetchAllStagingRows(db)
  console.log(`   Staging rows: ${stagingRows.length}`)

  if (stagingRows.length === 0) {
    console.warn('   ⚠️  japanese_raw_jmdict is empty — run import-jmdict-raw.ts first.')
    process.exit(1)
  }

  const plan = buildMatchPlan(csvRows, stagingRows)
  printMatchReport(plan)

  const allUpdates = [...plan.exactMatches, ...plan.wordMatches]
  if (allUpdates.length === 0) {
    console.log('\n⚠️  No matches found. Nothing to update.')
    return
  }

  console.log(`\n🚀 Applying ${allUpdates.length} JLPT level updates...`)
  const result = await applyUpdates(db, allUpdates)

  console.log(`\n✅ Done:`)
  console.log(`   Updated: ${result.updated} entries in japanese_raw_jmdict`)
  console.log(`   Failed:  ${result.failed}`)
  if (result.errors.length > 0) {
    console.log(`   Errors:`)
    result.errors.forEach(e => console.log(`     ✗ ${e}`))
  }
  console.log(`\n⏭️  Next: run batch-translate-vi.ts (Phase F) to generate meaning_vi drafts.`)
}

function printMatchReport(plan: MatchPlan): void {
  const totalMatched = plan.exactMatches.length + plan.wordMatches.length
  console.log(`\n📊 Match report:`)
  console.log(`   Exact match (word+reading): ${plan.exactMatches.length}`)
  console.log(`   Word-only match:            ${plan.wordMatches.length}`)
  console.log(`   Ambiguous (skipped):        ${plan.ambiguous.length}`)
  console.log(`   Not found in staging:       ${plan.notFound.length}`)
  console.log(`   Invalid level (skipped):    ${plan.invalidLevel.length}`)
  console.log(`   ─────────────────────────────────`)
  console.log(`   Total to update:            ${totalMatched}`)

  if (plan.ambiguous.length > 0) {
    console.log(`\n   ⚠️  Ambiguous entries (first 5):`)
    plan.ambiguous.slice(0, 5).forEach(a =>
      console.log(`     "${a.word}" — ${a.candidates} candidates in staging`)
    )
  }
  if (plan.invalidLevel.length > 0) {
    console.log(`\n   ⚠️  Invalid levels (first 5):`)
    plan.invalidLevel.slice(0, 5).forEach(r =>
      console.log(`     Line ${r.lineNo}: "${r.word}" level="${r.level}"`)
    )
  }

  // Per-level breakdown of what will be updated
  const byLevel: Record<string, number> = {}
  for (const u of [...plan.exactMatches, ...plan.wordMatches]) {
    byLevel[u.jlpt_level] = (byLevel[u.jlpt_level] ?? 0) + 1
  }
  if (Object.keys(byLevel).length > 0) {
    console.log(`\n   Updates by level:`)
    for (const lvl of ['N5', 'N4', 'N3', 'N2', 'N1']) {
      if (byLevel[lvl]) console.log(`     ${lvl}: ${byLevel[lvl]}`)
    }
  }
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
