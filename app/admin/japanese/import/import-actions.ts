'use server'

import { redirect } from 'next/navigation'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'

async function guardAdmin() {
  if (!(await checkIsAdmin())) redirect('/')
}

export type ImportResult = {
  success: number
  failed: number
  errors: string[]
}

export type ImportWordRow = {
  word: string
  reading?: string | null
  romaji?: string | null
  jlpt_level?: string | null
  pos?: string[] | null
  meanings?: { vi: string; en: string }[] | null
  examples?: unknown
  tags?: string[] | null
  frequency?: number
  source?: string | null
  source_id?: string | null
  license?: string | null
  attribution?: string | null
  review_status?: string | null   // 'approved'|'ai_draft'|'needs_review'
  meaning_source?: string | null  // 'manual'|'jmdict_ai'|'jmdict_reviewed'|'import'
  // Optional image fields — old imports without these columns still work
  image_url?: string | null
  image_alt?: string | null
  image_source?: string | null
  image_credit_url?: string | null
  image_query?: string | null
}

export type ImportKanjiRow = {
  character: string
  jlpt_level?: string | null
  onyomi?: string[] | null
  kunyomi?: string[] | null
  meanings?: { vi: string; en: string }[] | null
  stroke_count?: number | null
  radical?: string | null
  examples?: unknown
}

export type ImportGrammarRow = {
  pattern: string
  jlpt_level?: string | null
  meaning_vi?: string | null
  meaning_en?: string | null
  structure?: string | null
  notes?: string | null
  examples?: unknown
  tags?: string[] | null
}

export type ImportQuizRow = {
  jlpt_level?: string | null
  category?: string
  question: string
  question_reading?: string | null
  question_vi?: string | null
  question_en?: string | null
  options: { key: string; text: string }[]
  correct_answer: string
  explanation_vi?: string | null
  explanation_en?: string | null
  difficulty?: string
}

type PgResponse = { error: { message: string } | null }

// Shape of rows fetched from DB for merge (Phase B + Phase D columns)
type ExistingWordRow = {
  word: string
  reading: string | null
  meanings: { vi: string; en: string }[] | null
  examples: unknown
  tags: string[] | null
  pos: string[] | null
  frequency: number
  source: string | null
  source_id: string | null
  license: string | null
  attribution: string | null
  review_status: string | null   // Phase D
  meaning_source: string | null  // Phase D
}

type ExampleItem = { vi?: string; en?: string }
type WordPayloadRow = Record<string, unknown>

// ── Helpers ──────────────────────────────────────────────────

function mergeUnique(
  a: string[] | null | undefined,
  b: string[] | null | undefined
): string[] | null {
  const unique = Array.from(new Set([...(a ?? []), ...(b ?? [])].filter(Boolean)))
  return unique.length > 0 ? unique : null
}

// Returns true if the existing row is manually authored and must be protected.
// Protected rows: vi meanings, source, license, attribution, review_status cannot be overwritten.
function isManualProtected(ex: ExistingWordRow | null): boolean {
  if (!ex) return false
  return (
    ex.source === 'self' ||
    ex.license === 'self-authored' ||
    (ex.review_status === 'approved' && ex.meaning_source === 'manual')
  )
}

// Merge meanings position-by-position.
//
// isProtected = true  (source=self / self-authored):
//   - Keep existing vi on every slot — never overwrite.
//   - Fill in missing en if incoming has it.
//   - Do NOT add new meaning slots beyond what existing has.
//
// isProtected = false:
//   - Prefer incoming vi/en if non-empty; fall back to existing.
//   - Do NOT replace non-empty existing vi/en with empty string.
//   - Expand to max(existing, incoming) slots.
//
// If existing has no meanings at all, use incoming regardless of protection.
function mergeMeanings(
  existing: { vi: string; en: string }[] | null,
  incoming: { vi: string; en: string }[] | null,
  isProtected: boolean
): { vi: string; en: string }[] | null {
  if (!incoming?.length) return existing ?? null
  if (!existing?.length) return incoming   // nothing to protect → take incoming

  // Protected: only iterate existing slots (no new slots from incoming)
  // Unprotected: expand to max length
  const len = isProtected
    ? existing.length
    : Math.max(existing.length, incoming.length)

  const result: { vi: string; en: string }[] = []
  for (let i = 0; i < len; i++) {
    const ex  = existing[i]
    const inc = incoming[i]
    if (!inc) { result.push(ex); continue }
    if (!ex)  { result.push(inc); continue }  // only reachable when isProtected=false

    result.push({
      vi: isProtected ? (ex.vi || '')              : (inc.vi || ex.vi || ''),
      en: isProtected ? (inc.en || ex.en || '')    : (inc.en || ex.en || ''),
    })
  }
  return result.filter(m => m.vi || m.en)
}

