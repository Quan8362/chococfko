// Server-side question generation for the 60-Second Challenge.
// Reuses the eligibility-aware helpers from the existing practice engine
// (buildMCQ / pickMeaning / splitMixed) and adds:
//   * learner-facing gloss cleaning (strips "[bắc]"-style annotations)
//   * deterministic (seeded) generation for the Daily / Friend Challenge
//   * a RANDOM-OFFSET candidate window for Rush/Practice so sessions vary
//   * recent-exposure exclusion + cross-type signature de-duplication
// NOT a client module — it reads the DB via the service-role client passed in.

import { buildMCQ, pickMeaning, splitMixed, type PracticeQuestion } from '@/lib/japanese/practice'
import { formatGloss, primarySense, isPresentableText } from '@/lib/japanese/gloss'
import { classifyDifficulty } from './difficulty'
import { mulberry32, hashSeed, seededPick } from './daily'
import { questionSignature } from './presentation'
import { sourceLevelsFor, type Jp60Difficulty, type Jp60Level } from './constants'

type Json = { vi?: string | null; en?: string | null }
type WordRow = { id: string; word: string; reading: string | null; meanings: Json[] | null; jlpt_level: string }
type GrammarRow = {
  id: string
  pattern: string
  meaning_vi: string | null
  meaning_en: string | null
  examples: { ja?: string; reading?: string; vi?: string; en?: string }[] | null
  jlpt_level: string
}
type KanjiRow = { id: string; character: string; onyomi: string[] | null; kunyomi: string[] | null; meanings: Json[] | null; jlpt_level: string }

export type ServerQuestion = PracticeQuestion & { difficulty: Jp60Difficulty }

// Minimal client-safe shape — correctKey/explanation are stripped before sending
// in ranked modes (the server reveals correctKey only after the answer is submitted).
export type ClientQuestion = {
  id: string
  index: number
  qType: string
  prompt: string
  promptSub: string | null
  options: { key: string; text: string }[]
  sourceType: string
  difficulty: Jp60Difficulty // safe to expose (not the answer) — lets the client mirror live score
}

export function toClientQuestion(q: ServerQuestion, index: number): ClientQuestion {
  return {
    id: q.id,
    index,
    qType: q.qType,
    prompt: q.prompt,
    promptSub: q.promptSub,
    options: q.options,
    sourceType: q.sourceType,
    difficulty: q.difficulty,
  }
}

type AnyClient = { from: (t: string) => any }

function firstMeaning(m: Json[] | null): Json | null {
  return Array.isArray(m) && m.length > 0 ? m[0] : null
}

// Fetch eligible rows. Daily/Friend (seeded) use a stable id-ordered window so
// every player sees the same pool; Rush/Practice use a RANDOM OFFSET window so
// the candidate set differs across sessions (the old fixed `.limit` always
// returned the lowest-id rows → cross-session repetition). Excludes admin-disabled
// items and (best-effort) recently-seen source ids.
async function fetchRows<T extends { id: string }>(
  client: AnyClient,
  table: 'japanese_words' | 'japanese_grammar' | 'japanese_kanji',
  sourceType: 'vocabulary' | 'grammar' | 'kanji',
  levels: readonly string[],
  columns: string,
  need: number,
  disabled: ReadonlySet<string>,
  recent: ReadonlySet<string>,
  seeded: boolean
): Promise<T[]> {
  const poolSize = Math.max(200, need * 15)
  let data: T[] | null = null

  if (seeded) {
    const res = await client
      .from(table).select(columns)
      .in('jlpt_level', levels as string[]).eq('is_published', true)
      .order('id', { ascending: true }).limit(poolSize)
    data = res.data
  } else {
    const { count } = await client
      .from(table).select('id', { count: 'exact', head: true })
      .in('jlpt_level', levels as string[]).eq('is_published', true)
    const total = count ?? 0
    if (total === 0) return []
    const window = Math.min(total, poolSize)
    const maxOffset = Math.max(0, total - window)
    const offset = Math.floor(Math.random() * (maxOffset + 1))
    const res = await client
      .from(table).select(columns)
      .in('jlpt_level', levels as string[]).eq('is_published', true)
      .order('id', { ascending: true }).range(offset, offset + window - 1)
    data = res.data
  }

  const rows = (data ?? []) as T[]
  const usable = rows.filter((r) => !disabled.has(`${sourceType}:${r.id}`))
  // Down-weight recently-seen items, but never starve the pool below ~2× need.
  const fresh = usable.filter((r) => !recent.has(`${sourceType}:${r.id}`))
  return fresh.length >= need * 2 ? fresh : usable
}

async function loadDisabled(client: AnyClient): Promise<Set<string>> {
  const { data } = await client.from('jp60_disabled_items').select('source_type,source_id')
  const set = new Set<string>()
  for (const r of (data ?? []) as { source_type: string; source_id: string }[]) {
    set.add(`${r.source_type}:${r.source_id}`)
  }
  return set
}

