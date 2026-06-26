import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import ImportClient from './ImportClient'

export async function generateMetadata() {
  const t = await getTranslations('admin_jp')
  return { title: `Admin · ${t('import_data')}` }
}
export const dynamic = 'force-dynamic'

export default async function ImportPage() {
  if (!(await checkIsAdmin())) redirect('/')

  const t = await getTranslations('admin_jp')

  return (
    <div className="max-w-[960px] mx-auto px-6 py-10">
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8">
        <Link href="/admin" className="hover:text-rose transition-colors">Admin</Link>
        <span>/</span>
        <Link href="/admin/japanese" className="hover:text-rose transition-colors">{t('breadcrumb')}</Link>
        <span>/</span>
        <span className="text-ink">{t('import_data')}</span>
      </nav>

      <div className="mb-8">
        <h1 className="font-serif font-bold text-[24px] text-ink">📥 {t('import_data')}</h1>
        <p className="text-[13px] text-muted mt-1">
          {t('import_page_desc')}
        </p>
      </div>

      <ImportClient />
    </div>
  )
}
