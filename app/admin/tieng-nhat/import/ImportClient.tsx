'use client'

import { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { importWords, importKanji, importGrammar, importQuiz } from './import-actions'
import type {
  ImportWordRow,
  ImportKanjiRow,
  ImportGrammarRow,
  ImportQuizRow,
  ImportResult,
} from './import-actions'

// ─── Constants ───────────────────────────────────────────────────────────────

const VALID_JLPT = ['N5', 'N4', 'N3', 'N2', 'N1']
const VALID_CATEGORIES = ['vocabulary', 'kanji', 'grammar', 'reading', 'mixed']
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard']
const VALID_POS = ['verb', 'noun', 'adjective', 'adverb', 'particle', 'conjunction', 'interjection']
const MAX_FILE_BYTES = 20 * 1024 * 1024 // 20MB
const PREVIEW_LIMIT = 20
const CHUNK_SIZE = 100

const INPUT = 'w-full px-3 py-2 text-[13px] border border-line rounded-xl bg-paper text-ink focus:outline-none'

type DataType = 'words' | 'kanji' | 'grammar' | 'quiz'
type Stage = 'idle' | 'preview' | 'importing' | 'done'

type RowResult = {
  index: number
  raw: Record<string, unknown>
  data?: ImportWordRow | ImportKanjiRow | ImportGrammarRow | ImportQuizRow
  errors: string[]
}

type TFn = (key: string, values?: Record<string, string | number>) => string

// ─── CSV Parser ──────────────────────────────────────────────────────────────

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') { field += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      row.push(field.trim()); field = ''
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field.trim()); field = ''
      if (row.some(f => f !== '')) rows.push(row)
      row = []
    } else {
      field += ch
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field.trim())
    if (row.some(f => f !== '')) rows.push(row)
  }
  return rows
}

function csvToObjects(text: string): Record<string, string>[] {
  const rows = parseCSV(text)
  if (rows.length < 2) return []
  const headers = rows[0].map(h => h.toLowerCase().trim())
  return rows.slice(1).map(row => {
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = (row[i] ?? '').trim() })
    return obj
  })
}

// ─── Validators ──────────────────────────────────────────────────────────────

function splitPipe(val: string | undefined): string[] | null {
  if (!val) return null
  const arr = val.split(/[|;,]/).map(s => s.trim()).filter(Boolean)
  return arr.length > 0 ? arr : null
}

function validateJlpt(val: string | undefined, rowNum: number, errors: string[], t: TFn) {
  const jlpt = val?.trim() || null
  if (jlpt && !VALID_JLPT.includes(jlpt)) {
    errors.push(t('err_jlpt_invalid', { row: rowNum, jlpt, valid: VALID_JLPT.join('/') }))
  }
  return jlpt && VALID_JLPT.includes(jlpt) ? jlpt : null
}