function buildSearchText(
  word: string,
  reading: string | null,
  romaji: string | null,
  meanings: { vi: string; en: string }[] | null,
  examples: unknown,
  tags: string[] | null
): string {
  const parts: string[] = []
  if (word)    parts.push(word)
  if (reading) parts.push(reading)
  if (romaji)  parts.push(romaji)
  meanings?.forEach(m => { if (m.vi) parts.push(m.vi); if (m.en) parts.push(m.en) })
  if (Array.isArray(examples)) {
    ;(examples as ExampleItem[]).forEach(e => {
      if (e.vi) parts.push(e.vi)
      if (e.en) parts.push(e.en)
    })
  }
  tags?.forEach(t => parts.push(t))
  return parts.join(' ').trim()
}

function buildViSearchText(
  meanings: { vi: string; en: string }[] | null,
  examples: unknown
): string | null {
  const parts: string[] = []
  meanings?.forEach(m => { if (m.vi) parts.push(m.vi) })
  if (Array.isArray(examples)) {
    ;(examples as ExampleItem[]).forEach(e => { if (e.vi) parts.push(e.vi) })
  }
  const result = parts.join(' ').trim()
  return result || null
}

// ── Chunked upsert/insert ────────────────────────────────────

async function insertChunked<T extends object>(
  rows: T[],
  insertFn: (chunk: T[]) => PromiseLike<PgResponse>,
  startOffset = 0
): Promise<ImportResult> {
  const CHUNK = 100
  let success = 0
  let failed = 0
  const errors: string[] = []

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await insertFn(chunk)

    if (error) {
      for (let j = 0; j < chunk.length; j++) {
        const { error: rowErr } = await insertFn([chunk[j]])
        if (rowErr) {
          failed++
          errors.push(`Dòng ${startOffset + i + j + 1}: ${rowErr.message}`)
        } else {
          success++
        }
      }
    } else {
      success += chunk.length
    }
  }

  return { success, failed, errors }
}

// ── importWords ──────────────────────────────────────────────

export async function importWords(rows: ImportWordRow[], isPublished: boolean): Promise<ImportResult> {
  await guardAdmin()
  const admin = createAdminClient()

  // Batch-query existing rows for merge.
  // Requires migration_japanese_phase_b.sql + migration_japanese_phase_c.sql +
  // migration_japanese_phase_d_jmdict_staging.sql to be run first.
  const wordList = Array.from(new Set(rows.map(r => r.word).filter(Boolean)))
  const { data: existingData } = await admin
    .from('japanese_words')
    .select('word,reading,meanings,examples,tags,pos,frequency,source,source_id,license,attribution,review_status,meaning_source')
    .in('word', wordList)

  const existingMap = new Map<string, ExistingWordRow>()
  for (const ex of (existingData ?? []) as unknown as ExistingWordRow[]) {
    existingMap.set(`${ex.word}|||${ex.reading ?? ''}`, ex)
  }

  const payload: WordPayloadRow[] = []
  let preValidationFailed = 0
  const preValidationErrors: string[] = []

  for (let i = 0; i < rows.length; i++) {
    const r   = rows[i]
    const ex  = existingMap.get(`${r.word}|||${r.reading ?? ''}`) ?? null
    const isNew      = !ex
    const isProtected = isManualProtected(ex)
    const incomingVi = r.meanings?.[0]?.vi ?? ''

    // ── Guard: cannot create a new public entry without meaning_vi ──────
    if (isNew && !incomingVi) {
      preValidationFailed++
      preValidationErrors.push(
        `Dòng ${i + 1} (${r.word}): thiếu meaning_vi — không tạo entry mới`
      )
      continue
    }

    const meanings  = mergeMeanings(ex?.meanings ?? null, r.meanings ?? null, isProtected)
    const examples  = r.examples != null ? r.examples : (ex?.examples ?? null)
    const pos       = mergeUnique(ex?.pos,  r.pos)
    const tags      = mergeUnique(ex?.tags, r.tags)

    const imageFields = r.image_url ? {
      image_url:        r.image_url,
      image_alt:        r.image_alt        ?? null,
      image_source:     r.image_source     ?? null,
      image_credit_url: r.image_credit_url ?? null,
      image_query:      r.image_query      ?? null,
      image_fetched_at: new Date().toISOString(),
      image_status:     'found',
    } : {}

    // ── Protected rows: lock source/license/attribution/review/meaning_source ──
    const source         = isProtected ? (ex!.source        ?? 'self')          : (r.source        || ex?.source        || 'admin-import')
    const license        = isProtected ? (ex!.license       ?? 'self-authored') : (r.license       || ex?.license       || 'self-authored')
    const attribution    = isProtected ? (ex!.attribution   ?? null)            : (r.attribution   ?? ex?.attribution   ?? null)
    const review_status  = isProtected ? 'approved'                             : (r.review_status || ex?.review_status || 'approved')
    const meaning_source = isProtected ? 'manual'                               : (r.meaning_source || ex?.meaning_source || 'import')

    payload.push({
      word:              r.word,
      reading:           r.reading    ?? null,
      romaji:            r.romaji     ?? null,
      jlpt_level:        r.jlpt_level ?? null,
      pos:               pos  ?? null,
      meanings:          meanings ?? null,
      examples:          examples ?? null,
      tags:              tags ?? null,
      frequency:         r.frequency  ?? ex?.frequency ?? 0,
      is_published:      isPublished,
      source,
      source_id:         r.source_id  || ex?.source_id  || null,
      license,
      attribution,
      has_vi_meaning:    !!(meanings?.[0]?.vi),
      vi_search_text:    buildViSearchText(meanings, examples),
      search_text:       buildSearchText(r.word, r.reading ?? null, r.romaji ?? null, meanings, examples, tags),
      kana_normalized:   r.reading    ?? '',
      romaji_normalized: (r.romaji    ?? '').toLowerCase(),
      review_status,
      meaning_source,
      ...imageFields,
    })
  }

  if (payload.length === 0) {
    return {
      success: 0,
      failed: preValidationFailed,
      errors: preValidationErrors,
    }
  }

  const dbResult = await insertChunked(
    payload,
    chunk => admin.from('japanese_words').upsert(chunk, { onConflict: 'word,reading', ignoreDuplicates: false })
  )

  return {
    success: dbResult.success,
    failed:  preValidationFailed + dbResult.failed,
    errors:  [...preValidationErrors, ...dbResult.errors],
  }
}

