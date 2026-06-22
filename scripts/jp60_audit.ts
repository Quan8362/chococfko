// Production question-pool audit for the 60-Second Challenge.
// READ-ONLY: never writes to the DB. Reuses the REAL learner-facing cleaners
// (formatGloss/primarySense/hasRawMarkers) and the REAL question signature so
// the statistics reflect what players actually see.
//
//   Run:  node scripts/jp60_audit.ts            (all levels)
//         node scripts/jp60_audit.ts N3          (single level)
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { formatGloss, primarySense, hasRawMarkers, isPresentableText } from '../lib/japanese/gloss.ts'
import { questionSignature } from '../lib/games/jp60/presentation.ts'

// ── truncation detector ──────────────────────────────────────────────────────
// A recognized metadata prefix (bracket / colon|pipe / spaced dash). Anything
// removed beyond this is potential corruption of a real word.
const CODES = 'vi|vn|en|gb|ja|jp|ko|zh'
const PREFIX_RES = [
  new RegExp(`^\\[(?:${CODES})\\]\\s*`, 'i'),
  new RegExp(`^(?:${CODES})\\s*[:：|｜]\\s*`, 'i'),
  new RegExp(`^(?:${CODES})\\s+[-–—]\\s+`, 'i'),
]
function recognizedPrefix(s: string): string {
  for (const re of PREFIX_RES) { const m = s.match(re); if (m) return m[0] }
  return ''
}
const normWs = (s: string) => s.replace(/\s+/g, ' ').trim()
// Flags when sanitization dropped leading characters that are NOT a recognized
// metadata token (the việc→ệc class of bug). Ignores rows with brackets/markers
// (legitimately reshaped) and rows with a recognized prefix.
function isTruncated(raw: string): boolean {
  if (!raw) return false
  if (hasRawMarkers(raw)) return false // bracket/marker rows are legitimately reshaped
  if (recognizedPrefix(raw)) return false // recognized metadata removal is expected
  const cleaned = formatGloss(raw)
  if (!cleaned) return false
  const rawFirst = normWs(raw).split(/[;,]/)[0].trim()
  const cleanFirst = normWs(cleaned).split(/[;,]/)[0].trim()
  if (!cleanFirst) return false
  // Leading-character loss signature: the cleaned first sense is a strict SUFFIX
  // of the raw first sense (i.e. characters were chopped from the front).
  return rawFirst !== cleanFirst && rawFirst.endsWith(cleanFirst) && !rawFirst.startsWith(cleanFirst)
}

const here = dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  const txt = readFileSync(join(here, '..', '.env.local'), 'utf8')
  const env: Record<string, string> = {}
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  return env
}

const env = loadEnv()
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const LEVELS = (process.argv[2] ? [process.argv[2].toUpperCase()] : ['N5', 'N4', 'N3', 'N2', 'N1'])
const LETTERS = ['A', 'B', 'C', 'D']

function pickMeaningVi(m: { vi?: string; en?: string }[] | null): string {
  if (!Array.isArray(m) || !m.length) return ''
  return m[0]?.vi || m[0]?.en || ''
}
function shuffle<T>(a: T[]): T[] { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0;[a[i], a[j]] = [a[j], a[i]] } return a }

// Minimal MCQ clone mirroring lib/japanese/practice.buildMCQ position logic.
function buildMCQ(correct: string, pool: string[]): { correctIndex: number; choices: string[] } | null {
  const c = correct.trim()
  if (!c) return null
  const seen = new Set([c.toLowerCase()]); const d: string[] = []
  for (const raw of shuffle([...pool])) { const x = (raw ?? '').trim(); if (!x) continue; const k = x.toLowerCase(); if (seen.has(k)) continue; seen.add(k); d.push(x); if (d.length === 3) break }
  if (d.length < 3) return null
  const ordered = shuffle([c, ...d])
  return { correctIndex: ordered.indexOf(c), choices: ordered }
}

async function fetchAll(table: string, level: string, columns: string) {
  const out: any[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supa.from(table).select(columns).eq('jlpt_level', level).eq('is_published', true).order('id').range(from, from + 999)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
    from += 1000
  }
  return out
}