function validateWord(raw: Record<string, unknown>, i: number, t: TFn): RowResult {
  const errors: string[] = []
  const r = raw as Record<string, string>
  const rowNum = i + 1

  const word = r.word?.trim()
  if (!word) errors.push(t('err_missing_field', { row: rowNum, field: 'word' }))

  const jlpt_level = validateJlpt(r.jlpt_level, rowNum, errors, t)

  // Parse meanings — supports JSON array or flat meaning_vi/meaning_en fields
  let meanings: { vi: string; en: string }[] = []
  if (r.meanings) {
    try {
      const parsed = JSON.parse(r.meanings)
      if (Array.isArray(parsed)) meanings = parsed.filter((m: { vi?: string; en?: string }) => m.vi || m.en)
    } catch { errors.push(t('err_meanings_json', { row: rowNum })) }
  } else {
    for (let idx = 0; idx < 3; idx++) {
      const vi = (r[`meaning_${idx}_vi`] ?? r.meaning_vi ?? '').trim()
      const en = (r[`meaning_${idx}_en`] ?? r.meaning_en ?? '').trim()
      if (idx === 0 && (vi || en)) meanings.push({ vi, en })
      else if (idx > 0 && (r[`meaning_${idx}_vi`] || r[`meaning_${idx}_en`])) {
        meanings.push({ vi: (r[`meaning_${idx}_vi`] ?? '').trim(), en: (r[`meaning_${idx}_en`] ?? '').trim() })
      }
    }
  }
  if (meanings.length === 0) errors.push(t('err_need_meaning', { row: rowNum }))

  // Parse POS — supports JSON array or | separated
  let pos: string[] | null = null
  if (r.pos) {
    const arr = r.pos.startsWith('[')
      ? JSON.parse(r.pos)
      : r.pos.split(/[|,;]/).map((s: string) => s.trim()).filter(Boolean)
    const invalid = arr.filter((p: string) => !VALID_POS.includes(p))
    if (invalid.length > 0) errors.push(t('err_pos_invalid', { row: rowNum, list: invalid.join(', ') }))
    pos = arr.filter((p: string) => VALID_POS.includes(p))
  }

  // Parse examples — JSON column first, then flat columns example_jp/reading/vi/en
  let examples: unknown = null
  if (r.examples_json || r.examples) {
    const raw = r.examples_json ?? r.examples
    try { examples = JSON.parse(raw) } catch { errors.push(t('err_examples_json', { row: rowNum })) }
  } else if (r.example_jp?.trim()) {
    examples = [{
      ja: r.example_jp.trim(),
      reading: r.example_reading?.trim() || '',
      vi: r.example_vi?.trim() || '',
      en: r.example_en?.trim() || '',
    }]
  }

  const data: ImportWordRow = {
    word,
    reading: r.reading?.trim() || null,
    romaji: r.romaji?.trim() || null,
    jlpt_level,
    pos: pos?.length ? pos : null,
    meanings: meanings.length ? meanings : null,
    examples,
    tags: splitPipe(r.tags),
    frequency: parseInt(r.frequency) || 0,
    source: r.source?.trim() || null,
    source_id: r.source_id?.trim() || null,
    license: r.license?.trim() || null,
    attribution: r.attribution?.trim() || null,
  }

  return { index: i, raw, data: errors.length === 0 ? data : undefined, errors }
}

function validateKanji(raw: Record<string, unknown>, i: number, t: TFn): RowResult {
  const errors: string[] = []
  const r = raw as Record<string, string>
  const rowNum = i + 1

  const character = r.character?.trim()
  if (!character) errors.push(t('err_missing_field', { row: rowNum, field: 'character' }))
  else if (Array.from(character).length > 2) errors.push(t('err_character_single', { row: rowNum }))

  const jlpt_level = validateJlpt(r.jlpt_level, rowNum, errors, t)

  // Meanings
  let meanings: { vi: string; en: string }[] | null = null
  const vi = r.meaning_vi?.trim() || ''
  const en = r.meaning_en?.trim() || ''
  if (vi || en) meanings = [{ vi, en }]
  else if (r.meanings) {
    try { meanings = JSON.parse(r.meanings) } catch { errors.push(t('err_meanings_json', { row: rowNum })) }
  }

  // Examples
  let examples: unknown = null
  if (r.examples_json || r.examples) {
    try { examples = JSON.parse(r.examples_json ?? r.examples) } catch { errors.push(t('err_examples_json', { row: rowNum })) }
  }

  const data: ImportKanjiRow = {
    character,
    jlpt_level,
    onyomi: splitPipe(r.onyomi),
    kunyomi: splitPipe(r.kunyomi),
    meanings,
    stroke_count: parseInt(r.stroke_count) || null,
    radical: r.radical?.trim() || null,
    examples,
  }

  return { index: i, raw, data: errors.length === 0 ? data : undefined, errors }
}

function validateGrammar(raw: Record<string, unknown>, i: number, t: TFn): RowResult {
  const errors: string[] = []
  const r = raw as Record<string, string>
  const rowNum = i + 1

  const pattern = r.pattern?.trim()
  if (!pattern) errors.push(t('err_missing_field', { row: rowNum, field: 'pattern' }))

  const jlpt_level = validateJlpt(r.jlpt_level, rowNum, errors, t)

  const meaning_vi = r.meaning_vi?.trim() || null
  const meaning_en = r.meaning_en?.trim() || null
  if (!meaning_vi && !meaning_en) errors.push(t('err_need_meaning_grammar', { row: rowNum }))

  let examples: unknown = null
  if (r.examples_json || r.examples) {
    try { examples = JSON.parse(r.examples_json ?? r.examples) } catch { errors.push(t('err_examples_json', { row: rowNum })) }
  }

  const data: ImportGrammarRow = {
    pattern,
    jlpt_level,
    meaning_vi,
    meaning_en,
    structure: r.structure?.trim() || null,
    notes: r.notes?.trim() || null,
    examples,
    tags: splitPipe(r.tags),
  }

  return { index: i, raw, data: errors.length === 0 ? data : undefined, errors }
}