// ── importKanji (unchanged) ──────────────────────────────────

export async function importKanji(rows: ImportKanjiRow[], isPublished: boolean): Promise<ImportResult> {
  await guardAdmin()
  const admin = createAdminClient()

  const payload = rows.map(r => ({
    character:   r.character,
    jlpt_level:  r.jlpt_level || null,
    onyomi:      r.onyomi?.length  ? r.onyomi  : null,
    kunyomi:     r.kunyomi?.length ? r.kunyomi : null,
    meanings:    r.meanings?.length ? r.meanings : null,
    stroke_count: r.stroke_count || null,
    radical:     r.radical || null,
    examples:    r.examples || null,
    is_published: isPublished,
  }))

  return insertChunked(payload, chunk =>
    admin.from('japanese_kanji').upsert(chunk, { onConflict: 'character', ignoreDuplicates: false })
  )
}

// ── importGrammar (unchanged) ────────────────────────────────

export async function importGrammar(rows: ImportGrammarRow[], isPublished: boolean): Promise<ImportResult> {
  await guardAdmin()
  const admin = createAdminClient()

  const payload = rows.map(r => ({
    pattern:     r.pattern,
    jlpt_level:  r.jlpt_level || null,
    meaning_vi:  r.meaning_vi || null,
    meaning_en:  r.meaning_en || null,
    structure:   r.structure  || null,
    notes:       r.notes      || null,
    examples:    r.examples   || null,
    tags:        r.tags?.length ? r.tags : null,
    is_published: isPublished,
  }))

  return insertChunked(payload, chunk =>
    admin.from('japanese_grammar').upsert(chunk, { onConflict: 'pattern', ignoreDuplicates: false })
  )
}

// ── importQuiz (unchanged) ───────────────────────────────────

export async function importQuiz(rows: ImportQuizRow[], isPublished: boolean): Promise<ImportResult> {
  await guardAdmin()
  const admin = createAdminClient()

  const payload = rows.map(r => ({
    jlpt_level:       r.jlpt_level || null,
    category:         r.category   || 'mixed',
    question:         r.question,
    question_reading: r.question_reading || null,
    question_vi:      r.question_vi      || null,
    question_en:      r.question_en      || null,
    options:          r.options,
    correct_answer:   r.correct_answer,
    explanation_vi:   r.explanation_vi   || null,
    explanation_en:   r.explanation_en   || null,
    difficulty:       r.difficulty || 'medium',
    is_published:     isPublished,
  }))

  return insertChunked(payload, chunk => admin.from('jp_quiz_questions').insert(chunk))
}