async function auditLevel(level: string) {
  const [words, kanji, grammar] = await Promise.all([
    fetchAll('japanese_words', level, 'id,word,reading,meanings'),
    fetchAll('japanese_kanji', level, 'id,character,onyomi,kunyomi,meanings'),
    fetchAll('japanese_grammar', level, 'id,pattern,meaning_vi,meaning_en,examples'),
  ])

  // ── truncation scan across ALL raw meanings (the việc→ệc class) ──
  let truncated = 0, emptyOut = 0, notPresentable = 0
  const truncSamples: string[] = []
  const scan = (type: string, id: string, rawMeaning: string) => {
    if (isTruncated(rawMeaning)) {
      truncated++
      if (truncSamples.length < 8) truncSamples.push(`${type}:${id}  "${rawMeaning}" → "${formatGloss(rawMeaning)}"`)
    }
    const cleaned = primarySense(rawMeaning)
    if (rawMeaning && !cleaned) emptyOut++
    if (cleaned && !isPresentableText(cleaned)) notPresentable++
  }
  for (const r of words) scan('vocabulary', r.id, pickMeaningVi(r.meanings))
  for (const r of kanji) scan('kanji', r.id, pickMeaningVi(r.meanings))
  for (const r of grammar) scan('grammar', r.id, r.meaning_vi || r.meaning_en || '')

  // ── eligibility / rejection counts ──
  let rejMeaning = 0, rejReading = 0, rawLeakRaw = 0, rawLeakClean = 0
  const suspicious: string[] = []
  const enrichedW = words.map((r) => {
    const rawMeaning = pickMeaningVi(r.meanings)
    if (hasRawMarkers(rawMeaning)) { rawLeakRaw++; suspicious.push(`vocabulary:${r.id}`) }
    const meaning = primarySense(rawMeaning)
    if (hasRawMarkers(meaning)) rawLeakClean++
    if (!meaning) rejMeaning++
    if (!(r.reading && r.reading !== r.word)) rejReading++
    return { id: r.id, word: (r.word ?? '').trim(), reading: (r.reading ?? '').trim(), meaning }
  }).filter((r) => r.word && r.meaning)

  const enrichedK = kanji.map((r) => {
    const rawMeaning = pickMeaningVi(r.meanings)
    if (hasRawMarkers(rawMeaning)) { rawLeakRaw++; suspicious.push(`kanji:${r.id}`) }
    const meaning = primarySense(rawMeaning)
    if (hasRawMarkers(meaning)) rawLeakClean++
    return { id: r.id, character: (r.character ?? '').trim(), meaning, readings: [...(r.onyomi ?? []), ...(r.kunyomi ?? [])].filter(Boolean) }
  }).filter((r) => r.character && r.meaning)

  // ambiguity: distinct vocab sharing an identical normalized primary meaning
  const meaningGroups = new Map<string, number>()
  for (const w of enrichedW) { const k = w.meaning.toLowerCase(); meaningGroups.set(k, (meaningGroups.get(k) ?? 0) + 1) }
  const ambiguous = Array.from(meaningGroups.values()).filter((n) => n > 1).reduce((a, b) => a + b, 0)

  // ── statistics ≥1000 questions across simulated 10-question SESSIONS ──
  // (matches real play: no-replacement + signature dedup per session). The
  // meaningful repetition metric is WITHIN a session — it must be ~0.
  const SESSION = 10
  const sessions = Math.max(1, Math.ceil(1000 / SESSION))
  const posCount = [0, 0, 0, 0]
  let produced = 0, invalid = 0, withinDupSrc = 0, withinDupSig = 0
  for (let s = 0; s < sessions; s++) {
    const pool = shuffle([...enrichedW]).slice(0, 40) // random window, like the live generator
    const usedSig = new Set<string>(); const usedSrc = new Set<string>()
    let made = 0
    for (const r of pool) {
      if (made >= SESSION) break
      const sig = questionSignature({ sourceType: 'vocabulary', sourceId: r.id, qType: 'vocab_ja_to_meaning' })
      if (usedSig.has(sig)) { withinDupSig++; continue }
      if (usedSrc.has(r.id)) { withinDupSrc++; continue }
      const others = enrichedW.filter((o) => o.id !== r.id).map((o) => o.meaning)
      const q = buildMCQ(r.meaning, others)
      if (!q) { invalid++; continue }
      usedSig.add(sig); usedSrc.add(r.id)
      posCount[q.correctIndex]++; produced++; made++
    }
  }
  const N = produced
  const pos = posCount.map((c, i) => `${LETTERS[i]}:${N ? Math.round((c / N) * 100) : 0}%`).join(' ')
  const dupSrc = withinDupSrc, dupSig = withinDupSig

  // capacity estimate: items × available question types
  const capacity = enrichedW.length * 3 + enrichedK.length * 3 + enrichedG(grammar)

  console.log(`\n=== ${level} ===`)
  console.log(`eligible: vocab=${enrichedW.length}/${words.length}  kanji=${enrichedK.length}/${kanji.length}  grammar=${grammar.length}`)
  console.log(`rejected: missing_meaning(vocab)=${rejMeaning}  no_usable_reading(vocab)=${rejReading}`)
  console.log(`raw-marker leakage: source_rows_with_markers=${rawLeakRaw}  AFTER_cleaning=${rawLeakClean}  (target 0)`)
  console.log(`TRUNCATION (leading-char loss): ${truncated}  empty_after_format=${emptyOut}  not_presentable=${notPresentable}  (target 0)`)
  if (truncSamples.length) for (const s of truncSamples) console.log(`   ⚠ ${s}`)
  console.log(`ambiguity: vocab sharing identical primary meaning=${ambiguous}`)
  console.log(`estimated unique question capacity ≈ ${capacity}`)
  console.log(`sample(${N} vocab-meaning over ${sessions} sessions): within-session dupSource=${dupSrc} dupSignature=${dupSig} (target 0)  invalidFormatRate=${pct(invalid, N + invalid)}`)
  console.log(`answer-position distribution: ${pos}  (target ~25% each)`)
  if (suspicious.length) console.log(`suspicious source ids (raw markers), first 15: ${suspicious.slice(0, 15).join(', ')}${suspicious.length > 15 ? ` … +${suspicious.length - 15}` : ''}`)
}

function enrichedG(grammar: any[]): number {
  return grammar.filter((g) => (g.meaning_vi || g.meaning_en)).length * 2
}
function pct(n: number, d: number): string { return d ? `${Math.round((n / d) * 100)}%` : '0%' }

;(async () => {
  console.log('jp60 production question-pool audit (read-only)')
  for (const lv of LEVELS) {
    try { await auditLevel(lv) } catch (e) { console.error(`  ${lv} failed:`, (e as Error).message) }
  }
  console.log('\nDone.')
})()
