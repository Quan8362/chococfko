import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import ProfileForm from './ProfileForm'

export async function generateMetadata() {
  const tm = await getTranslations('meta')
  return { title: `${tm('profile')} · Chợ Cóc FKO` }
}
export const dynamic = 'force-dynamic'

export default async function HoSoPage({
  searchParams,
}: {
  searchParams: { success?: string; error?: string }
}) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const t = await getTranslations('profile')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, bio, area, facebook_url, instagram_url')
    .eq('id', user.id)
    .single()

  const displayName =
    profile?.display_name ||
    user.user_metadata?.display_name ||
    user.email?.split('@')[0] ||
    ''

  return (
    <div className="max-w-[800px] mx-auto px-6 py-10">

      {/* Breadcrumb */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-[13px] text-muted hover:text-rose transition-colors mb-6"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('back_home')}
      </Link>

      {/* Page header */}
      <div className="mb-7">
        <h1 className="font-serif font-bold text-[clamp(24px,3.5vw,32px)] tracking-[-0.3px] text-ink leading-tight mb-1.5">
          {t('title')}
        </h1>
        <p className="text-[15px] text-muted leading-relaxed">
          {t('subtitle')}
        </p>
      </div>

      {/* Form card */}
      <div className="bg-paper border border-line rounded-2xl shadow-card px-7 py-7">
        <ProfileForm
          userId={user.id}
          displayName={displayName}
          email={user.email || ''}
          avatarUrl={profile?.avatar_url}
          bio={profile?.bio}
          area={profile?.area}
          facebookUrl={profile?.facebook_url}
          instagramUrl={profile?.instagram_url}
          successParam={searchParams.success === '1'}
          errorParam={searchParams.error}
        />
      </div>
    </div>
  )
}
