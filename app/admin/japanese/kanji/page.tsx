import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import type { JapaneseKanji } from '@/components/japanese/KanjiCard'
import KanjiClient from './KanjiClient'

export const metadata = { title: 'Admin · Kanji' }
export const dynamic = 'force-dynamic'

export type AdminKanji = JapaneseKanji & { is_published: boolean }

export default async function KanjiAdminPage() {
  if (!(await checkIsAdmin())) redirect('/')

  const t = await getTranslations('admin_jp')
  const admin = createAdminClient()
  const { data } = await admin
    .from('japanese_kanji')
    .select('id,character,jlpt_level,onyomi,kunyomi,meanings,stroke_count,radical,examples,tags,is_published')
    .order('jlpt_level', { ascending: true })
    .limit(500)

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-10">
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8">
        <Link href="/admin" className="hover:text-rose transition-colors">Admin</Link>
        <span>/</span>
        <Link href="/admin/japanese" className="hover:text-rose transition-colors">{t('breadcrumb')}</Link>
        <span>/</span>
        <span className="text-ink">Kanji</span>
      </nav>

      <div className="mb-8">
        <h1 className="font-serif font-bold text-[24px] text-ink">漢 {t('page_kanji_heading')}</h1>
        <p className="text-[13px] text-muted mt-1">{t('page_kanji_subtitle')}</p>
      </div>

      <KanjiClient initialKanji={(data as AdminKanji[]) ?? []} />
    </div>
  )
}
