import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import AdminUsersClient, { type UserRow } from './AdminUsersClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('admin')
  return { title: `Admin · ${t('manage_users_title')}` }
}

type AuthUser = {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  app_metadata: { provider?: string; providers?: string[] }
  user_metadata: { display_name?: string; avatar_url?: string }
}

type Profile = {
  id: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  area: string | null
}

export default async function AdminUsers() {
  if (!(await checkIsAdmin())) redirect('/')

  const [t, admin_t] = await Promise.all([
    getTranslations('common'),
    getTranslations('admin'),
  ])
  void t

  const admin = createAdminClient()
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean)

  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 200 })
  const authUsers: AuthUser[] = (authData?.users ?? []) as AuthUser[]

  const { data: profilesData } = await admin
    .from('profiles')
    .select('id, display_name, avatar_url, bio, area')
  const profileMap = new Map<string, Profile>()
  for (const p of (profilesData ?? []) as Profile[]) {
    profileMap.set(p.id, p)
  }

  const { data: postsData } = await admin.from('posts').select('user_id')
  const postCountMap = new Map<string, number>()
  for (const row of (postsData ?? []) as { user_id: string }[]) {
    postCountMap.set(row.user_id, (postCountMap.get(row.user_id) ?? 0) + 1)
  }

  const { data: placesData } = await admin.from('places').select('user_id').not('user_id', 'is', null)
  const placeCountMap = new Map<string, number>()
  for (const row of (placesData ?? []) as { user_id: string }[]) {
    if (row.user_id) placeCountMap.set(row.user_id, (placeCountMap.get(row.user_id) ?? 0) + 1)
  }

  // Last activity per user: the latest analytics event carrying their user_id.
  // last_sign_in_at only updates on an explicit re-login, so a user browsing with
  // a persistent session looks "inactive" there — this reflects real visits.
  // Page newest-first, keeping the first (latest) hit per user; stop once every
  // user is covered or after a bounded scan.
  const lastActivityMap = new Map<string, string>()
  const ACT_PAGE = 1000
  for (let from = 0; from < 20000; from += ACT_PAGE) {
    const { data } = await admin
      .from('analytics_events')
      .select('user_id, created_at')
      .not('user_id', 'is', null)
      .order('created_at', { ascending: false })
      .range(from, from + ACT_PAGE - 1)
    if (!data || data.length === 0) break
    for (const row of data as { user_id: string; created_at: string }[]) {
      if (!lastActivityMap.has(row.user_id)) lastActivityMap.set(row.user_id, row.created_at)
    }
    if (data.length < ACT_PAGE || lastActivityMap.size >= authUsers.length) break
  }

  const users: UserRow[] = authUsers.map((u) => {
    const profile = profileMap.get(u.id)
    const provider = u.app_metadata?.provider ?? 'email'
    return {
      id: u.id,
      email: u.email,
      displayName: profile?.display_name || u.user_metadata?.display_name || u.email?.split('@')[0] || '—',
      avatarUrl: profile?.avatar_url ?? null,
      provider,
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at,
      lastActivity: lastActivityMap.get(u.id) ?? null,
      isAdmin: adminEmails.includes(u.email),
      postCount: postCountMap.get(u.id) ?? 0,
      placeCount: placeCountMap.get(u.id) ?? 0,
    }
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const totalUsers = users.length
  const adminCount = users.filter(u => u.isAdmin).length
  const googleCount = users.filter(u => u.provider === 'google').length
  const fbCount = users.filter(u => u.provider === 'facebook').length
  const emailCount = users.filter(u => u.provider === 'email').length

  return (
    <div className="max-w-[1100px] mx-auto px-6 py-10">

      <Link
        href="/admin"
        className="inline-flex items-center gap-1 text-[12.5px] text-muted hover:text-rose transition-colors mb-3"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {admin_t('admin_dashboard_label')}
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-8">
        <div>
          <h1 className="font-serif font-bold text-[30px] tracking-[-0.3px] leading-tight text-ink mb-1">
            {admin_t('manage_users_title')}
          </h1>
          <p className="text-[14px] text-muted">{admin_t('n_users_registered', { n: totalUsers })}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        {[
          { label: admin_t('stat_total'), value: totalUsers, color: 'text-ink',        border: 'border-l-gold'        },
          { label: 'Email/pass',          value: emailCount,  color: 'text-muted',      border: 'border-l-line'        },
          { label: 'Google',              value: googleCount, color: 'text-blue-600',   border: 'border-l-blue-400'    },
          { label: 'Facebook',            value: fbCount,     color: 'text-indigo-600', border: 'border-l-indigo-400'  },
          { label: 'Admin',               value: adminCount,  color: 'text-amber-600',  border: 'border-l-amber-400'   },
        ].map((s) => (
          <div key={s.label} className={`bg-paper shadow-card rounded-xl p-4 border-l-4 ${s.border}`}>
            <div className={`text-[28px] font-bold leading-none mb-1 ${s.color}`}>{s.value}</div>
            <div className="text-[11.5px] text-muted font-medium">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Interactive table: search + filter + pagination */}
      <AdminUsersClient users={users} />

    </div>
  )
}
