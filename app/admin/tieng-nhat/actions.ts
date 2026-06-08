'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'

async function guardAdmin() {
  if (!(await checkIsAdmin())) redirect('/')
}

const VALID_JLPT = ['N5', 'N4', 'N3', 'N2', 'N1']

function parseExamplesJson(raw: string): { error?: string; data: unknown } {
  const trimmed = raw.trim()
  if (!trimmed) return { data: null }
  try { return { data: JSON.parse(trimmed) } } catch { return { error: 'Examples JSON không hợp lệ — kiểm tra lại định dạng', data: null } }
}

function parseTags(raw: string): string[] | null {
  const tags = (raw ?? '').trim().split(',').map(t => t.trim()).filter(Boolean)
  return tags.length > 0 ? tags : null
}

// ─── Words ───────────────────────────────────────────────────────────────────

const POS_OPTIONS = ['verb', 'noun', 'adjective', 'adverb', 'particle', 'conjunction', 'interjection']

export async function upsertWord(formData: FormData): Promise<{ error?: string }> {
  await guardAdmin()
  const admin = createAdminClient()

  const id = (formData.get('id') as string) || null
  const word = ((formData.get('word') as string) ?? '').trim()
  if (!word) return { error: 'Từ không được để trống' }

  const jlpt = (formData.get('jlpt_level') as string) || null
  if (jlpt && !VALID_JLPT.includes(jlpt)) return { error: 'Cấp độ JLPT không hợp lệ' }

  const meanings: { vi: string; en: string }[] = []
  for (let i = 0; i < 3; i++) {
    const vi = ((formData.get(`meaning_${i}_vi`) as string) ?? '').trim()
    const en = ((formData.get(`meaning_${i}_en`) as string) ?? '').trim()
    if (vi || en) meanings.push({ vi, en })
  }

  const pos = POS_OPTIONS.filter(p => formData.get(`pos_${p}`) === 'on')

  const { error: exErr, data: examples } = parseExamplesJson((formData.get('examples_json') as string) ?? '')
  if (exErr) return { error: exErr }

  const payload = {
    word,
    reading: ((formData.get('reading') as string) ?? '').trim() || null,
    romaji: ((formData.get('romaji') as string) ?? '').trim() || null,
    jlpt_level: jlpt,
    pos: pos.length > 0 ? pos : null,
    meanings: meanings.length > 0 ? meanings : null,
    examples: examples ?? null,
    tags: parseTags((formData.get('tags') as string) ?? ''),
    frequency: parseInt((formData.get('frequency') as string) ?? '0') || 0,
    is_published: formData.get('is_published') === 'on',
  }

  const { error } = id
    ? await admin.from('japanese_words').update(payload).eq('id', id)
    : await admin.from('japanese_words').insert(payload)

  if (error) return { error: error.message }
  revalidatePath('/admin/tieng-nhat/tu-dien')
  revalidatePath('/tieng-nhat/tu-dien')
  return {}
}

