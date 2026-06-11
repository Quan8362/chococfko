import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { getBookmarkIds } from '../../bookmark-actions'
import { getOrFetchWordImage } from '../../image-actions'
import JlptBadge from '@/components/japanese/JlptBadge'
import BookmarkButton from '@/components/japanese/BookmarkButton'
import CopyButton from '@/components/japanese/CopyButton'
import WordImage from '@/components/japanese/WordImage'
import PosBadges from '@/components/japanese/PosBadges'
import KanjiPracticeSection from '@/components/japanese/KanjiPracticeSection'
import WordCard, { type JapaneseWord } from '@/components/japanese/WordCard'
import { urlLevel } from '@/components/japanese/LevelPicker'
import { cleanMeaningText } from '@/lib/sanitize'

export const dynamic = 'force-dynamic'

async function fetchWord(wordParam: string) {
  const supabase = createClient()
  const select = 'id,word,reading,romaji,jlpt_level,pos,meanings,examples,tags,frequency,image_url,image_alt,image_source,image_credit_url,image_status,image_fetched_at'

  const { data: byWord } = await supabase
    .from('japanese_words')
    .select(select)
    .eq('word', wordParam)
    .eq('is_published', true)
    .limit(1)
    .maybeSingle()

  if (byWord) return byWord as JapaneseWord

  const { data: byReading } = await supabase
    .from('japanese_words')
    .select(select)
    .eq('reading', wordParam)
    .eq('is_published', true)
    .limit(1)
    .maybeSingle()

  return (byReading as JapaneseWord | null)
}

export async function generateMetadata({ params }: { params: { word: string } }) {
  const wordParam = decodeURIComponent(params.word)
  const word = await fetchWord(wordParam)
  if (!word) return { title: 'Từ điển Nhật Việt · Chợ Cóc FKO' }

  const meaning = (word.meanings as { vi: string; en: string }[] | null)?.[0]
  const readingPart = word.reading && word.reading !== word.word ? ` (${word.reading})` : ''

  return {
    title: `${word.word}${readingPart} · Từ điển Nhật · Chợ Cóc FKO`,
    description: meaning
      ? `${word.word}${readingPart} — ${meaning.vi}. Tra từ điển Nhật Việt tại Chợ Cóc FKO.`
      : `Tra nghĩa từ ${word.word} trong từ điển Nhật Việt Chợ Cóc FKO.`,
  }
}

