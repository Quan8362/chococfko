#!/usr/bin/env node
/**
 * export-jmdict-en-to-vi-batch.ts
 *
 * Exports a batch of JMdict entries (with meaning_en) as a draft CSV
 * where meaning_vi is left blank for AI translation.
 *
 * Does NOT write to japanese_words or modify any DB data.
 *
 * Dry-run (no file written):
 *   npx tsx scripts/export-jmdict-en-to-vi-batch.ts \
 *     --level N5 --limit 50 --output ./data/japanese/jmdict-n5-vi-draft-001.csv --dry-run
 *
 * Export CSV:
 *   npx tsx scripts/export-jmdict-en-to-vi-batch.ts \
 *     --level N5 --limit 50 --output ./data/japanese/jmdict-n5-vi-draft-001.csv
 *
 * After export:
 *   1. Open the CSV in any editor / spreadsheet
 *   2. Fill in the meaning_vi column — use the same ' | ' separator as meaning_en
 *      Example: meaning_en = "to eat | to have a meal"
 *               meaning_vi = "ăn | dùng bữa"
 *   3. Change review_status from "ai_draft" to "needs_review" when done
 *   4. Admin reviews and approves
 *   5. Use safe-upsert-words.ts (Phase G) to import reviewed CSV into japanese_words
 *
 * Multi-meaning separator: ' | '  (space-pipe-space)
 * ImportClient's splitPipe() already handles this separator on import.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createClient } from '@supabase/supabase-js'

// ─── DB INTERFACE ────────────────────────────────────────────
// PromiseLike<FetchResult> enables `await` on filter chains.
interface FetchResult { data: Record<string, unknown>[] | null; error: { message: string } | null }

interface QB extends PromiseLike<FetchResult> {
  eq(col: string, val: string): QB
  in(col: string, vals: string[]): QB
  range(from: number, to: number): QB
  limit(n: number): QB
}
interface Db { from(table: string): { select(cols: string): QB } }

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
interface CliArgs {
  level: string | null
  limit: number
  output: string | null
  dryRun: boolean
  maxMeanings: number  // skip entries with more glosses than this
}

function parseArgs(argv: string[]): CliArgs {
  const a: CliArgs = { level: null, limit: 50, output: null, dryRun: false, maxMeanings: 8 }
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i]
    if (f === '--dry-run')                { a.dryRun      = true; continue }
    if (f === '--level')                  { a.level       = argv[++i] ?? null; continue }
    if (f === '--limit')                  { a.limit       = parseInt(argv[++i] ?? '50', 10) || 50; continue }
    if (f === '--output')                 { a.output      = argv[++i] ?? null; continue }
    if (f === '--max-meanings')           { a.maxMeanings = parseInt(argv[++i] ?? '8', 10) || 8; continue }
    if (f.startsWith('--level='))         { a.level       = f.slice(8); continue }
    if (f.startsWith('--limit='))         { a.limit       = parseInt(f.slice(8), 10) || 50; continue }
    if (f.startsWith('--output='))        { a.output      = f.slice(9); continue }
    if (f.startsWith('--max-meanings='))  { a.maxMeanings = parseInt(f.slice(15), 10) || 8; continue }
  }
  return a
}

// ─── TYPES ───────────────────────────────────────────────────
const VALID_LEVELS = new Set(['N5', 'N4', 'N3', 'N2', 'N1'])
const MEANING_SEP  = ' | '
const LICENSE_NOTE = 'CC BY-SA 3.0 — verify at edrdg.org before production use'

interface StagingEntry {
  ent_seq:    string
  word:       string
  reading:    string
  romaji:     string | null
  pos:        string[] | null
  meaning_en: string[]
  jlpt_level: string | null
}

interface ExistingWord {
  word:           string
  reading:        string | null
  source:         string | null
  has_vi_meaning: boolean
  license:        string | null
}

// ─── CSV ─────────────────────────────────────────────────────
const CSV_HEADER =
  'word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,' +
  'source,source_id,license,attribution,' +
  'example_jp,example_reading,example_vi,example_en,' +
  'review_status,meaning_source'

// Quote a CSV field — always quote to be safe with Japanese and pipe chars.
function q(v: string): string {
  const s = String(v ?? '')
  return `"${s.replace(/"/g, '""')}"`
}

function toCsvLine(e: StagingEntry): string {
  const meanings = e.meaning_en.length > 0 ? e.meaning_en.join(MEANING_SEP) : ''
  const pos      = e.pos?.join('|') ?? ''
  return [
    q(e.word),
    q(e.reading),
    q(e.romaji ?? ''),
    q(e.jlpt_level ?? ''),
    q(pos),
    q('TODO_VI'),                // meaning_vi — to be filled by AI translator
    q(meanings),                 // meaning_en — from JMdict
    q(''),                       // tags
    q('0'),                      // frequency
    q('jmdict'),                 // source
    q(e.ent_seq),                // source_id = ent_seq
    q(LICENSE_NOTE),             // license
    q('JMdict/EDRDG'),           // attribution
    q(''), q(''), q(''), q(''),  // example_jp, example_reading, example_vi, example_en
    q('ai_draft'),               // review_status
    q('jmdict_ai'),              // meaning_source
  ].join(',')
}

// ─── DB QUERIES ──────────────────────────────────────────────

async function fetchStagingEntries(
  db: Db, level: string, fetchLimit: number,
): Promise<StagingEntry[]> {
  const result = await db
    .from('japanese_raw_jmdict')
    .select('ent_seq,word,reading,romaji,pos,meaning_en,jlpt_level')
    .eq('converted_status', 'pending')
    .eq('jlpt_level', level)
    .limit(fetchLimit)

  if (result.error) throw new Error(`Staging fetch error: ${result.error.message}`)

  return (result.data ?? []).map(r => ({
    ent_seq:    String(r['ent_seq']    ?? ''),
    word:       String(r['word']       ?? ''),
    reading:    String(r['reading']    ?? ''),
    romaji:     r['romaji'] != null ? String(r['romaji']) : null,
    pos:        Array.isArray(r['pos']) ? (r['pos'] as string[]) : null,
    meaning_en: Array.isArray(r['meaning_en']) ? (r['meaning_en'] as string[]) : [],
    jlpt_level: r['jlpt_level'] != null ? String(r['jlpt_level']) : null,
  }))
}

// Fetch existing japanese_words rows for the given word list (protection check).
async function fetchExistingWords(db: Db, words: string[]): Promise<Map<string, ExistingWord>> {
  const map = new Map<string, ExistingWord>()
  if (words.length === 0) return map

  const PAGE = 80
  for (let i = 0; i < words.length; i += PAGE) {
    const chunk = words.slice(i, i + PAGE)
    const result = await db
      .from('japanese_words')
      .select('word,reading,source,has_vi_meaning,license')
      .in('word', chunk)

    if (result.error) throw new Error(`Words fetch error: ${result.error.message}`)

    for (const r of (result.data ?? [])) {
      const key = `${r['word']}|||${r['reading'] ?? ''}`
      map.set(key, {
        word:           String(r['word']  ?? ''),
        reading:        r['reading'] != null ? String(r['reading']) : null,
        source:         r['source']  != null ? String(r['source'])  : null,
        has_vi_meaning: Boolean(r['has_vi_meaning']),
        license:        r['license'] != null ? String(r['license']) : null,
      })
    }
  }
  return map
}

function isManualProtected(w: ExistingWord): boolean {
  return w.source === 'self' || w.license === 'self-authored'
}

// ─── MAIN ─────────────────────────────────────────────────────
async function main(): Promise<void> {
  loadEnvLocal()
  const args = parseArgs(process.argv.slice(2))

  // ── Validate args ──
  if (!args.level || !VALID_LEVELS.has(args.level.toUpperCase())) {
    console.error('❌ --level <N5|N4|N3|N2|N1> is required')
    process.exit(1)
  }
  args.level = args.level.toUpperCase()

  if (!args.output) {
    console.error('❌ --output <path/to/draft.csv> is required')
    console.error(`   Example: --output ./data/japanese/jmdict-${args.level.toLowerCase()}-vi-draft-001.csv`)
    process.exit(1)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('❌ Missing env vars: NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const db = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as Db

  // ── Fetch staging ──
  // Fetch extra to have headroom after filtering
  const fetchLimit = Math.min(args.limit * 5, 1000)
  console.log(`🔍 Fetching up to ${fetchLimit} ${args.level} pending entries from staging...`)
  const raw = await fetchStagingEntries(db, args.level, fetchLimit)
  console.log(`   Staging entries fetched: ${raw.length}`)

  if (raw.length === 0) {
    console.warn(`\n⚠️  No pending ${args.level} entries in japanese_raw_jmdict.`)
    console.warn('   Run import-jmdict-raw.ts and map-jlpt-level.ts first.')
    process.exit(0)
  }

  // ── Fetch protection data from japanese_words ──
  const uniqueWords = Array.from(new Set(raw.map(e => e.word)))
  console.log(`🔍 Checking ${uniqueWords.length} words in japanese_words...`)
  const existingMap = await fetchExistingWords(db, uniqueWords)
  console.log(`   Matching rows found in japanese_words: ${existingMap.size}`)

  // ── Filter and categorise ──
  const exported:              StagingEntry[] = []
  const skippedManualProtected: StagingEntry[] = []
  const skippedHasVi:           StagingEntry[] = []
  const skippedEmptyMeaning:    StagingEntry[] = []
  const skippedTooManyMeanings: StagingEntry[] = []

  for (const entry of raw) {
    if (exported.length >= args.limit) break

    // Skip empty meaning_en
    if (entry.meaning_en.length === 0) {
      skippedEmptyMeaning.push(entry); continue
    }

    // Skip overly complex entries (pilot mode)
    if (entry.meaning_en.length > args.maxMeanings) {
      skippedTooManyMeanings.push(entry); continue
    }

    // Protection check against japanese_words
    const key      = `${entry.word}|||${entry.reading}`
    const existing = existingMap.get(key)

    if (existing) {
      if (isManualProtected(existing)) {
        skippedManualProtected.push(entry); continue
      }
      if (existing.has_vi_meaning) {
        skippedHasVi.push(entry); continue
      }
    }

    exported.push(entry)
  }

  // ── Stats ──
  console.log(`\n📊 Selection results:`)
  console.log(`   Exported (to CSV):          ${exported.length}`)
  console.log(`   Skipped — manual protected: ${skippedManualProtected.length}  (source=self / self-authored)`)
  console.log(`   Skipped — already has vi:   ${skippedHasVi.length}            (has_vi_meaning=true)`)
  console.log(`   Skipped — empty meaning_en: ${skippedEmptyMeaning.length}`)
  console.log(`   Skipped — too many meanings: ${skippedTooManyMeanings.length} (>${args.maxMeanings}, use --max-meanings to adjust)`)
  console.log(`   ─────────────────────────────────────────────────`)
  console.log(`   Total fetched:              ${raw.length}`)

  if (exported.length === 0) {
    console.warn('\n⚠️  No entries to export after filtering.')
    if (skippedManualProtected.length > 0) console.warn('   All entries are protected by existing manual data.')
    process.exit(0)
  }

  // ── Sample preview (first 5) ──
  console.log(`\n🧪 Sample (first 5 exported entries):`)
  for (const e of exported.slice(0, 5)) {
    const enPreview = e.meaning_en.slice(0, 2).join(' | ')
    const enMore    = e.meaning_en.length > 2 ? ` | (+${e.meaning_en.length - 2} more)` : ''
    console.log(`   ${e.word} [${e.reading}] — ${enPreview}${enMore}`)
  }

  if (args.dryRun) {
    console.log(`\n✅ DRY-RUN complete — no file written.`)
    console.log(`   Remove --dry-run to export ${exported.length} entries to: ${args.output}`)
    return
  }

  // ── Write CSV ──
  const outPath = resolve(process.cwd(), args.output)
  mkdirSync(dirname(outPath), { recursive: true })

  const csvLines = [
    CSV_HEADER,
    ...exported.map(toCsvLine),
  ]
  writeFileSync(outPath, csvLines.join('\n'), 'utf-8')

  console.log(`\n✅ CSV written: ${outPath}`)
  console.log(`   Rows: ${exported.length} (+ 1 header)`)
  console.log(`   meaning_vi: all "TODO_VI" — fill in before import`)
  console.log(`   Separator:  " | " (space-pipe-space) for multi-meaning`)
  console.log(`\n📋 AI translation instructions:`)
  console.log(`   • Fill the meaning_vi column for each row`)
  console.log(`   • Use " | " as separator to match meaning_en parts`)
  console.log(`   • Example: meaning_en = "to eat | to have a meal"`)
  console.log(`              meaning_vi = "ăn | dùng bữa"`)
  console.log(`   • Do NOT change: word, reading, source_id, source columns`)
  console.log(`   • When done: set review_status = "needs_review"`)
  console.log(`\n⏭️  Next steps:`)
  console.log(`   1. Fill meaning_vi (AI-assisted or manual)`)
  console.log(`   2. Admin review → set review_status = "approved"`)
  console.log(`   3. Import via safe-upsert-words.ts (Phase G)`)
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