export async function toggleWordPublished(id: string, published: boolean): Promise<{ error?: string }> {
  await guardAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('japanese_words').update({ is_published: published }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/tieng-nhat/tu-dien')
  revalidatePath('/tieng-nhat/tu-dien')
  return {}
}

// ─── Kanji ────────────────────────────────────────────────────────────────────

export async function upsertKanji(formData: FormData): Promise<{ error?: string }> {
  await guardAdmin()
  const admin = createAdminClient()

  const id = (formData.get('id') as string) || null
  const character = ((formData.get('character') as string) ?? '').trim()
  if (!character) return { error: 'Kanji không được để trống' }

  const jlpt = (formData.get('jlpt_level') as string) || null
  if (jlpt && !VALID_JLPT.includes(jlpt)) return { error: 'Cấp độ JLPT không hợp lệ' }

  const splitArr = (raw: string) => {
    const arr = raw.trim().split(',').map(r => r.trim()).filter(Boolean)
    return arr.length > 0 ? arr : null
  }

  const vi = ((formData.get('meaning_vi') as string) ?? '').trim()
  const en = ((formData.get('meaning_en') as string) ?? '').trim()
  const meanings = (vi || en) ? [{ vi, en }] : null

  const { error: exErr, data: examples } = parseExamplesJson((formData.get('examples_json') as string) ?? '')
  if (exErr) return { error: exErr }

  const payload = {
    character,
    jlpt_level: jlpt,
    onyomi: splitArr((formData.get('onyomi') as string) ?? ''),
    kunyomi: splitArr((formData.get('kunyomi') as string) ?? ''),
    meanings,
    stroke_count: parseInt((formData.get('stroke_count') as string) ?? '') || null,
    radical: ((formData.get('radical') as string) ?? '').trim() || null,
    examples: examples ?? null,
    is_published: formData.get('is_published') === 'on',
  }

  const { error } = id
    ? await admin.from('japanese_kanji').update(payload).eq('id', id)
    : await admin.from('japanese_kanji').insert(payload)

  if (error) return { error: error.message }
  revalidatePath('/admin/tieng-nhat/kanji')
  revalidatePath('/tieng-nhat/kanji')
  return {}
}

export async function toggleKanjiPublished(id: string, published: boolean): Promise<{ error?: string }> {
  await guardAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('japanese_kanji').update({ is_published: published }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/tieng-nhat/kanji')
  revalidatePath('/tieng-nhat/kanji')
  return {}
}

// ─── Grammar ──────────────────────────────────────────────────────────────────

export async function upsertGrammar(formData: FormData): Promise<{ error?: string }> {
  await guardAdmin()
  const admin = createAdminClient()

  const id = (formData.get('id') as string) || null
  const pattern = ((formData.get('pattern') as string) ?? '').trim()
  if (!pattern) return { error: 'Pattern không được để trống' }

  const { error: exErr, data: examples } = parseExamplesJson((formData.get('examples_json') as string) ?? '')
  if (exErr) return { error: exErr }

  const payload = {
    pattern,
    jlpt_level: (formData.get('jlpt_level') as string) || null,
    meaning_vi: ((formData.get('meaning_vi') as string) ?? '').trim() || null,
    meaning_en: ((formData.get('meaning_en') as string) ?? '').trim() || null,
    structure: ((formData.get('structure') as string) ?? '').trim() || null,
    notes: ((formData.get('notes') as string) ?? '').trim() || null,
    examples: examples ?? null,
    tags: parseTags((formData.get('tags') as string) ?? ''),
    is_published: formData.get('is_published') === 'on',
  }

  const { error } = id
    ? await admin.from('japanese_grammar').update(payload).eq('id', id)
    : await admin.from('japanese_grammar').insert(payload)

  if (error) return { error: error.message }
  revalidatePath('/admin/tieng-nhat/ngu-phap')
  revalidatePath('/tieng-nhat/ngu-phap')
  return {}
}

export async function toggleGrammarPublished(id: string, published: boolean): Promise<{ error?: string }> {
  await guardAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('japanese_grammar').update({ is_published: published }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/tieng-nhat/ngu-phap')
  revalidatePath('/tieng-nhat/ngu-phap')
  return {}
}

// ─── Quiz ─────────────────────────────────────────────────────────────────────

export async function upsertQuiz(formData: FormData): Promise<{ error?: string }> {
  await guardAdmin()
  const admin = createAdminClient()

  const id = (formData.get('id') as string) || null
  const question = ((formData.get('question') as string) ?? '').trim()
  if (!question) return { error: 'Câu hỏi không được để trống' }

  const options = ['A', 'B', 'C', 'D'].map(k => ({
    key: k,
    text: ((formData.get(`option_${k}`) as string) ?? '').trim(),
  }))
  for (const o of options) {
    if (!o.text) return { error: `Đáp án ${o.key} không được để trống` }
  }

  const correct = (formData.get('correct_answer') as string) ?? ''
  if (!['A', 'B', 'C', 'D'].includes(correct)) return { error: 'Đáp án đúng phải là A/B/C/D' }

  const payload = {
    jlpt_level: (formData.get('jlpt_level') as string) || null,
    category: (formData.get('category') as string) || 'mixed',
    question,
    question_reading: ((formData.get('question_reading') as string) ?? '').trim() || null,
    question_vi: ((formData.get('question_vi') as string) ?? '').trim() || null,
    question_en: ((formData.get('question_en') as string) ?? '').trim() || null,
    options,
    correct_answer: correct,
    explanation_vi: ((formData.get('explanation_vi') as string) ?? '').trim() || null,
    explanation_en: ((formData.get('explanation_en') as string) ?? '').trim() || null,
    difficulty: (formData.get('difficulty') as string) || 'medium',
    is_published: formData.get('is_published') === 'on',
  }

  const { error } = id
    ? await admin.from('jp_quiz_questions').update(payload).eq('id', id)
    : await admin.from('jp_quiz_questions').insert(payload)

  if (error) return { error: error.message }
  revalidatePath('/admin/tieng-nhat/quiz')
  return {}
}

export async function toggleQuizPublished(id: string, published: boolean): Promise<{ error?: string }> {
  await guardAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from('jp_quiz_questions').update({ is_published: published }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/admin/tieng-nhat/quiz')
  return {}
}
