import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import {
  claimCurrentUserTournamentInvitations,
  listManageableTournaments,
} from '@/lib/tournaments/members/service'
import TournamentShell from '@/components/tournaments/TournamentShell'
import TournamentManagementList from '@/components/tournaments/management/TournamentManagementList'
import ManagementIcon from '@/components/tournaments/management/ManagementIcon'
import { MANAGEMENT_BASE, listRowStatusCaps } from './_access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Quản lý giải đấu' }

export default async function ManagementListPage() {
  // Anonymous → login. Every other identity is allowed to land here; the list remains scoped below.
  const { data: auth } = await createClient().auth.getUser()
  if (!auth.user) {
    const { redirect } = await import('next/navigation')
    redirect(`/login?next=${encodeURIComponent(MANAGEMENT_BASE)}`)
  }

  const t = await getTranslations('tournament_management')
  const ta = await getTranslations('admin_tournaments')

  // Claim pending invitations before listing so a newly invited manager sees the tournament on the
  // first visit. The live query below remains the only source of list data and permissions.
  await claimCurrentUserTournamentInvitations({ revalidate: false })

  const siteAdmin = await checkIsAdmin()
  const items = await listManageableTournaments()
  const listItems = items.map((item) => ({ ...item, rowCaps: listRowStatusCaps(item.viewerRole) }))

  return (
    <TournamentShell size="wide">
      <header className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3.5 sm:items-center">
          <div className="grid h-12 w-12 flex-none place-items-center rounded-2xl border border-rose/15 bg-rose-soft text-rose shadow-[0_3px_14px_rgba(194,24,91,0.08)]">
            <ManagementIcon name="trophy" className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="font-serif text-[28px] font-bold leading-tight tracking-[-0.35px] text-ink sm:text-[32px]">
                {t('list_title')}
              </h1>
              <span className="inline-flex rounded-full border border-line bg-paper px-2.5 py-1 text-[11.5px] font-semibold text-muted">
                {t('list_count', { count: items.length })}
              </span>
            </div>
            <p className="mt-1 text-[14px] leading-relaxed text-muted">
              {siteAdmin ? t('list_sub_admin') : t('list_sub_scoped')}
            </p>
          </div>
        </div>

        {/* Self-service: every signed-in user may create their own tournament. */}
        <Link
          href={`${MANAGEMENT_BASE}/new`}
          className="inline-flex min-h-11 w-full flex-none items-center justify-center gap-2 rounded-xl bg-rose px-5 text-[13.5px] font-semibold text-white shadow-[0_4px_14px_rgba(194,24,91,0.18)] transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-rose-deep hover:shadow-[0_6px_18px_rgba(194,24,91,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 focus-visible:ring-offset-2 active:translate-y-0 motion-reduce:transform-none sm:w-auto"
        >
          <ManagementIcon name="plus" className="h-4 w-4" />
          {ta('create_cta')}
        </Link>
      </header>

      <TournamentManagementList
        items={listItems}
        basePath={MANAGEMENT_BASE}
        siteAdmin={siteAdmin}
      />
    </TournamentShell>
  )
}
