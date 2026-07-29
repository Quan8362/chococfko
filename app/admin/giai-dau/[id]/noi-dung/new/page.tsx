import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import { getTournamentForAdmin } from '@/lib/tournaments/admin/queries'
import EventForm from '@/components/tournaments/admin/EventForm'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Thêm nội dung thi đấu' }

export default async function NewEventPage({ params }: { params: { id: string } }) {
  if (!(await checkIsAdmin())) redirect('/')
  const t = await getTranslations('admin_tournament_events')

  const tournament = await getTournamentForAdmin(params.id)
  if (!tournament) notFound()

  return (
    <div className="max-w-[720px] mx-auto px-5 sm:px-6 py-10 pb-20">
      <Link
        href={`/admin/giai-dau/${tournament.id}`}
        className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-rose transition-colors mb-3"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('back_tournament')}
      </Link>
      <h1 className="font-serif font-bold text-[26px] tracking-[-0.3px] text-ink mb-1">{t('add_cta')}</h1>
      <p className="text-[13.5px] text-muted mb-5">{tournament.name}</p>
      <EventForm tournamentId={tournament.id} />
    </div>
  )
}
