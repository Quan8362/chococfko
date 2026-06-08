import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import DictionaryClient from './DictionaryClient'
import { getBookmarkIds } from '../bookmark-actions'
import type { JapaneseWord } from '@/components/japanese/WordCard'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('japanese')
  return { title: `${t('dictionary')} · ${t('page_heading')} · Chợ Cóc FKO` }
}

async function getWords(query: string): Promise<JapaneseWord[]> {
  const supabase = createClient()
  const q = query.trim()

  let builder = supabase
    .from('japanese_words')
    .select('id,word,reading,romaji,jlpt_level,pos,meanings,examples,tags,frequency')
    .eq('is_published', true)
    .order('frequency', { ascending: false })
    .limit(20)

  if (q) {
    builder = builder.or(
      `word.ilike.%${q}%,` +
      `reading.ilike.%${q}%,` +
      `romaji.ilike.%${q}%,` +
      `search_text.ilike.%${q}%`
    )
  }

  const { data } = await builder
  return (data as JapaneseWord[]) ?? []
}

interface Props {
  searchParams: { q?: string }
}

export default async function DictionaryPage({ searchParams }: Props) {
  const t = await getTranslations('japanese')
  const initialQuery = searchParams.q?.trim() ?? ''
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [initialWords, initialBookmarkedWordIds] = await Promise.all([
    getWords(initialQuery),
    user ? getBookmarkIds('word') : Promise.resolve([] as string[]),
  ])

  return (
    <div className="max-w-[960px] mx-auto px-5 sm:px-6 py-10 pb-20">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8">
        <Link href="/tieng-nhat" className="hover:text-rose transition-colors">
          {t('page_heading')}
        </Link>
        <span>/</span>
        <span className="text-ink">{t('dictionary')}</span>
      </nav>

      {/* Page header */}
      <div className="mb-8">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold tracking-[2.5px] uppercase text-rose bg-rose/10 border border-rose/20 px-3 py-1.5 rounded-full mb-4">
          📖 {t('dictionary')}
        </span>
        <h1 className="font-serif font-bold text-[clamp(24px,4vw,36px)] leading-tight tracking-[-0.4px] text-ink mb-2">
          {t('dict_heading')}
        </h1>
        <p className="text-[14px] text-muted">{t('dict_desc')}</p>
      </div>

      {/* Client search + results */}
      <DictionaryClient
        initialWords={initialWords}
        initialQuery={initialQuery}
        isLoggedIn={!!user}
        initialBookmarkedWordIds={initialBookmarkedWordIds}
      />
    </div>
  )
}