function pickType<T>(types: T[], rng: () => number): T {
  return types[Math.floor(rng() * types.length)]
}

function genVocab(rows: WordRow[], count: number, locale: string, seed: number | null): ServerQuestion[] {
  const enriched = rows
    .map((r) => ({ id: r.id, word: (r.word ?? '').trim(), reading: (r.reading ?? '').trim(), meaning: primarySense(pickMeaning(firstMeaning(r.meanings), locale)) }))
    .filter((r) => r.word && r.meaning)
  return buildFrom(enriched, count, seed, (r, others, rng) => {
    const hasReading = !!r.reading && r.reading !== r.word
    const types = ['vocab_ja_to_meaning', 'vocab_meaning_to_ja', ...(hasReading ? ['vocab_reading'] : [])] as PracticeQuestion['qType'][]
    const qType = pickType(types, rng)
    const note = r.reading ? `${r.word}（${r.reading}）` : r.word
    if (qType === 'vocab_ja_to_meaning')
      return buildMCQ({ sourceType: 'vocabulary', sourceId: r.id, qType, prompt: r.word, promptSub: r.reading || null, explanation: `${note} = ${r.meaning}` }, r.meaning, others.map((o) => o.meaning), rng)
    if (qType === 'vocab_meaning_to_ja')
      return buildMCQ({ sourceType: 'vocabulary', sourceId: r.id, qType, prompt: r.meaning, explanation: `${note} = ${r.meaning}` }, r.word, others.map((o) => o.word), rng)
    return buildMCQ({ sourceType: 'vocabulary', sourceId: r.id, qType, prompt: r.word, explanation: r.meaning }, r.reading, others.filter((o) => o.reading && o.reading !== o.word).map((o) => o.reading), rng)
  })
}

function genKanji(rows: KanjiRow[], count: number, locale: string, seed: number | null): ServerQuestion[] {
  const enriched = rows
    .map((r) => ({ id: r.id, character: (r.character ?? '').trim(), meaning: primarySense(pickMeaning(firstMeaning(r.meanings), locale)), readings: [...(r.onyomi ?? []), ...(r.kunyomi ?? [])].map((s) => (s ?? '').trim()).filter(Boolean) }))
    .filter((r) => r.character && r.meaning)
  return buildFrom(enriched, count, seed, (r, others, rng) => {
    const hasReading = r.readings.length > 0
    const types = ['kanji_to_meaning', 'kanji_meaning_to_char', ...(hasReading ? ['kanji_reading'] : [])] as PracticeQuestion['qType'][]
    const qType = pickType(types, rng)
    const note = r.readings.join('、')
    if (qType === 'kanji_to_meaning')
      return buildMCQ({ sourceType: 'kanji', sourceId: r.id, qType, prompt: r.character, promptSub: note || null, explanation: r.meaning }, r.meaning, others.map((o) => o.meaning), rng)
    if (qType === 'kanji_meaning_to_char')
      return buildMCQ({ sourceType: 'kanji', sourceId: r.id, qType, prompt: r.meaning, explanation: `${r.character} = ${r.meaning}` }, r.character, others.map((o) => o.character), rng)
    const correct = r.readings[Math.floor(rng() * r.readings.length)]
    return buildMCQ({ sourceType: 'kanji', sourceId: r.id, qType, prompt: r.character, explanation: `${r.character} = ${r.meaning}` }, correct, others.flatMap((o) => o.readings), rng)
  })
}

function genGrammar(rows: GrammarRow[], count: number, locale: string, seed: number | null): ServerQuestion[] {
  const enriched = rows
    .map((r) => ({ id: r.id, pattern: (r.pattern ?? '').trim(), meaning: formatGloss(locale === 'en' ? (r.meaning_en || r.meaning_vi) : (r.meaning_vi || r.meaning_en)), examples: Array.isArray(r.examples) ? r.examples : [] }))
    .filter((r) => r.pattern && r.meaning)
  return buildFrom(enriched, count, seed, (r, others, rng) => {
    const core = r.pattern.replace(/[〜～\s]/g, '')
    const blankEx = core.length >= 2 ? r.examples.find((ex) => typeof ex.ja === 'string' && ex.ja.includes(core)) : undefined
    const types: PracticeQuestion['qType'][] = ['grammar_pattern_to_meaning', 'grammar_meaning_to_pattern']
    if (blankEx) types.push('grammar_blank')
    const qType = pickType(types, rng)
    if (qType === 'grammar_pattern_to_meaning')
      return buildMCQ({ sourceType: 'grammar', sourceId: r.id, qType, prompt: r.pattern, explanation: r.meaning }, r.meaning, others.map((o) => o.meaning), rng)
    if (qType === 'grammar_meaning_to_pattern')
      return buildMCQ({ sourceType: 'grammar', sourceId: r.id, qType, prompt: r.meaning, explanation: `${r.pattern} = ${r.meaning}` }, r.pattern, others.map((o) => o.pattern), rng)
    const sub = locale === 'en' ? blankEx!.en : blankEx!.vi
    return buildMCQ({ sourceType: 'grammar', sourceId: r.id, qType, prompt: blankEx!.ja!.replace(core, '＿＿'), promptSub: sub || null, explanation: `${r.pattern} = ${r.meaning}` }, core, others.map((o) => o.pattern.replace(/[〜～\s]/g, '')).filter((c) => c.length >= 2), rng)
  })
}