function validateQuiz(raw: Record<string, unknown>, i: number, t: TFn): RowResult {
  const errors: string[] = []
  const r = raw as Record<string, string>
  const rowNum = i + 1

  const question = r.question?.trim()
  if (!question) errors.push(t('err_missing_field', { row: rowNum, field: 'question' }))

  const jlpt_level = validateJlpt(r.jlpt_level, rowNum, errors, t)

  const category = r.category?.trim() || 'mixed'
  if (r.category && !VALID_CATEGORIES.includes(category)) {
    errors.push(t('err_category_invalid', { row: rowNum, category, valid: VALID_CATEGORIES.join('/') }))
  }

  const difficulty = r.difficulty?.trim() || 'medium'
  if (r.difficulty && !VALID_DIFFICULTIES.includes(difficulty)) {
    errors.push(t('err_difficulty_invalid', { row: rowNum, difficulty }))
  }

  const correct_answer = r.correct_answer?.trim().toUpperCase()
  if (!['A', 'B', 'C', 'D'].includes(correct_answer)) {
    errors.push(t('err_correct_answer', { row: rowNum }))
  }

  const options: { key: string; text: string }[] = []
  for (const key of ['A', 'B', 'C', 'D']) {
    const text = (r[`option_${key}`] ?? '').trim()
    if (!text) errors.push(t('err_missing_option', { row: rowNum, key }))
    else options.push({ key, text })
  }

  const data: ImportQuizRow = {
    jlpt_level,
    category: VALID_CATEGORIES.includes(category) ? category : 'mixed',
    question,
    question_reading: r.question_reading?.trim() || null,
    question_vi: r.question_vi?.trim() || null,
    question_en: r.question_en?.trim() || null,
    options,
    correct_answer,
    explanation_vi: r.explanation_vi?.trim() || null,
    explanation_en: r.explanation_en?.trim() || null,
    difficulty: VALID_DIFFICULTIES.includes(difficulty) ? difficulty : 'medium',
  }

  return { index: i, raw, data: errors.length === 0 ? data : undefined, errors }
}

// ─── Sample templates ─────────────────────────────────────────────────────────

