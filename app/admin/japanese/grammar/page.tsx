import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import type { JapaneseGrammar } from '@/components/japanese/GrammarCard'
import GrammarClient from './GrammarClient'

export async function generateMetadata() {
  const t = await getTranslations('admin_jp')
  return { title: `Admin · ${t('section_grammar')} · Chợ Cóc FKO` }
}
export const dynamic = 'force-dynamic'

export type AdminGrammar = JapaneseGrammar & { is_published: boolean }

export default async function GrammarAdminPage() {
  if (!(await checkIsAdmin())) redirect('/')

  const t = await getTranslations('admin_jp')
  const admin = createAdminClient()
  const { data } = await admin
    .from('japanese_grammar')
    .select('id,pattern,jlpt_level,meaning_vi,meaning_en,structure,notes,examples,tags,is_published')
    .order('jlpt_level', { ascending: true })
    .limit(500)

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-10">
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8">
        <Link href="/admin" className="hover:text-rose transition-colors">Admin</Link>
        <span>/</span>
        <Link href="/admin/japanese" className="hover:text-rose transition-colors">{t('breadcrumb')}</Link>
        <span>/</span>
        <span className="text-ink">{t('section_grammar')}</span>
      </nav>

      <div className="mb-8">
        <h1 className="font-serif font-bold text-[24px] text-ink">✏️ {t('page_grammar_heading')}</h1>
        <p className="text-[13px] text-muted mt-1">{t('page_grammar_subtitle')}</p>
      </div>

      <GrammarClient initialGrammar={(data as AdminGrammar[]) ?? []} />
    </div>
  )
}
