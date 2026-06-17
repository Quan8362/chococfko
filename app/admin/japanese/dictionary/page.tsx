import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import type { JapaneseWord } from '@/components/japanese/WordCard'
import WordsClient from './WordsClient'

export async function generateMetadata() {
  const t = await getTranslations('admin_jp')
  return { title: `Admin · ${t('section_dictionary')} · Chợ Cóc FKO` }
}
export const dynamic = 'force-dynamic'

export type AdminWord = JapaneseWord & { is_published: boolean }

export default async function WordsAdminPage() {
  if (!(await checkIsAdmin())) redirect('/')

  const t = await getTranslations('admin_jp')
  const admin = createAdminClient()
  const { data } = await admin
    .from('japanese_words')
    .select('id,word,reading,romaji,jlpt_level,pos,meanings,examples,tags,frequency,is_published')
    .order('frequency', { ascending: false })
    .limit(500)

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-10">
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8">
        <Link href="/admin" className="hover:text-rose transition-colors">Admin</Link>
        <span>/</span>
        <Link href="/admin/japanese" className="hover:text-rose transition-colors">{t('breadcrumb')}</Link>
        <span>/</span>
        <span className="text-ink">{t('section_dictionary')}</span>
      </nav>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-serif font-bold text-[24px] text-ink">📖 {t('page_dict_heading')}</h1>
          <p className="text-[13px] text-muted mt-1">{t('page_dict_subtitle')}</p>
        </div>
      </div>

      <WordsClient initialWords={(data as AdminWord[]) ?? []} />
    </div>
  )
}
