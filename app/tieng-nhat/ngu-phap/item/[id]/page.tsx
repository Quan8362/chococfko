import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { dbLevel, urlLevel } from '@/components/japanese/LevelPicker'
import JlptBadge from '@/components/japanese/JlptBadge'
import BookmarkButton from '@/components/japanese/BookmarkButton'
import type { JapaneseGrammar } from '@/components/japanese/GrammarCard'
import { getBookmarkIds } from '../../../bookmark-actions'
import { getJapaneseComments } from '../../../comment-actions'
import JapaneseComments from '../../../JapaneseComments'

export const dynamic = 'force-dynamic'

const SELECT = 'id,pattern,jlpt_level,meaning_vi,meaning_en,structure,notes,examples,tags'

async function fetchGrammar(id: string): Promise<JapaneseGrammar | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('japanese_grammar')
    .select(SELECT)
    .eq('id', id)
    .eq('is_published', true)
    .maybeSingle()
  return (data as JapaneseGrammar | null) ?? null
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const g = await fetchGrammar(params.id)
  const t = await getTranslations('japanese')
  if (!g) return { title: `${t('grammar_heading')} · Chợ Cóc FKO` }
  return {
    title: `${g.pattern} · ${g.jlpt_level ?? ''} ${t('grammar_heading')} · Chợ Cóc FKO`,
    description: g.meaning_vi ?? g.meaning_en ?? undefined,
  }
}

export default async function GrammarDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const [t, locale, { data: { user } }, grammar] = await Promise.all([
    getTranslations('japanese'),
    getLocale(),
    supabase.auth.getUser(),
    fetchGrammar(params.id),
  ])

  if (!grammar) notFound()

  const [comments, isAdmin, bookmarkIds] = await Promise.all([
    getJapaneseComments('grammar', grammar.id),
    checkIsAdmin(),
    user ? getBookmarkIds('grammar') : Promise.resolve([] as string[]),
  ])

  const isBookmarked = new Set(bookmarkIds).has(grammar.id)
  const meaning = locale === 'en'
    ? (grammar.meaning_en ?? grammar.meaning_vi)
    : (grammar.meaning_vi ?? grammar.meaning_en)
  const examples = grammar.examples ?? []
  const levelUrl = grammar.jlpt_level ? urlLevel(grammar.jlpt_level) : ''
  const currentUser = user
    ? { id: user.id, name: (user.user_metadata?.display_name as string | undefined) || user.email?.split('@')[0] || 'User' }
    : null
  const pagePath = `/tieng-nhat/ngu-phap/item/${grammar.id}`

  return (
    <div className="max-w-[860px] mx-auto px-5 sm:px-6 py-10 pb-20">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-7 flex-wrap">
        <Link href="/tieng-nhat" className="hover:text-rose transition-colors">{t('page_heading')}</Link>
        <span>/</span>
        <Link href="/tieng-nhat/ngu-phap" className="hover:text-rose transition-colors">{t('grammar_heading')}</Link>
        {grammar.jlpt_level && dbLevel(levelUrl) && (
          <>
            <span>/</span>
            <Link href={`/tieng-nhat/ngu-phap/${levelUrl}`} className="hover:text-rose transition-colors">
              {grammar.jlpt_level}
            </Link>
          </>
        )}
      </nav>

      {/* Main card */}
      <div className="bg-paper border border-line rounded-3xl p-6 sm:p-8 shadow-sm">

        {/* Header: pattern + badge + bookmark */}
        <div className="flex items-start justify-between gap-4 mb-5">
          <h1
            lang="ja"
            className="text-[30px] sm:text-[38px] font-bold text-rose leading-tight"
            style={{ fontFamily: "'Noto Serif JP', 'Noto Sans JP', serif" }}
          >
            {grammar.pattern}
          </h1>
          <div className="flex items-center gap-2 shrink-0 pt-1">
            {grammar.jlpt_level && <JlptBadge level={grammar.jlpt_level} />}
            <BookmarkButton
              itemId={grammar.id}
              itemType="grammar"
              initialBookmarked={isBookmarked}
              loginMessage={!user ? t('login_to_save') : undefined}
            />
          </div>
        </div>

        {/* Meaning */}
        {meaning && (
          <p className="text-[17px] font-semibold text-ink leading-snug mb-6">{meaning}</p>
        )}

        {/* Structure */}
        {grammar.structure && (
          <div className="mb-6">
            <p className="text-[10.5px] font-bold text-muted uppercase tracking-wide mb-2">{t('grammar_structure')}</p>
            <code
              lang="ja"
              className="block text-[14px] text-ink bg-cream border border-line rounded-xl px-4 py-3 leading-relaxed"
              style={{ fontFamily: "'Noto Sans JP', sans-serif" }}
            >
              {grammar.structure}
            </code>
          </div>
        )}

        {/* Notes */}
        {grammar.notes && (
          <div className="mb-6 p-4 bg-cream/60 rounded-2xl border border-line/60">
            <p className="text-[10.5px] font-bold text-muted uppercase tracking-wide mb-2">{t('grammar_notes')}</p>
            <p className="text-[13.5px] text-muted leading-relaxed">{grammar.notes}</p>
          </div>
        )}

        {/* Examples */}
        {examples.length > 0 && (
          <div>
            <p className="text-[10.5px] font-bold text-muted uppercase tracking-wide mb-3">{t('example')}</p>
            <div className="space-y-4">
              {examples.map((ex, i) => (
                <div key={i} className="border-l-2 border-rose/30 pl-3.5">
                  <p lang="ja" className="text-[16px] font-medium text-ink leading-relaxed">{ex.ja}</p>
                  {ex.reading && <p lang="ja" className="text-[12px] text-muted mt-0.5">{ex.reading}</p>}
                  <p className="text-[13px] text-muted mt-0.5 italic">
                    {locale === 'en' ? ex.en : ex.vi}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {grammar.tags && grammar.tags.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-1.5">
            {grammar.tags.map(tag => (
              <span key={tag} className="text-[11px] bg-cream border border-line text-muted px-2.5 py-0.5 rounded-full">
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Comments */}
      <JapaneseComments
        itemType="grammar"
        itemId={grammar.id}
        comments={comments}
        currentUser={currentUser}
        isAdmin={isAdmin}
        pagePath={pagePath}
      />
    </div>
  )
}
