import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { getPlaceReports } from '../actions'
import ReportRow from './ReportRow'

export const dynamic = 'force-dynamic'

export default async function PlaceReportsAdmin() {
  if (!(await checkIsAdmin())) redirect('/')
  const t = await getTranslations('place_qa')
  const reports = await getPlaceReports('pending')

  return (
    <div className="max-w-[760px] mx-auto px-6 py-10">
      <Link href="/admin/places" className="text-[13px] text-muted hover:text-rose">{t('admin_back')}</Link>
      <h1 className="font-serif font-bold text-[28px] tracking-[-0.3px] text-ink mt-2 mb-6">{t('admin_title')}</h1>
      {reports.length === 0 ? (
        <p className="text-[14px] text-muted bg-paper border border-line rounded-2xl p-6">{t('admin_empty')}</p>
      ) : (
        <ul className="space-y-3">{reports.map((r) => <ReportRow key={r.id} report={r} />)}</ul>
      )}
    </div>
  )
}