const SAMPLES: Record<DataType, { json: object[]; csvHeaders: string; csvExample: string }> = {
  words: {
    json: [{
      word: '食べる', reading: 'たべる', romaji: 'taberu', jlpt_level: 'N5',
      pos: ['verb'],
      meanings: [{ vi: 'ăn', en: 'to eat' }],
      examples: [{ ja: 'ご飯を食べる', reading: 'ごはんをたべる', vi: 'Ăn cơm', en: 'To eat rice' }],
      tags: ['food', 'daily'], frequency: 1000,
      source: 'self', source_id: null, license: 'self-authored', attribution: null,
    }],
    csvHeaders: 'word,reading,romaji,jlpt_level,pos,meaning_vi,meaning_en,tags,frequency,source,license',
    csvExample: '食べる,たべる,taberu,N5,verb,ăn,to eat,food|daily,1000,admin-import,self-authored',
  },
  kanji: {
    json: [{
      character: '食', jlpt_level: 'N4',
      onyomi: ['ショク', 'ジキ'], kunyomi: ['た.べる', 'く.う'],
      meanings: [{ vi: 'ăn, thức ăn', en: 'eat, food' }],
      stroke_count: 9, radical: '食',
      examples: [{ word: '食事', reading: 'しょくじ', vi: 'bữa ăn', en: 'meal' }],
    }],
    csvHeaders: 'character,jlpt_level,onyomi,kunyomi,meaning_vi,meaning_en,stroke_count,radical',
    csvExample: '食,N4,ショク|ジキ,た.べる|く.う,ăn/thức ăn,eat/food,9,食',
  },
  grammar: {
    json: [{
      pattern: '〜ている', jlpt_level: 'N5',
      meaning_vi: 'đang làm gì đó', meaning_en: 'to be doing something',
      structure: 'Vて + いる', notes: 'Diễn tả hành động đang tiếp diễn',
      examples: [{ ja: '食べている', reading: 'たべている', vi: 'Đang ăn', en: 'Is eating' }],
      tags: ['verb', 'progressive'],
    }],
    csvHeaders: 'pattern,jlpt_level,meaning_vi,meaning_en,structure,notes,tags',
    csvExample: '〜ている,N5,đang làm gì đó,to be doing,Vて + いる,Hành động tiếp diễn,verb|progressive',
  },
  quiz: {
    json: [{
      jlpt_level: 'N5', category: 'vocabulary', difficulty: 'easy',
      question: '＿に　なにを　いれますか。',
      question_vi: 'Điền từ thích hợp vào chỗ trống',
      question_en: 'Fill in the blank',
      option_A: '食べる', option_B: '飲む', option_C: '見る', option_D: '行く',
      correct_answer: 'A',
      explanation_vi: 'Vì câu hỏi về ăn uống', explanation_en: 'Because it is about eating',
    }],
    csvHeaders: 'jlpt_level,category,question,question_vi,question_en,option_A,option_B,option_C,option_D,correct_answer,explanation_vi,difficulty',
    csvExample: 'N5,vocabulary,＿に なにを いれますか。,Điền vào chỗ trống,Fill in the blank,食べる,飲む,見る,行く,A,Vì...,easy',
  },
}