// Shared loop: pick source rows (seeded for daily, random otherwise), build one
// MCQ each, attach difficulty, skip questions that can't be fairly built or that
// would duplicate a structural signature already produced this run.
function buildFrom<R extends { id: string }>(
  enriched: R[],
  count: number,
  seed: number | null,
  make: (r: R, others: R[], rng: () => number) => PracticeQuestion | null
): ServerQuestion[] {
  if (count <= 0 || enriched.length === 0) return []
  const ordered = seed == null ? shuffleArr(enriched) : seededPick(enriched, Math.min(enriched.length, count * 3), seed)
  const out: ServerQuestion[] = []
  const sigs = new Set<string>()
  for (const r of ordered) {
    if (out.length >= count) break
    const others = enriched.filter((o) => o.id !== r.id)
    const rng = seed == null ? Math.random : mulberry32(hashSeed(`${seed}:${r.id}`))
    const q = make(r, others, rng)
    if (!q) continue
    // Safeguard: never surface a malformed prompt/choice (empty, truncated to
    // metadata, replacement/control chars, leftover annotations, HTML/JSON).
    if (!isPresentableText(q.prompt)) continue
    if (!q.options.every((o) => isPresentableText(o.text))) continue
    const sig = questionSignature(q)
    if (sigs.has(sig)) continue
    sigs.add(sig)
    out.push({ ...q, difficulty: classifyDifficulty({ qType: q.qType, readingLength: q.promptSub?.length }) })
  }
  return out
}

function shuffleArr<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export type GenerateInput = {
  level: Jp60Level
  count: number
  locale: string
  seed?: number | null // present → deterministic daily/challenge set
  excludeSourceIds?: ReadonlySet<string> // "sourceType:sourceId" recently seen by this user
}

// Top-level: builds a balanced (vocab/grammar/kanji) set for the chosen level,
// de-duplicated by structural signature AND source item.
export async function generateQuestions(client: AnyClient, input: GenerateInput): Promise<ServerQuestion[]> {
  const levels = sourceLevelsFor(input.level)
  const seed = input.seed ?? null
  const seeded = seed != null
  const recent = input.excludeSourceIds ?? new Set<string>()
  const disabled = await loadDisabled(client)
  const split = splitMixed(input.count)

  const [words, grammar, kanji] = await Promise.all([
    fetchRows<WordRow>(client, 'japanese_words', 'vocabulary', levels, 'id,word,reading,meanings,jlpt_level', Math.max(split.vocabulary, 6), disabled, recent, seeded),
    fetchRows<GrammarRow>(client, 'japanese_grammar', 'grammar', levels, 'id,pattern,meaning_vi,meaning_en,examples,jlpt_level', Math.max(split.grammar, 6), disabled, recent, seeded),
    fetchRows<KanjiRow>(client, 'japanese_kanji', 'kanji', levels, 'id,character,onyomi,kunyomi,meanings,jlpt_level', Math.max(split.kanji, 6), disabled, recent, seeded),
  ])

  const parts = [
    ...genVocab(words, split.vocabulary, input.locale, seed),
    ...genGrammar(grammar, split.grammar, input.locale, seed),
    ...genKanji(kanji, split.kanji, input.locale, seed),
  ]

  // Assemble with cross-type dedup (signature + source item).
  const seenSig = new Set<string>()
  const seenSrc = new Set<string>()
  const out: ServerQuestion[] = []
  const add = (q: ServerQuestion) => {
    const sig = questionSignature(q)
    const src = `${q.sourceType}:${q.sourceId}`
    if (seenSig.has(sig) || seenSrc.has(src)) return
    seenSig.add(sig); seenSrc.add(src); out.push(q)
  }
  for (const q of parts) { if (out.length >= input.count) break; add(q) }

  // Top up from vocabulary if any source came up short.
  if (out.length < input.count) {
    const extra = genVocab(words, input.count - out.length + 6, input.locale, seed)
    for (const q of extra) { if (out.length >= input.count) break; add(q) }
  }

  const orderRng = seed == null ? Math.random : mulberry32(seed ^ 0x9e3779b9)
  return shuffleWith(out, orderRng).slice(0, input.count)
}

function shuffleWith<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
