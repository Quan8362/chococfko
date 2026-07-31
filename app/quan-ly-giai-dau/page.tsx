import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { checkIsAdmin } from '@/lib/supabase/admin'
import {
  claimCurrentUserTournamentInvitations,
  listManageableTournaments,
} from '@/lib/tournaments/members/service'
import type { TournamentStatus } from '@/lib/tournaments/admin/types'
import StatusBadge from '@/components/tournaments/admin/StatusBadge'
import TournamentStatusActions from '@/components/tournaments/admin/TournamentStatusActions'
import TournamentShell from '@/components/tournaments/TournamentShell'
import { MANAGEMENT_BASE, listRowStatusCaps } from './_access'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Quản lý giải đấu' }

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default async function ManagementListPage() {
  // Anonymous → login. Every other identity is allowed to LAND here; what they see is scoped below.
  const { data: auth } = await createClient().auth.getUser()
  if (!auth.user) {
    const { redirect } = await import('next/navigation')
    redirect(`/login?next=${encodeURIComponent(MANAGEMENT_BASE)}`)
  }

  const t = await getTranslations('tournament_management')
  const ta = await getTranslations('admin_tournaments')
  const tr = await getTranslations('tournament_roles')

  // Claim any pending invitations addressed to this verified email BEFORE listing, so a freshly
  // invited manager sees their tournaments on first visit. revalidate:false — safe during render;
  // the list query below reads live DB state after the claim. Never trusts a client-supplied id.
  await claimCurrentUserTournamentInvitations({ revalidate: false })

  const siteAdmin = await checkIsAdmin()
  const items = await listManageableTournaments()

  const statusLabel = (s: string) => ta(`status_${s as TournamentStatus}`)

  return (
    <TournamentShell size="wide">
      <div className="mb-8">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-serif font-bold text-[28px] sm:text-[30px] tracking-[-0.3px] leading-tight text-ink mb-1">
              🏆 {t('list_title')}
            </h1>
            <p className="text-[14px] text-muted">{siteAdmin ? t('list_sub_admin') : t('list_sub_scoped')}</p>
          </div>
          {/* Self-service (15F-1): every signed-in user may create their own tournament. */}
          <Link
            href={`${MANAGEMENT_BASE}/new`}
            className="flex-none font-semibold text-[13.5px] px-5 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all"
          >
            + {ta('create_cta')}
          </Link>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl py-16 px-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-cream border border-line grid place-items-center text-[22px] mx-auto mb-4 shadow-sm">
            🗂️
          </div>
          <h3 className="font-serif font-bold text-[18px] text-ink mb-2">{t('empty_title')}</h3>
          <p className="text-[13.5px] text-muted max-w-[380px] mx-auto leading-relaxed mb-5">
            {siteAdmin ? t('empty_sub_admin') : t('empty_sub_create')}
          </p>
          <Link
            href={`${MANAGEMENT_BASE}/new`}
            className="inline-flex items-center gap-1.5 font-semibold text-[13.5px] px-5 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all"
          >
            + {ta('create_cta')}
          </Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {items.map((it) => {
            const rc = listRowStatusCaps(it.viewerRole)
            return (
              <div
                key={it.id}
                className="bg-paper border border-line rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center gap-4 hover:border-rose/25 hover:shadow-sm transition-all"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <StatusBadge status={it.status as TournamentStatus} label={statusLabel(it.status)} />
                    <span className="text-[12px] text-muted font-mono">/{it.slug}</span>
                    <span className="text-[11px] font-semibold px-2 py-[3px] rounded-full bg-cream border border-line text-[#5c4d44]">
                      {tr(`role_${it.viewerRole}`)}
                    </span>
                  </div>
                  <h3 className="font-serif font-bold text-[17px] leading-snug text-ink truncate">{it.name}</h3>
                  <div className="text-[12px] text-muted flex items-center flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    <span>📅 {fmtDate(it.startsAt)} → {fmtDate(it.endsAt)}</span>
                    {it.location && <span>📍 {it.location}</span>}
                    <span>🎯 {ta('events_count', { count: it.eventCount })}</span>
                    <span>🕒 {fmtDate(it.updatedAt)}</span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 lg:items-end lg:min-w-[240px]">
                  <div className="flex gap-2 flex-wrap">
                    <Link
                      href={`${MANAGEMENT_BASE}/${it.id}`}
                      className="text-[12.5px] font-semibold px-3 py-[7px] rounded-lg bg-cream text-[#5c4d44] border border-line hover:border-rose/35 hover:text-rose transition-all"
                    >
                      {ta('action_view')}
                    </Link>
                    {rc.canEdit && (
                      <Link
                        href={`${MANAGEMENT_BASE}/${it.id}/edit`}
                        className="text-[12.5px] font-semibold px-3 py-[7px] rounded-lg bg-teal-soft text-teal border border-teal/25 hover:bg-teal hover:text-white hover:border-teal transition-all"
                      >
                        {ta('action_edit')}
                      </Link>
                    )}
                  </div>
                  {rc.showActions && (
                    <TournamentStatusActions
                      id={it.id}
                      status={it.status as TournamentStatus}
                      eventCount={it.eventCount}
                      updatedAt={it.updatedAt}
                      variant="list"
                      basePath={MANAGEMENT_BASE}
                      caps={{ publish: rc.publish, archive: rc.archive, delete: rc.delete }}
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </TournamentShell>
  )
}
