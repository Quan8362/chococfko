// Server-side question generation for the 60-Second Challenge.
// Reuses the eligibility-aware helpers from the existing practice engine
// (buildMCQ / pickMeaning / splitMixed) and adds difficulty + deterministic
// (seeded) generation for the Daily Challenge. NOT a client module — it reads
// the DB via the service-role client passed in by the caller.

import { buildMCQ, pickMeaning, splitMixed, type PracticeQuestion } from '@/lib/japanese/practice'
import { classifyDifficulty } from './difficulty'
import { mulberry32, hashSeed, seededPick } from './daily'
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

type AnyClient = {
  from: (t: string) => any
}

function firstMeaning(m: Json[] | null): Json | null {
  return Array.isArray(m) && m.length > 0 ? m[0] : null
}

// Fetch published rows for the given levels, excluding any admin-disabled items.
async function fetchRows<T>(
  client: AnyClient,
  table: 'japanese_words' | 'japanese_grammar' | 'japanese_kanji',
  sourceType: 'vocabulary' | 'grammar' | 'kanji',
  levels: readonly string[],
  columns: string,
  cap: number,
  disabled: ReadonlySet<string>
): Promise<T[]> {
  const { data } = await client
    .from(table)
    .select(columns)
    .in('jlpt_level', levels as string[])
    .eq('is_published', true)
    .order('id', { ascending: true })
    .limit(cap)
  const rows = (data ?? []) as Array<T & { id: string }>
  return rows.filter((r) => !disabled.has(`${sourceType}:${r.id}`)) as T[]
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
    .map((r) => ({ id: r.id, word: (r.word ?? '').trim(), reading: (r.reading ?? '').trim(), meaning: pickMeaning(firstMeaning(r.meanings), locale) }))
    .filter((r) => r.word && r.meaning)
  return buildFrom(enriched, count, seed, (r, others, rng) => {
    const hasReading = !!r.reading && r.reading !== r.word
    const types = ['vocab_ja_to_meaning', 'vocab_meaning_to_ja', ...(hasReading ? ['vocab_reading'] : [])] as PracticeQuestion['qType'][]
    const qType = pickType(types, rng)
    const note = r.reading ? `${r.word}（${r.reading}）` : r.word
    if (qType === 'vocab_ja_to_meaning')
      return buildMCQ({ sourceType: 'vocabulary', sourceId: r.id, qType, prompt: r.word, promptSub: r.reading || null, explanation: note }, r.meaning, others.map((o) => o.meaning), rng)
    if (qType === 'vocab_meaning_to_ja')
      return buildMCQ({ sourceType: 'vocabulary', sourceId: r.id, qType, prompt: r.meaning, explanation: `${note} = ${r.meaning}` }, r.word, others.map((o) => o.word), rng)
    return buildMCQ({ sourceType: 'vocabulary', sourceId: r.id, qType, prompt: r.word, explanation: r.meaning }, r.reading, others.filter((o) => o.reading && o.reading !== o.word).map((o) => o.reading), rng)
  })
}

function genKanji(rows: KanjiRow[], count: number, locale: string, seed: number | null): ServerQuestion[] {
  const enriched = rows
    .map((r) => ({ id: r.id, character: (r.character ?? '').trim(), meaning: pickMeaning(firstMeaning(r.meanings), locale), readings: [...(r.onyomi ?? []), ...(r.kunyomi ?? [])].map((s) => (s ?? '').trim()).filter(Boolean) }))
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
    .map((r) => ({ id: r.id, pattern: (r.pattern ?? '').trim(), meaning: locale === 'en' ? (r.meaning_en || r.meaning_vi || '').trim() : (r.meaning_vi || r.meaning_en || '').trim(), examples: Array.isArray(r.examples) ? r.examples : [] }))
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

// Shared loop: pick `count` source rows (seeded for daily, random otherwise),
// build one MCQ each, attach difficulty, skip questions that can't be fairly built.
function buildFrom<R extends { id: string }>(
  enriched: R[],
  count: number,
  seed: number | null,
  make: (r: R, others: R[], rng: () => number) => PracticeQuestion | null
): ServerQuestion[] {
  if (count <= 0 || enriched.length === 0) return []
  const ordered = seed == null ? shuffleArr(enriched) : seededPick(enriched, Math.min(enriched.length, count * 3), seed)
  const out: ServerQuestion[] = []
  for (const r of ordered) {
    if (out.length >= count) break
    const others = enriched.filter((o) => o.id !== r.id)
    // Per-question deterministic rng (daily) so option order is reproducible too.
    const rng = seed == null ? Math.random : mulberry32(hashSeed(`${seed}:${r.id}`))
    const q = make(r, others, rng)
    if (q) out.push({ ...q, difficulty: classifyDifficulty({ qType: q.qType, readingLength: q.promptSub?.length }) })
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
  seed?: number | null // present → deterministic daily set
}

// Top-level: builds a balanced (vocab/grammar/kanji) set for the chosen level.
export async function generateQuestions(client: AnyClient, input: GenerateInput): Promise<ServerQuestion[]> {
  const levels = sourceLevelsFor(input.level)
  const seed = input.seed ?? null
  const disabled = await loadDisabled(client)
  const split = splitMixed(input.count)
  const cap = Math.max(300, input.count * 12)

  const [words, grammar, kanji] = await Promise.all([
    fetchRows<WordRow>(client, 'japanese_words', 'vocabulary', levels, 'id,word,reading,meanings,jlpt_level', cap, disabled),
    fetchRows<GrammarRow>(client, 'japanese_grammar', 'grammar', levels, 'id,pattern,meaning_vi,meaning_en,examples,jlpt_level', cap, disabled),
    fetchRows<KanjiRow>(client, 'japanese_kanji', 'kanji', levels, 'id,character,onyomi,kunyomi,meanings,jlpt_level', cap, disabled),
  ])

  let out = [
    ...genVocab(words, split.vocabulary, input.locale, seed),
    ...genGrammar(grammar, split.grammar, input.locale, seed),
    ...genKanji(kanji, split.kanji, input.locale, seed),
  ]

  // Top up from vocabulary if any source came up short.
  if (out.length < input.count) {
    const extra = genVocab(words, input.count - out.length + 4, input.locale, seed)
    const seen = new Set(out.map((q) => q.id))
    for (const q of extra) {
      if (out.length >= input.count) break
      if (!seen.has(q.id)) { seen.add(q.id); out.push(q) }
    }
  }

  // Final ordering: seeded for daily (stable across players), random otherwise.
  const orderRng = seed == null ? Math.random : mulberry32(seed ^ 0x9e3779b9)
  out = shuffleArr2(out, orderRng).slice(0, input.count)
  return out
}

function shuffleArr2<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}
