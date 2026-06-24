import { createClient } from '@/lib/supabase/server'
import type { JapaneseWord } from '@/components/japanese/WordCard'

const WORD_COLUMNS = 'id,word,reading,romaji,jlpt_level,pos,meanings,examples,tags,frequency'
const FETCH_BATCH = 1000

/** Number of flashcards per deck when a level is split into study sets. */
export const FLASHCARD_DECK_SIZE = 50

/**
 * Tag marking JMdict reading/sense artifacts that have no example and cannot
 * safely receive one (obscure secondary readings mis-tagged to a level). These
 * are hidden from Flashcard decks so a learner never sees a misleading card.
 * Keep this in sync with the deck-count query in app/japanese/flashcards/page.tsx.
 */
export const FLASHCARD_EXCLUDE_TAG = 'flashcard_exclude'

/**
 * Fetch every published word for a JLPT level (ordered by frequency desc).
 * Pages through in batches so the PostgREST row cap never truncates the result.
 */
export async function getAllWordsForLevel(level: string): Promise<JapaneseWord[]> {
  const supabase = createClient()
  const all: JapaneseWord[] = []

  for (let from = 0; ; from += FETCH_BATCH) {
    const { data, error } = await supabase
      .from('japanese_words')
      .select(WORD_COLUMNS)
      .eq('jlpt_level', level)
      .eq('is_published', true)
      .or(`tags.is.null,tags.not.cs.{${FLASHCARD_EXCLUDE_TAG}}`)
      .order('frequency', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + FETCH_BATCH - 1)

    if (error || !data || data.length === 0) break
    all.push(...(data as JapaneseWord[]))
    if (data.length < FETCH_BATCH) break
  }

  return all
}

/**
 * Fetch only the ids of every published word for a level, ordered identically to
 * {@link getWordsForDeck} (frequency desc, id asc) so the index→deck mapping is
 * exact. Used to aggregate per-deck learning progress without loading the heavy
 * meaning/example payloads of every word.
 */
export async function getWordIdsForLevel(level: string): Promise<string[]> {
  const supabase = createClient()
  const ids: string[] = []

  for (let from = 0; ; from += FETCH_BATCH) {
    const { data, error } = await supabase
      .from('japanese_words')
      .select('id')
      .eq('jlpt_level', level)
      .eq('is_published', true)
      .or(`tags.is.null,tags.not.cs.{${FLASHCARD_EXCLUDE_TAG}}`)
      .order('frequency', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + FETCH_BATCH - 1)

    if (error || !data || data.length === 0) break
    for (const row of data as { id: string }[]) ids.push(row.id)
    if (data.length < FETCH_BATCH) break
  }

  return ids
}

/**
 * Fetch a single flashcard deck (slice of words) for a level.
 * `deck` is 1-based; returns the words ordered by frequency desc within the slice.
 */
export async function getWordsForDeck(level: string, deck: number): Promise<JapaneseWord[]> {
  const supabase = createClient()
  const from = (deck - 1) * FLASHCARD_DECK_SIZE
  const to = from + FLASHCARD_DECK_SIZE - 1

  const { data } = await supabase
    .from('japanese_words')
    .select(WORD_COLUMNS)
    .eq('jlpt_level', level)
    .eq('is_published', true)
    .or(`tags.is.null,tags.not.cs.{${FLASHCARD_EXCLUDE_TAG}}`)
    .order('frequency', { ascending: false })
    .order('id', { ascending: true })
    .range(from, to)

  return (data as JapaneseWord[]) ?? []
}
