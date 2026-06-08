import Link from 'next/link'
import { redirect } from 'next/navigation'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import type { JapaneseGrammar } from '@/components/japanese/GrammarCard'
import GrammarClient from './GrammarClient'

export const metadata = { title: 'Admin · Ngữ pháp · Chợ Cóc FKO' }
export const dynamic = 'force-dynamic'

export type AdminGrammar = JapaneseGrammar & { is_published: boolean }

export default async function GrammarAdminPage() {
  if (!(await checkIsAdmin())) redirect('/')

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
        <Link href="/admin/tieng-nhat" className="hover:text-rose transition-colors">Tiếng Nhật</Link>
        <span>/</span>
        <span className="text-ink">Ngữ pháp</span>
      </nav>

      <div className="mb-8">
        <h1 className="font-serif font-bold text-[24px] text-ink">✏️ Quản lý Ngữ pháp</h1>
        <p className="text-[13px] text-muted mt-1">Thêm, sửa và quản lý ngữ pháp trong bảng japanese_grammar</p>
      </div>

      <GrammarClient initialGrammar={(data as AdminGrammar[]) ?? []} />
    </div>
  )
}