function downloadBlob(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── Preview columns ──────────────────────────────────────────────────────────

function previewCols(type: DataType, t: TFn): string[] {
  if (type === 'words') return [t('col_word'), 'Reading', 'JLPT', t('col_pos'), t('col_meaning_vi')]
  if (type === 'kanji') return [t('col_character'), 'JLPT', 'Onyomi', 'Kunyomi', t('col_meaning_vi')]
  if (type === 'grammar') return ['Pattern', 'JLPT', t('col_meaning_vi'), t('col_structure')]
  return [t('col_question'), 'JLPT', t('col_category'), t('col_correct')]
}

function previewCells(type: DataType, data: ImportWordRow | ImportKanjiRow | ImportGrammarRow | ImportQuizRow): string[] {
  if (type === 'words') {
    const w = data as ImportWordRow
    return [w.word, w.reading ?? '—', w.jlpt_level ?? '—', w.pos?.join(', ') ?? '—', w.meanings?.[0]?.vi ?? '—']
  }
  if (type === 'kanji') {
    const k = data as ImportKanjiRow
    return [k.character, k.jlpt_level ?? '—', k.onyomi?.join('・') ?? '—', k.kunyomi?.join('・') ?? '—', k.meanings?.[0]?.vi ?? '—']
  }
  if (type === 'grammar') {
    const g = data as ImportGrammarRow
    return [g.pattern, g.jlpt_level ?? '—', g.meaning_vi ?? '—', g.structure ?? '—']
  }
  const q = data as ImportQuizRow
  return [`${q.question.slice(0, 40)}${q.question.length > 40 ? '…' : ''}`, q.jlpt_level ?? '—', q.category ?? '—', q.correct_answer]
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ImportClient() {
  const t = useTranslations('admin_jp')
  const fileRef = useRef<HTMLInputElement>(null)

  const [dataType, setDataType] = useState<DataType>('words')
  const [stage, setStage] = useState<Stage>('idle')
  const [isPublished, setIsPublished] = useState(true)
  const [allRows, setAllRows] = useState<RowResult[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [result, setResult] = useState<{ success: number; failed: number; skipped: number; errors: string[] } | null>(null)

  const validRows = allRows.filter(r => r.errors.length === 0)
  const invalidRows = allRows.filter(r => r.errors.length > 0)
  const previewRows = allRows.slice(0, PREVIEW_LIMIT)

  function resetFile() {
    setAllRows([])
    setFileError(null)
    setFileName(null)
    setStage('idle')
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleTypeChange(type: DataType) {
    setDataType(type)
    resetFile()
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.size > MAX_FILE_BYTES) {
      setFileError(t('err_file_too_large'))
      return
    }

    setFileError(null)
    setFileName(file.name)
    setResult(null)

    const text = await file.text()
    const ext = file.name.split('.').pop()?.toLowerCase()

    let rawRows: Record<string, unknown>[] = []
    try {
      if (ext === 'json') {
        const parsed = JSON.parse(text)
        if (!Array.isArray(parsed)) { setFileError(t('err_json_not_array')); return }
        rawRows = parsed
      } else if (ext === 'csv') {
        rawRows = csvToObjects(text)
        if (rawRows.length === 0) { setFileError(t('err_csv_empty')); return }
      } else {
        setFileError(t('err_unsupported_file'))
        return
      }
    } catch {
      setFileError(t('err_read_file'))
      return
    }

    const validator = dataType === 'words' ? validateWord
      : dataType === 'kanji' ? validateKanji
      : dataType === 'grammar' ? validateGrammar
      : validateQuiz

    const results = rawRows.map((raw, i) => validator(raw, i, t))
    setAllRows(results)
    setStage('preview')
  }

  async function handleImport() {
    const rows = validRows.map(r => r.data!)
    if (rows.length === 0) return

    setStage('importing')
    setProgress({ done: 0, total: rows.length })

    let totalSuccess = 0
    let totalFailed = 0
    const allErrors: string[] = []

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE)
      let res: ImportResult

      if (dataType === 'words') res = await importWords(chunk as ImportWordRow[], isPublished)
      else if (dataType === 'kanji') res = await importKanji(chunk as ImportKanjiRow[], isPublished)
      else if (dataType === 'grammar') res = await importGrammar(chunk as ImportGrammarRow[], isPublished)
      else res = await importQuiz(chunk as ImportQuizRow[], isPublished)

      totalSuccess += res.success
      totalFailed += res.failed
      allErrors.push(...res.errors)
      setProgress({ done: Math.min(i + CHUNK_SIZE, rows.length), total: rows.length })
    }

    setResult({ success: totalSuccess, failed: totalFailed, skipped: invalidRows.length, errors: allErrors })
    setStage('done')
  }

  const DATA_TYPES: { key: DataType; label: string; emoji: string }[] = [
    { key: 'words', label: t('section_dictionary'), emoji: '📖' },
    { key: 'kanji', label: 'Kanji', emoji: '漢' },
    { key: 'grammar', label: t('section_grammar'), emoji: '✏️' },
    { key: 'quiz', label: 'Quiz', emoji: '🎯' },
  ]

  return (
    <div className="space-y-6">

      {/* ── Step 1: Data type ────────────────────────────────────── */}
      <section className="bg-paper border border-line rounded-2xl p-6">
        <h2 className="text-[13px] font-bold text-muted uppercase tracking-wide mb-3">{t('step1_title')}</h2>
        <div className="flex flex-wrap gap-2">
          {DATA_TYPES.map(dt => (
            <button key={dt.key} onClick={() => handleTypeChange(dt.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold border transition-all ${
                dataType === dt.key
                  ? 'bg-rose text-white border-rose shadow-sm'
                  : 'bg-cream border-line text-ink hover:border-rose/40 hover:text-rose'
              }`}>
              <span className="text-[15px]">{dt.emoji}</span>
              {dt.label}
            </button>
          ))}
        </div>
      </section>

      {/* ── Step 2: Download sample ──────────────────────────────── */}
      <section className="bg-paper border border-line rounded-2xl p-6">
        <h2 className="text-[13px] font-bold text-muted uppercase tracking-wide mb-3">{t('step2_title')}</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => downloadBlob(
              JSON.stringify(SAMPLES[dataType].json, null, 2),
              `template_${dataType}.json`,
              'application/json'
            )}
            className="flex items-center gap-1.5 px-4 py-2 bg-cream border border-line rounded-xl text-[13px] font-semibold text-ink hover:border-rose/40 hover:text-rose transition-colors">
            ⬇ {t('download_json_sample')}
          </button>
          <button
            onClick={() => downloadBlob(
              `${SAMPLES[dataType].csvHeaders}\n${SAMPLES[dataType].csvExample}\n`,
              `template_${dataType}.csv`,
              'text/csv;charset=utf-8'
            )}
            className="flex items-center gap-1.5 px-4 py-2 bg-cream border border-line rounded-xl text-[13px] font-semibold text-ink hover:border-rose/40 hover:text-rose transition-colors">
            ⬇ {t('download_csv_sample')}
          </button>
        </div>
        <p className="text-[11.5px] text-muted mt-2">
          {t('sample_hint')}
        </p>
      </section>

      {/* ── Step 3: Upload file ──────────────────────────────────── */}
      <section className="bg-paper border border-line rounded-2xl p-6">
        <h2 className="text-[13px] font-bold text-muted uppercase tracking-wide mb-3">{t('step3_title')}</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 px-4 py-2 bg-rose text-white rounded-xl text-[13px] font-semibold cursor-pointer hover:bg-rose-deep transition-colors">
            📂 {t('choose_file')}
            <input ref={fileRef} type="file" accept=".json,.csv" onChange={handleFile} className="hidden" />
          </label>
          {fileName && (
            <div className="flex items-center gap-2 text-[13px] text-ink">
              <span className="text-emerald-600">✓</span>
              <span className="font-medium">{fileName}</span>
              <button onClick={resetFile} className="text-muted hover:text-rose transition-colors text-[11px]">✕ {t('remove')}</button>
            </div>
          )}
        </div>
        {fileError && (
          <div className="mt-3 flex items-start gap-2 text-[12.5px] text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
            <span className="shrink-0">✗</span>
            <span>{fileError}</span>
          </div>
        )}
      </section>

      {/* ── Step 4: Preview ─────────────────────────────────────── */}
      {stage !== 'idle' && allRows.length > 0 && (
        <section className="bg-paper border border-line rounded-2xl p-6">
          <h2 className="text-[13px] font-bold text-muted uppercase tracking-wide mb-3">{t('step4_title')}</h2>

          {/* Summary */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2 bg-cream border border-line rounded-xl px-3 py-2 text-[13px]">
              <span className="text-muted">{t('stat_total')}</span>
              <span className="font-bold text-ink">{allRows.length}</span>
            </div>
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-[13px]">
              <span className="text-emerald-700">✓ {t('valid')}</span>
              <span className="font-bold text-emerald-700">{validRows.length}</span>
            </div>
            {invalidRows.length > 0 && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-[13px]">
                <span className="text-red-600">✗ {t('errors')}</span>
                <span className="font-bold text-red-600">{invalidRows.length}</span>
              </div>
            )}
          </div>

          {/* Validation error list (max 10 shown) */}
          {invalidRows.length > 0 && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-3 max-h-[160px] overflow-y-auto">
              <p className="text-[11px] font-bold text-red-700 uppercase tracking-wide mb-2">{t('error_list')}</p>
              <ul className="space-y-0.5">
                {invalidRows.slice(0, 30).flatMap(r => r.errors).map((err, i) => (
                  <li key={i} className="text-[12px] text-red-600 flex items-start gap-1.5">
                    <span className="shrink-0 mt-0.5">•</span>
                    <span>{err}</span>
                  </li>
                ))}
                {invalidRows.length > 30 && (
                  <li className="text-[11px] text-red-500 italic">{t('and_n_more_errors', { n: invalidRows.length - 30 })}</li>
                )}
              </ul>
            </div>
          )}

          {/* Preview table */}
          <p className="text-[11.5px] text-muted mb-2">
            {t('showing_first_rows', { shown: Math.min(PREVIEW_LIMIT, allRows.length), total: allRows.length })}
          </p>
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-[12px]">
              <thead className="bg-cream border-b border-line">
                <tr>
                  <th className="text-left px-3 py-2 text-muted font-semibold w-10">#</th>
                  {previewCols(dataType, t).map(col => (
                    <th key={col} className="text-left px-3 py-2 text-muted font-semibold whitespace-nowrap">{col}</th>
                  ))}
                  <th className="text-left px-3 py-2 text-muted font-semibold">{t('col_status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/40">
                {previewRows.map(row => (
                  <tr key={row.index} className={row.errors.length > 0 ? 'bg-red-50/60' : 'bg-paper hover:bg-cream/50'}>
                    <td className="px-3 py-2 text-muted">{row.index + 1}</td>
                    {row.data
                      ? previewCells(dataType, row.data).map((cell, ci) => (
                          <td key={ci} className="px-3 py-2 text-ink max-w-[140px] truncate" lang="ja">{cell}</td>
                        ))
                      : previewCols(dataType, t).map((_, ci) => (
                          <td key={ci} className="px-3 py-2 text-red-400">—</td>
                        ))
                    }
                    <td className="px-3 py-2">
                      {row.errors.length === 0
                        ? <span className="text-emerald-600 font-bold text-[11px]">✓</span>
                        : <span className="text-red-600 text-[11px]" title={row.errors.join('\n')}>✗ {row.errors[0].split(': ').slice(1).join(': ')}</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── Step 5: Import ───────────────────────────────────────── */}
      {stage === 'preview' && validRows.length > 0 && (
        <section className="bg-paper border border-line rounded-2xl p-6">
          <h2 className="text-[13px] font-bold text-muted uppercase tracking-wide mb-4">{t('step5_title')}</h2>

          <label className="flex items-center gap-2 text-[13px] text-ink cursor-pointer mb-5">
            <input type="checkbox" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} className="accent-rose" />
            {t('import_as_published')}
          </label>

          {invalidRows.length > 0 && (
            <div className="mb-4 text-[12.5px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
              ⚠ {t('invalid_skipped_note', { invalid: invalidRows.length, valid: validRows.length })}
            </div>
          )}

          <button onClick={handleImport}
            className="flex items-center gap-2 bg-rose text-white text-[13px] font-semibold px-6 py-3 rounded-xl hover:bg-rose-deep transition-colors">
            📥 {t('start_import_n', { n: validRows.length })}
          </button>
        </section>
      )}

      {/* ── Progress ─────────────────────────────────────────────── */}
      {stage === 'importing' && (
        <section className="bg-paper border border-line rounded-2xl p-6">
          <h2 className="text-[13px] font-bold text-muted uppercase tracking-wide mb-4">{t('importing')}</h2>
          <div className="w-full bg-cream border border-line rounded-full h-3 overflow-hidden mb-3">
            <div
              className="h-full bg-rose rounded-full transition-all duration-300"
              style={{ width: `${progress.total > 0 ? (progress.done / progress.total * 100) : 0}%` }}
            />
          </div>
          <p className="text-[13px] text-muted">
            {t('progress_rows', { done: progress.done, total: progress.total })}
          </p>
        </section>
      )}

      {/* ── Result ───────────────────────────────────────────────── */}
      {stage === 'done' && result && (
        <section className="bg-paper border border-line rounded-2xl p-6">
          <h2 className="text-[13px] font-bold text-muted uppercase tracking-wide mb-4">{t('import_result')}</h2>
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-center">
              <div className="text-[28px] font-bold text-emerald-700">{result.success}</div>
              <div className="text-[11px] text-emerald-600 font-semibold">{t('result_success')}</div>
            </div>
            {result.failed > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-center">
                <div className="text-[28px] font-bold text-red-600">{result.failed}</div>
                <div className="text-[11px] text-red-500 font-semibold">{t('result_failed')}</div>
              </div>
            )}
            {result.skipped > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-center">
                <div className="text-[28px] font-bold text-amber-600">{result.skipped}</div>
                <div className="text-[11px] text-amber-500 font-semibold">{t('result_skipped')}</div>
              </div>
            )}
          </div>

          {result.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 max-h-[180px] overflow-y-auto mb-4">
              <p className="text-[11px] font-bold text-red-700 uppercase tracking-wide mb-2">{t('db_errors')}</p>
              <ul className="space-y-0.5">
                {result.errors.map((err, i) => (
                  <li key={i} className="text-[12px] text-red-600">• {err}</li>
                ))}
              </ul>
            </div>
          )}

          <button onClick={resetFile}
            className="px-4 py-2 text-[13px] font-semibold border border-line bg-cream rounded-xl hover:bg-line transition-colors">
            ← {t('import_another')}
          </button>
        </section>
      )}

    </div>
  )
}
