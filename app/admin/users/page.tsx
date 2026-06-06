import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('admin')
  return { title: `Admin · ${t('manage_users_title')} · Chợ Cóc FKO` }
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

type UserRow = {
  id: string
  email: string
  displayName: string
  avatarUrl: string | null
  provider: string
  createdAt: string
  lastSignIn: string | null
  isAdmin: boolean
  postCount: number
  placeCount: number
}

function fmt(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('vi-VN', {
    timeZone: 'Asia/Tokyo',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
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

  const PROVIDER_BADGE: Record<string, string> = {
    google:   'bg-blue-50 text-blue-700 border-blue-200',
    facebook: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    email:    'bg-paper text-muted border-line',
  }

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
          { label: admin_t('stat_total'), value: totalUsers, color: 'text-ink',       border: 'border-l-gold' },
          { label: 'Email/pass',          value: emailCount,  color: 'text-muted',     border: 'border-l-line' },
          { label: 'Google',              value: googleCount, color: 'text-blue-600',  border: 'border-l-blue-400' },
          { label: 'Facebook',            value: fbCount,     color: 'text-indigo-600',border: 'border-l-indigo-400' },
          { label: 'Admin',               value: adminCount,  color: 'text-amber-600', border: 'border-l-amber-400' },
        ].map((s) => (
          <div key={s.label} className={`bg-paper shadow-card rounded-xl p-4 border-l-4 ${s.border}`}>
            <div className={`text-[28px] font-bold leading-none mb-1 ${s.color}`}>{s.value}</div>
            <div className="text-[11.5px] text-muted font-medium">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Table header */}
      <div className="hidden sm:grid grid-cols-[2fr_1fr_1.4fr_1.4fr_70px_70px_70px] gap-3 px-4 py-2 text-[11.5px] font-semibold text-muted uppercase tracking-[0.5px] border-b border-line mb-1">
        <span>{admin_t('col_users')}</span>
        <span>{admin_t('col_provider')}</span>
        <span>{admin_t('col_registered_date')}</span>
        <span>{admin_t('col_last_signin')}</span>
        <span className="text-center">{admin_t('col_posts')}</span>
        <span className="text-center">{admin_t('col_places')}</span>
        <span className="text-center">{admin_t('col_role')}</span>
      </div>

      {/* User list */}
      <div className="space-y-1.5">
        {users.map((u) => (
          <div
            key={u.id}
            className={`bg-paper border rounded-xl px-4 py-3.5 grid grid-cols-1 sm:grid-cols-[2fr_1fr_1.4fr_1.4fr_70px_70px_70px] gap-2 sm:gap-3 sm:items-center transition-all hover:border-rose/25 hover:shadow-sm ${
              u.isAdmin ? 'border-amber-200 bg-amber-50/30' : 'border-line'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full flex-none overflow-hidden bg-gradient-to-br from-rose/30 to-teal/30 grid place-items-center text-[14px] font-bold text-ink">
                {u.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  u.displayName[0]?.toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-[13.5px] text-ink truncate leading-snug">{u.displayName}</div>
                <div className="text-[11.5px] text-muted truncate">{u.email}</div>
              </div>
            </div>

            <div>
              <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-[3px] rounded-full border capitalize ${PROVIDER_BADGE[u.provider] ?? PROVIDER_BADGE.email}`}>
                {u.provider}
              </span>
            </div>

            <div className="text-[11.5px] text-muted leading-snug">
              {fmt(u.createdAt)}
            </div>

            <div className="text-[11.5px] text-muted leading-snug">
              {u.lastSignIn ? fmt(u.lastSignIn) : (
                <span className="text-muted/50 italic">{admin_t('last_signin_none')}</span>
              )}
            </div>

            <div className="text-center">
              <span className="text-[14px] font-bold text-ink">{u.postCount}</span>
              <div className="text-[10px] text-muted">{admin_t('unit_posts')}</div>
            </div>

            <div className="text-center">
              <span className="text-[14px] font-bold text-ink">{u.placeCount}</span>
              <div className="text-[10px] text-muted">{admin_t('unit_places')}</div>
            </div>

            <div className="text-center">
              {u.isAdmin ? (
                <span className="inline-flex text-[11px] font-semibold px-2 py-[3px] rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                  Admin
                </span>
              ) : (
                <span className="inline-flex text-[11px] font-semibold px-2 py-[3px] rounded-full bg-paper text-muted border border-line">
                  {admin_t('role_user')}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {users.length === 0 && (
        <div className="bg-paper border border-line rounded-2xl py-16 px-8 text-center">
          <div className="text-[40px] mb-3">👥</div>
          <p className="text-[15px] text-muted">{admin_t('no_users_empty')}</p>
        </div>
      )}
    </div>
  )
}
