import Link from 'next/link'
import { redirect } from 'next/navigation'
import { checkIsAdmin } from '@/lib/supabase/admin'
import ImportClient from './ImportClient'

export const metadata = { title: 'Admin · Import dữ liệu · Chợ Cóc FKO' }
export const dynamic = 'force-dynamic'

export default async function ImportPage() {
  if (!(await checkIsAdmin())) redirect('/')

  return (
    <div className="max-w-[960px] mx-auto px-6 py-10">
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8">
        <Link href="/admin" className="hover:text-rose transition-colors">Admin</Link>
        <span>/</span>
        <Link href="/admin/tieng-nhat" className="hover:text-rose transition-colors">Tiếng Nhật</Link>
        <span>/</span>
        <span className="text-ink">Import dữ liệu</span>
      </nav>

      <div className="mb-8">
        <h1 className="font-serif font-bold text-[24px] text-ink">📥 Import dữ liệu</h1>
        <p className="text-[13px] text-muted mt-1">
          Nhập dữ liệu hàng loạt từ file JSON hoặc CSV. Chỉ dùng dữ liệu hợp pháp (JMdict, JLPT wordlists open license, v.v.).
        </p>
      </div>

      <ImportClient />
    </div>
  )
}
