import Link from 'next/link'
import { redirect } from 'next/navigation'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import type { JapaneseKanji } from '@/components/japanese/KanjiCard'
import KanjiClient from './KanjiClient'

export const metadata = { title: 'Admin · Kanji · Chợ Cóc FKO' }
export const dynamic = 'force-dynamic'

export type AdminKanji = JapaneseKanji & { is_published: boolean }

export default async function KanjiAdminPage() {
  if (!(await checkIsAdmin())) redirect('/')

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
        <Link href="/admin/tieng-nhat" className="hover:text-rose transition-colors">Tiếng Nhật</Link>
        <span>/</span>
        <span className="text-ink">Kanji</span>
      </nav>

      <div className="mb-8">
        <h1 className="font-serif font-bold text-[24px] text-ink">漢 Quản lý Kanji</h1>
        <p className="text-[13px] text-muted mt-1">Thêm, sửa và quản lý kanji trong bảng japanese_kanji</p>
      </div>

      <KanjiClient initialKanji={(data as AdminKanji[]) ?? []} />
    </div>
  )
}
