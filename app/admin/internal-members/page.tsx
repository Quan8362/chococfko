import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import AdminInternalMembersClient, { type MemberRow } from './AdminInternalMembersClient'

export const dynamic = 'force-dynamic'
export const metadata = { robots: { index: false, follow: false } }

type AuthUser = {
  id: string
  email: string
  created_at: string
  user_metadata: { display_name?: string; avatar_url?: string }
}

export default async function AdminInternalMembersPage() {
  if (!(await checkIsAdmin())) redirect('/')

  const t = await getTranslations('access')
  const admin = createAdminClient()
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean)

  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const authUsers: AuthUser[] = (authData?.users ?? []) as AuthUser[]
  const emailById = new Map<string, string>()
  for (const u of authUsers) emailById.set(u.id, u.email)

  const { data: profilesData } = await admin.from('profiles').select('id, display_name, avatar_url')
  const profileMap = new Map<string, { display_name: string | null; avatar_url: string | null }>()
  for (const p of (profilesData ?? []) as { id: string; display_name: string | null; avatar_url: string | null }[]) {
    profileMap.set(p.id, p)
  }

  const { data: memberData } = await admin
    .from('internal_members')
    .select('user_id, status, approved_at, approved_by, revoked_at')
  type Mem = { user_id: string; status: string; approved_at: string | null; approved_by: string | null; revoked_at: string | null }
  const memberMap = new Map<string, Mem>()
  for (const m of (memberData ?? []) as Mem[]) memberMap.set(m.user_id, m)

  const rows: MemberRow[] = authUsers.map((u) => {
    const profile = profileMap.get(u.id)
    const mem = memberMap.get(u.id)
    const status: MemberRow['status'] =
      mem?.status === 'active' ? 'active' : mem?.status === 'revoked' ? 'revoked' : 'community'
    return {
      id: u.id,
      email: u.email,
      displayName: profile?.display_name || u.user_metadata?.display_name || u.email?.split('@')[0] || '—',
      avatarUrl: profile?.avatar_url ?? null,
      status,
      approvedAt: status === 'active' ? mem?.approved_at ?? null : null,
      approvedByEmail: mem?.approved_by ? (emailById.get(mem.approved_by) ?? null) : null,
      revokedAt: status === 'revoked' ? mem?.revoked_at ?? null : null,
      isAdmin: adminEmails.includes(u.email),
    }
  }).sort((a, b) => a.displayName.localeCompare(b.displayName))

  const activeCount = rows.filter(r => r.status === 'active').length
  const communityCount = rows.filter(r => r.status === 'community').length
  const revokedCount = rows.filter(r => r.status === 'revoked').length

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-10">
      <Link href="/admin" className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-rose transition-colors mb-3">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('admin_back')}
      </Link>

      <div className="mb-8">
        <h1 className="font-serif font-bold text-[30px] tracking-[-0.3px] leading-tight text-ink mb-1">
          🔒 {t('admin_members_title')}
        </h1>
        <p className="text-[14px] text-muted">{t('admin_members_subtitle')}</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-8">
        {[
          { label: t('status_active'),    value: activeCount,    border: 'border-l-emerald-400', color: 'text-emerald-600' },
          { label: t('status_community'), value: communityCount, border: 'border-l-gold',        color: 'text-ink' },
          { label: t('status_revoked'),   value: revokedCount,   border: 'border-l-red-400',     color: 'text-red-500' },
        ].map((s) => (
          <div key={s.label} className={`bg-paper shadow-card rounded-xl p-4 border-l-4 ${s.border}`}>
            <div className={`text-[28px] font-bold leading-none mb-1 ${s.color}`}>{s.value}</div>
            <div className="text-[11.5px] text-muted font-medium">{s.label}</div>
          </div>
        ))}
      </div>

      <AdminInternalMembersClient rows={rows} />
    </div>
  )
}
