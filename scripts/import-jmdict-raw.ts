#!/usr/bin/env node
/**
 * import-jmdict-raw.ts
 *
 * Parses a local JMdict XML file and inserts entries into the
 * japanese_raw_jmdict staging table. Does NOT touch japanese_words.
 *
 * Prerequisites:
 *   npm install -D tsx                    (one-time, or use: npx tsx ...)
 *   migration_japanese_phase_d_jmdict_staging.sql must be run in Supabase
 *
 * Dry-run (no DB write):
 *   npx tsx scripts/import-jmdict-raw.ts --file ./data/source/JMdict_e.xml --limit 100 --dry-run
 *
 * Commit (writes to DB):
 *   npx tsx scripts/import-jmdict-raw.ts --file ./data/source/JMdict_e.xml --limit 500 --commit
 *   npx tsx scripts/import-jmdict-raw.ts --file ./data/source/JMdict_e.xml --commit --skip-existing
 *
 * Run from the web/ directory so .env.local is found automatically.
 *
 * ⚠️  License notice:
 *   JMdict is distributed under the Creative Commons Attribution-ShareAlike
 *   Licence (CC BY-SA 3.0). Verify current terms at:
 *   https://www.edrdg.org/edrdg/licence.html
 *   The license field in staging is a placeholder — confirm before production use.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

// Minimal Supabase interface for this script — avoids generic type conflicts
// when the project database schema is not explicitly typed.
interface UpsertResult { error: { message: string } | null }
interface UpsertTable  { upsert(rows: Record<string, unknown>[], opts: { onConflict: string; ignoreDuplicates: boolean }): PromiseLike<UpsertResult> }
interface ScriptClient { from(table: string): UpsertTable }

// ─── ENV LOADER ──────────────────────────────────────────────
// Reads .env.local without requiring dotenv package.
function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    const key = m[1].trim()
    const val = m[2].trim().replace(/^['"]|['"]$/g, '')
    if (!process.env[key]) process.env[key] = val
  }
}

// ─── CLI ARGS ─────────────────────────────────────────────────
interface CliArgs {
  file: string | null
  limit: number | null
  dryRun: boolean
  commit: boolean
  level: string | null      // accepted but no-op: JLPT level mapping is Phase E
  skipExisting: boolean     // if true: skip rows where (ent_seq,word,reading) already exists
}

function parseArgs(argv: string[]): CliArgs {
  const a: CliArgs = { file: null, limit: null, dryRun: false, commit: false, level: null, skipExisting: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (flag === '--dry-run')      { a.dryRun = true; continue }
    if (flag === '--commit')       { a.commit = true; continue }
    if (flag === '--skip-existing'){ a.skipExisting = true; continue }
    if (flag === '--file')         { a.file  = argv[++i] ?? null; continue }
    if (flag === '--limit')        { a.limit = parseInt(argv[++i] ?? '0', 10) || null; continue }
    if (flag === '--level')        { a.level = argv[++i] ?? null; continue }
    if (flag.startsWith('--file='))  { a.file  = flag.slice(7); continue }
    if (flag.startsWith('--limit=')) { a.limit = parseInt(flag.slice(8), 10) || null; continue }
    if (flag.startsWith('--level=')) { a.level = flag.slice(8); continue }
  }
  return a
}

// ─── TYPES ───────────────────────────────────────────────────
interface SenseData {
  pos: string[]    // JMdict POS codes, e.g. ['v1', 'n']
  gloss: string[]  // English glosses
}

interface RawJson {
  words:    string[]     // all k_ele/keb (kanji headwords)
  readings: string[]     // all r_ele/reb (kana readings)
  senses:   SenseData[]  // per-sense data for Phase F translation
}

interface ParsedEntry {
  ent_seq:    string
  word:       string      // primary kanji or kana if no kanji
  reading:    string      // primary kana reading
  pos:        string[]    // deduplicated POS codes from all senses
  meaning_en: string[]    // all English glosses from all senses
  raw_json:   RawJson
}

// ─── XML HELPERS ─────────────────────────────────────────────

// Extract text content of first occurrence of <tag>...</tag>
function extractFirst(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`))
  return m ? m[1].trim() : null
}

// Strip JMdict XML entity reference:  &v1;  →  v1
function entityName(s: string): string {
  return s.replace(/^&/, '').replace(/;$/, '')
}

// matchAll spread requires ES2015+ target; use Array.from() for tsconfig compatibility.
function matchAll(str: string, re: RegExp): RegExpExecArray[] {
  return Array.from(str.matchAll(re))
}

// Parse all <sense> blocks from an entry's inner XML.
// Handles: <pos>&v1;</pos> entity references, <gloss> with and without xml:lang attr.
function parseSenses(entryInner: string): SenseData[] {
  const blocks = matchAll(entryInner, /<sense>([\s\S]*?)<\/sense>/g)
  return blocks.map(m => {
    const s = m[1]
    const pos   = matchAll(s, /<pos>([^<]+)<\/pos>/g)
                    .map(p => entityName(p[1].trim())).filter(Boolean)
    // Accept glosses with no lang attr OR explicitly xml:lang="eng"
    const gloss = matchAll(s, /<gloss([^>]*)>([^<]+)<\/gloss>/g)
                    .filter(g => !g[1].includes('xml:lang') || g[1].includes('eng'))
                    .map(g => g[2].trim()).filter(Boolean)
    return { pos, gloss }
  }).filter(s => s.gloss.length > 0)
}

// Parse a single JMdict <entry> inner XML (content between <entry> tags).
function parseEntry(entryInner: string): ParsedEntry | null {
  const ent_seq = extractFirst(entryInner, 'ent_seq')
  if (!ent_seq) return null

  const allKeb = matchAll(entryInner, /<keb>([^<]+)<\/keb>/g).map(m => m[1].trim())
  const allReb = matchAll(entryInner, /<reb>([^<]+)<\/reb>/g).map(m => m[1].trim())

  // word: first kanji headword; fallback to first kana reading
  const word    = allKeb[0] ?? allReb[0] ?? null
  const reading = allReb[0] ?? null

  if (!word || !reading) return null

  const senses     = parseSenses(entryInner)
  const meaning_en = senses.flatMap(s => s.gloss)
  if (meaning_en.length === 0) return null

  // Deduplicate POS across all senses
  const pos = Array.from(new Set(senses.flatMap(s => s.pos)))

  return {
    ent_seq,
    word,
    reading,
    pos,
    meaning_en,
    raw_json: {
      words:    allKeb.length > 0 ? allKeb : allReb,
      readings: allReb,
      senses,   // kept for Phase F (meaning_vi translation)
    },
  }
}

// Parse entire JMdict XML string, returning valid entries up to `limit`.
function parseJMdict(content: string, limit: number | null): { entries: ParsedEntry[]; skipped: number } {
  const entryMatches = matchAll(content, /<entry>([\s\S]*?)<\/entry>/g)
  const entries: ParsedEntry[] = []
  let skipped = 0

  for (const m of entryMatches) {
    const entry = parseEntry(m[1])
    if (!entry) { skipped++; continue }
    entries.push(entry)
    if (limit !== null && entries.length >= limit) break
  }

  return { entries, skipped }
}

// ─── DB INSERT ────────────────────────────────────────────────

const LICENSE_PLACEHOLDER =
  'CC BY-SA 3.0 — UNVERIFIED PLACEHOLDER. Confirm at https://www.edrdg.org/edrdg/licence.html before production use.'

const CHUNK_SIZE = 200

async function upsertChunked(
  client: ScriptClient,
  entries: ParsedEntry[],
  skipExisting: boolean,
): Promise<{ inserted: number; failed: number; errors: string[] }> {
  let inserted = 0
  let failed   = 0
  const errors: string[] = []
  const table  = client.from('japanese_raw_jmdict')

  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const chunk = entries.slice(i, i + CHUNK_SIZE)
    const rows: Record<string, unknown>[] = chunk.map(e => ({
      ent_seq:          e.ent_seq,
      word:             e.word,
      reading:          e.reading,
      pos:              e.pos.length > 0 ? e.pos : null,
      meaning_en:       e.meaning_en,
      raw_json:         e.raw_json as unknown as Record<string, unknown>,
      source:           'jmdict',
      license:          LICENSE_PLACEHOLDER,
      attribution:      'JMdict/EDRDG',
      jlpt_level:       null,          // assigned by map-jlpt-level.ts (Phase E)
      converted_status: 'pending',
    }))

    const { error } = await table.upsert(rows, {
      onConflict:       'ent_seq,word,reading',
      ignoreDuplicates: skipExisting,
    })

    if (error) {
      // Row-by-row fallback for chunk errors
      for (let j = 0; j < chunk.length; j++) {
        const { error: rowErr } = await table.upsert([rows[j]], {
          onConflict: 'ent_seq,word,reading', ignoreDuplicates: skipExisting,
        })
        if (rowErr) {
          failed++
          errors.push(`ent_seq=${chunk[j].ent_seq} (${chunk[j].word}): ${rowErr.message}`)
        } else {
          inserted++
        }
      }
    } else {
      inserted += chunk.length
    }

    // Progress indicator every 1,000 rows
    if ((i + CHUNK_SIZE) % 1000 === 0 || i + CHUNK_SIZE >= entries.length) {
      process.stdout.write(`\r   Progress: ${Math.min(i + CHUNK_SIZE, entries.length)}/${entries.length}`)
    }
  }
  process.stdout.write('\n')

  return { inserted, failed, errors }
}

// ─── MAIN ─────────────────────────────────────────────────────
async function main(): Promise<void> {
  loadEnvLocal()
  const args = parseArgs(process.argv.slice(2))

  // Safety default: if neither flag, use dry-run
  if (!args.dryRun && !args.commit) {
    console.warn('⚠️  Neither --dry-run nor --commit specified. Defaulting to --dry-run.')
    args.dryRun = true
  }

  if (!args.file) {
    console.error('❌ --file <path/to/JMdict_e.xml> is required')
    console.error('   Example: npx tsx scripts/import-jmdict-raw.ts --file ./data/source/JMdict_e.xml --dry-run')
    process.exit(1)
  }

  const filePath = resolve(process.cwd(), args.file)
  if (!existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`)
    console.error('   Download JMdict_e.xml from: https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project')
    console.error('   Place it at: web/data/source/JMdict_e.xml')
    process.exit(1)
  }

  if (args.level) {
    console.warn(`⚠️  --level ${args.level} has no effect in this script.`)
    console.warn('   JLPT levels are set by map-jlpt-level.ts (Phase E).')
    console.warn('   All entries will be inserted with jlpt_level=null.\n')
  }

  // ── Parse ──
  console.log(`📂 Reading: ${filePath}`)
  const content = readFileSync(filePath, 'utf-8')
  const sizeMB  = (content.length / 1024 / 1024).toFixed(1)
  console.log(`   Size: ${sizeMB} MB`)

  console.log(`🔍 Parsing JMdict entries${args.limit ? ` (limit: ${args.limit})` : ' (all)'}...`)
  const { entries, skipped } = parseJMdict(content, args.limit)

  console.log(`\n📊 Parse results:`)
  console.log(`   Valid entries:   ${entries.length}`)
  console.log(`   Skipped invalid: ${skipped}`)
  if (args.limit) console.log(`   Limit applied:   ${args.limit}`)
  console.log(`   jlpt_level:      null (Phase E assigns levels)`)
  console.log(`   converted_status: pending`)

  // ── Sample output (always shown) ──
  console.log(`\n🧪 Sample (first 3 valid entries):`)
  for (const e of entries.slice(0, 3)) {
    console.log(`   ─────────────────────────────────────`)
    console.log(`   ent_seq:    ${e.ent_seq}`)
    console.log(`   word:       ${e.word}`)
    console.log(`   reading:    ${e.reading}`)
    console.log(`   pos:        [${e.pos.join(', ')}]`)
    const preview = e.meaning_en.slice(0, 3).join(' | ')
    const more    = e.meaning_en.length > 3 ? ` (+${e.meaning_en.length - 3} more)` : ''
    console.log(`   meaning_en: ${preview}${more}`)
    console.log(`   senses:     ${e.raw_json.senses.length} sense(s)`)
  }

  if (args.dryRun) {
    console.log(`\n✅ DRY-RUN complete — no data written.`)
    console.log(`   To write to DB, run again with --commit instead of --dry-run.`)
    return
  }

  // ── Commit ──
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceKey) {
    console.error('\n❌ Missing required env vars:')
    if (!supabaseUrl) console.error('   NEXT_PUBLIC_SUPABASE_URL is not set')
    if (!serviceKey)  console.error('   SUPABASE_SERVICE_ROLE_KEY is not set')
    console.error('   Ensure .env.local exists in web/ directory.')
    process.exit(1)
  }

  const client: ScriptClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as ScriptClient

  console.log(`\n🚀 Inserting ${entries.length} entries into japanese_raw_jmdict...`)
  console.log(`   skip-existing: ${args.skipExisting} (${args.skipExisting ? 'skip duplicates' : 'update duplicates'})`)

  const result = await upsertChunked(client, entries, args.skipExisting)

  console.log(`\n✅ Insert complete:`)
  console.log(`   Inserted/updated: ${result.inserted}`)
  console.log(`   Failed:           ${result.failed}`)
  if (result.errors.length > 0) {
    console.log(`\n   Errors (first 10):`)
    result.errors.slice(0, 10).forEach(e => console.log(`     ✗ ${e}`))
    if (result.errors.length > 10) {
      console.log(`     ... and ${result.errors.length - 10} more`)
    }
  }
  console.log(`\n⏭️  Next step: run map-jlpt-level.ts to assign jlpt_level to imported entries.`)
}

main().catch(err => {
  console.error('\n❌ Fatal error:', err instanceof Error ? err.message : err)
  process.exit(1)
})