export default async function WordDetailPage({ params }: { params: { word: string } }) {
  const wordParam = decodeURIComponent(params.word)

  const supabase = createClient()
  const [t, locale, { data: { user } }, word] = await Promise.all([
    getTranslations('japanese'),
    getLocale(),
    supabase.auth.getUser(),
    fetchWord(wordParam),
  ])

  if (!word) notFound()

  const [relatedData, bookmarkIds, imageData] = await Promise.all([
    word.jlpt_level
      ? supabase
          .from('japanese_words')
          .select('id,word,reading,romaji,jlpt_level,pos,meanings,examples,tags,frequency')
          .neq('id', word.id)
          .eq('jlpt_level', word.jlpt_level)
          .eq('is_published', true)
          .order('frequency', { ascending: false })
          .limit(6)
      : Promise.resolve({ data: [] }),
    user ? getBookmarkIds('word') : Promise.resolve([] as string[]),
    getOrFetchWordImage(word),
  ])

  const relatedWords = (relatedData.data as JapaneseWord[]) ?? []
  const bookmarkedSet = new Set(bookmarkIds)
  const isBookmarked = bookmarkedSet.has(word.id)

  const tCopy = t('copy_word')
  const tCopied = t('copied')
  const tViewDetail = t('view_detail')

  return (
    <div className="max-w-[1200px] mx-auto px-5 sm:px-6 py-10 pb-20">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8 flex-wrap">
        <Link href="/tieng-nhat" className="hover:text-rose transition-colors">{t('page_heading')}</Link>
        <span>/</span>
        <Link href="/tieng-nhat/tu-dien" className="hover:text-rose transition-colors">{t('dictionary')}</Link>
        <span>/</span>
        <span className="text-ink font-medium" lang="ja">{word.word}</span>
      </nav>

      {/* 2-column layout on desktop, stacked on mobile */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6 lg:items-start">

      {/* LEFT COLUMN — main vocabulary content */}
      <div className="min-w-0">

      {/* Main card */}
      <div className="bg-paper border border-line rounded-3xl p-6 sm:p-8 shadow-sm">

        {/* Word + bookmark */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-[52px] sm:text-[64px] font-bold text-ink leading-none" lang="ja">
                {word.word}
              </h1>
              {word.reading && word.reading !== word.word && (
                <span className="text-[22px] text-muted font-medium" lang="ja">{word.reading}</span>
              )}
            </div>
            {word.romaji && (
              <p className="text-[15px] text-muted mt-1">{word.romaji}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0 pt-2">
            {word.jlpt_level && <JlptBadge level={word.jlpt_level} />}
            <BookmarkButton
              itemId={word.id}
              itemType="word"
              initialBookmarked={isBookmarked}
              loginMessage={!user ? t('login_to_save') : undefined}
            />
          </div>
        </div>

        {/* POS badges */}
        <PosBadges value={word.pos} variant="detail" className="mb-6" />

        {/* Meanings */}
        {word.meanings && word.meanings.length > 0 && (
          <div className="mb-6 p-4 bg-cream/60 rounded-2xl border border-line/60">
            <p className="text-[10.5px] font-bold text-muted uppercase tracking-wide mb-3">
              {t('meanings_label')}
            </p>
            <div className="space-y-2">
              {(word.meanings as { vi: string; en: string }[]).map((m, i) => (
                <div key={i} className="space-y-0.5">
                  {locale === 'en' ? (
                    <>
                      {m.en && <p className="text-[15px] text-ink font-medium leading-snug">{cleanMeaningText(m.en)}</p>}
                      {m.vi && <p className="text-[13px] text-muted leading-snug">{cleanMeaningText(m.vi)}</p>}
                    </>
                  ) : (
                    <>
                      {m.vi && <p className="text-[15px] text-ink font-medium leading-snug">{cleanMeaningText(m.vi)}</p>}
                      {m.en && <p className="text-[13px] text-muted leading-snug">{cleanMeaningText(m.en)}</p>}
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Illustration image */}
        {imageData.image_url && (
          <WordImage
            src={imageData.image_url}
            alt={imageData.image_alt ?? t('image_alt_for_word', { word: word.word })}
            creditUrl={imageData.image_credit_url}
            source={imageData.image_source}
            wordId={word.id}
            label={t('illustration_label')}
          />
        )}

        {/* Examples */}
        {word.examples && word.examples.length > 0 && (
          <div className="mb-6">
            <p className="text-[10.5px] font-bold text-muted uppercase tracking-wide mb-3">{t('example')}</p>
            <div className="space-y-4">
              {(word.examples as { ja: string; reading: string; vi: string; en: string }[])
                .slice(0, 4)
                .map((ex, i) => (
                  <div key={i} className="border-l-2 border-rose/30 pl-3">
                    <p className="text-[15px] font-medium text-ink" lang="ja">{ex.ja}</p>
                    {ex.reading && (
                      <p className="text-[12px] text-muted mt-0.5" lang="ja">{ex.reading}</p>
                    )}
                    {locale !== 'en' && ex.vi && (
                      <p className="text-[13px] text-muted mt-0.5 italic">{ex.vi}</p>
                    )}
                    {locale === 'en' && ex.en && (
                      <p className="text-[13px] text-muted mt-0.5 italic">{ex.en}</p>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {word.tags && word.tags.length > 0 && (
          <div className="mb-6 flex flex-wrap gap-1.5">
            {word.tags.map(tag => (
              <span key={tag} className="text-[11px] bg-cream border border-line text-muted px-2.5 py-0.5 rounded-full">
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Copy + back */}
        <div className="flex items-center justify-between pt-4 border-t border-line/60">
          <CopyButton text={word.word} label={t('copy_word')} copiedLabel={t('copied')} />
          <Link
            href="/tieng-nhat/tu-dien"
            className="text-[12px] text-muted hover:text-rose transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {t('dictionary')}
          </Link>
        </div>
      </div>
      </div>

      {/* RIGHT SIDEBAR — Kanji practice + related preview (sticky on desktop) */}
      <aside className="mt-6 lg:mt-0 lg:sticky lg:top-[90px] space-y-6">
        <KanjiPracticeSection word={word.word} />

        {/* Related words preview — desktop only */}
        {relatedWords.length > 0 && (
          <div className="hidden lg:block bg-paper border border-line rounded-2xl p-4 shadow-sm">
            <h2 className="font-serif font-bold text-[15px] text-ink mb-2">{t('related_words')}</h2>
            <ul className="divide-y divide-line/50">
              {relatedWords.slice(0, 4).map(w => {
                const m = w.meanings?.[0]
                const snippet = locale === 'en' ? (m?.en || m?.vi) : (m?.vi || m?.en)
                return (
                  <li key={w.id}>
                    <Link
                      href={`/tieng-nhat/tu-dien/${encodeURIComponent(w.word)}`}
                      className="group flex items-baseline gap-2 py-2"
                    >
                      <span lang="ja" className="text-[15px] font-bold text-ink group-hover:text-rose transition-colors shrink-0">
                        {w.word}
                      </span>
                      {w.reading && w.reading !== w.word && (
                        <span lang="ja" className="text-[11px] text-muted shrink-0">{w.reading}</span>
                      )}
                      {snippet && (
                        <span className="text-[12px] text-muted truncate">{cleanMeaningText(snippet)}</span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </aside>

      </div>

      {/* Full related words — below the 2-column layout, inside the same container */}
      {relatedWords.length > 0 && (
        <section className="mt-10">
          <h2 className="font-serif font-bold text-[17px] text-ink mb-4">{t('related_words')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {relatedWords.slice(0, 6).map(w => (
              <WordCard
                key={w.id}
                word={w}
                locale={locale}
                actionSlot={
                  <BookmarkButton
                    itemId={w.id}
                    itemType="word"
                    initialBookmarked={bookmarkedSet.has(w.id)}
                    loginMessage={!user ? t('login_to_save') : undefined}
                  />
                }
                footerSlot={
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-line/40">
                    <CopyButton text={w.word} label={tCopy} copiedLabel={tCopied} />
                    <Link
                      href={`/tieng-nhat/tu-dien/${encodeURIComponent(w.word)}`}
                      className="flex items-center gap-1 text-[11px] font-medium text-muted hover:text-rose transition-colors"
                    >
                      {tViewDetail}
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </div>
                }
              />
            ))}
          </div>
          {word.jlpt_level && (
            <div className="mt-5 text-center">
              <Link
                href={`/tieng-nhat/tu-vung/${urlLevel(word.jlpt_level)}`}
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-rose border border-rose/30 bg-rose/5 hover:bg-rose/10 px-4 py-2 rounded-full transition-colors"
              >
                {t('view_more')}
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
