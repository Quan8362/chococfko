'use client'

// Member-management panel for one tournament — shown to whoever holds members.manage (Site Admin OR
// the tournament's Owner, 15F-1). Renders the membership table + an invite form and calls the scoped
// server actions (which re-check members.manage server-side). This UI is CONVENIENCE only — a
// manager/scorekeeper never receives this component, and even if they did every action is rejected
// server-side. The OWNER row is shown read-only: it can never be re-roled or revoked here.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import ConfirmDialog from './ConfirmDialog'
import {
  inviteMemberAction,
  changeMemberRoleAction,
  revokeMemberAction,
} from '@/app/quan-ly-giai-dau/[id]/members-actions'
import type { TournamentMemberRow } from '@/lib/tournaments/members'

const ROLES = ['manager', 'scorekeeper'] as const

function fmt(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function TournamentMembersPanel({
  tournamentId,
  members,
}: {
  tournamentId: string
  members: TournamentMemberRow[]
}) {
  const t = useTranslations('tournament_members')
  const tr = useTranslations('tournament_roles')
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<(typeof ROLES)[number]>('scorekeeper')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<TournamentMemberRow | null>(null)

  function report(res: { ok: boolean; error?: string }, okMsg: string) {
    if (res.ok) {
      setError(null)
      setNotice(okMsg)
      router.refresh()
      return true
    }
    setNotice(null)
    setError(t(`err_${res.error ?? 'unknown'}`))
    return false
  }

  function onInvite() {
    if (pending) return
    setError(null)
    setNotice(null)
    startTransition(async () => {
      const res = await inviteMemberAction(tournamentId, { email, role })
      if (report(res, t('invited_ok'))) setEmail('')
    })
  }

  function onChangeRole(m: TournamentMemberRow, newRole: string) {
    if (pending || newRole === m.role) return
    startTransition(async () => {
      const res = await changeMemberRoleAction(tournamentId, m.id, newRole, m.version)
      report(res, t('role_changed_ok'))
    })
  }

  function onRevoke(m: TournamentMemberRow) {
    startTransition(async () => {
      const res = await revokeMemberAction(tournamentId, m.id, m.version)
      setConfirmRevoke(null)
      report(res, t('revoked_ok'))
    })
  }

  function onReinvite(m: TournamentMemberRow) {
    if (pending) return
    startTransition(async () => {
      const res = await inviteMemberAction(tournamentId, { email: m.email, role: m.role })
      report(res, t('invited_ok'))
    })
  }

  const statusTone: Record<string, string> = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    revoked: 'bg-red-50 text-red-600 border-red-200',
  }

  return (
    <div>
      <h2 className="font-serif font-bold text-[16px] text-ink mb-1">{t('section_title')}</h2>
      <p className="text-[12.5px] text-muted mb-4">{t('section_hint')}</p>

      {/* Invite form */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          onInvite()
        }}
        className="flex flex-col sm:flex-row gap-2 sm:items-end mb-3"
      >
        <div className="flex-1 min-w-0">
          <label htmlFor="member-email" className="block text-[12px] font-semibold text-muted mb-1">
            {t('email_label')}
          </label>
          <input
            id="member-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('email_placeholder')}
            className="w-full text-[14px] px-3 py-2 rounded-lg bg-cream border border-line text-ink focus:outline-none focus:border-rose/50"
          />
        </div>
        <div>
          <label htmlFor="member-role" className="block text-[12px] font-semibold text-muted mb-1">
            {t('role_label')}
          </label>
          <select
            id="member-role"
            value={role}
            onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
            className="text-[14px] px-3 py-2 rounded-lg bg-cream border border-line text-ink focus:outline-none focus:border-rose/50"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {tr(`role_${r}`)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="flex-none font-semibold text-[13px] px-5 py-2.5 rounded-lg bg-rose text-white hover:bg-rose-deep disabled:opacity-50 transition-all"
        >
          {pending ? t('working') : t('invite_cta')}
        </button>
      </form>

      {error && <p role="alert" className="text-[12.5px] text-rose mb-2">{error}</p>}
      {notice && <p className="text-[12.5px] text-emerald-700 mb-2">{notice}</p>}

      {/* Member table */}
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full min-w-[640px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11.5px] uppercase tracking-wide text-muted border-b border-line">
              <th scope="col" className="py-2 pr-3 font-semibold">{t('col_member')}</th>
              <th scope="col" className="py-2 pr-3 font-semibold">{t('col_role')}</th>
              <th scope="col" className="py-2 pr-3 font-semibold">{t('col_status')}</th>
              <th scope="col" className="py-2 pr-3 font-semibold">{t('col_invited')}</th>
              <th scope="col" className="py-2 pr-3 font-semibold">{t('col_accepted')}</th>
              <th scope="col" className="py-2 pr-3 font-semibold text-right">{t('col_actions')}</th>
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-6 text-center text-muted text-[13px]">
                  {t('empty')}
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.id} className="border-b border-line/60">
                  <td className="py-2.5 pr-3 min-w-0">
                    <div className="font-medium text-ink truncate max-w-[240px]">{m.displayName || m.email}</div>
                    {m.displayName && <div className="text-[11.5px] text-muted truncate max-w-[240px]">{m.email}</div>}
                  </td>
                  <td className="py-2.5 pr-3">
                    {m.role === 'owner' ? (
                      // The owner is fixed — shown as a static badge, never a role picker.
                      <span className="inline-block text-[11.5px] font-semibold px-2 py-[3px] rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                        {tr('role_owner')}
                      </span>
                    ) : (
                      <>
                        <label className="sr-only" htmlFor={`role-${m.id}`}>{t('role_label')}</label>
                        <select
                          id={`role-${m.id}`}
                          value={m.role}
                          disabled={pending || m.status === 'revoked'}
                          onChange={(e) => onChangeRole(m, e.target.value)}
                          className="text-[12.5px] px-2 py-1 rounded-lg bg-cream border border-line text-ink disabled:opacity-50 focus:outline-none focus:border-rose/50"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {tr(`role_${r}`)}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className={`inline-block text-[11px] font-semibold px-2 py-[3px] rounded-full border ${statusTone[m.status] ?? ''}`}>
                      {t(`status_${m.status}`)}
                    </span>
                  </td>
                  <td className="py-2.5 pr-3 text-muted whitespace-nowrap">{fmt(m.invitedAt)}</td>
                  <td className="py-2.5 pr-3 text-muted whitespace-nowrap">{fmt(m.acceptedAt)}</td>
                  <td className="py-2.5 pr-3 text-right whitespace-nowrap">
                    {m.role === 'owner' ? (
                      <span className="text-[11.5px] text-muted">{t('owner_locked')}</span>
                    ) : m.status === 'revoked' ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => onReinvite(m)}
                        className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-teal-soft text-teal border border-teal/25 hover:bg-teal hover:text-white hover:border-teal disabled:opacity-50 transition-all"
                      >
                        {t('reinvite')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setError(null)
                          setNotice(null)
                          setConfirmRevoke(m)
                        }}
                        className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 hover:bg-red-500 hover:text-white hover:border-transparent disabled:opacity-50 transition-all"
                      >
                        {t('revoke')}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmRevoke !== null}
        icon="🚫"
        tone="danger"
        title={t('confirm_revoke_title')}
        description={t('confirm_revoke_desc', { email: confirmRevoke?.email ?? '' })}
        confirmLabel={t('revoke')}
        cancelLabel={t('cancel')}
        pending={pending}
        onConfirm={() => confirmRevoke && onRevoke(confirmRevoke)}
        onCancel={() => setConfirmRevoke(null)}
      />
    </div>
  )
}
