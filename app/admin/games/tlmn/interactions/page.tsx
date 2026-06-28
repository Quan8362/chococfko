import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { THROWABLES, PHRASES } from '@/lib/games/tlmn/interactions'
import AdminInteractionTable, { type AdminRow } from './AdminInteractionTable'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Admin · TLMN Interactions' }

export default async function AdminTlmnInteractionsPage() {
  if (!(await checkIsAdmin())) redirect('/')
  const t = await getTranslations('admin_tlmn_react')
  const admin = createAdminClient()

  const { data } = await admin
    .from('game_interaction_catalog')
    .select('key, kind, category, coin_cost, free_daily_limit, cooldown_ms, is_enabled, sort_order')
  const dbMap = new Map((data ?? []).map(r => [r.key as string, r]))

  // Merge the code catalog (visuals + the full item set) with the DB config so the admin can
  // manage EVERY item — including ones not yet seeded (shown with defaults; saving creates them).
  const merge = (key: string, kind: 'phrase' | 'throwable', emoji: string, category: string | null): AdminRow => {
    const r = dbMap.get(key)
    return {
      key, kind, emoji,
      category: (r?.category as string | null) ?? category,
      coin_cost: Number(r?.coin_cost ?? 0),
      free_daily_limit: Number(r?.free_daily_limit ?? 0),
      cooldown_ms: Number(r?.cooldown_ms ?? 0),
      is_enabled: r ? !!r.is_enabled : true,
      sort_order: Number(r?.sort_order ?? 0),
      seeded: !!r,
    }
  }
  const rows: AdminRow[] = [
    ...THROWABLES.map(x => merge(x.key, 'throwable', x.emoji, null)),
    ...PHRASES.map(p => merge(p.key, 'phrase', p.emoji, p.category)),
  ].sort((a, b) => (a.kind === b.kind ? a.sort_order - b.sort_order : a.kind === 'throwable' ? -1 : 1))

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-8 pb-20">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="font-serif font-bold text-[24px] text-ink">{t('title')}</h1>
        <Link href="/admin/games/tlmn/reports" className="text-[12px] font-semibold text-rose hover:underline">{t('nav_reports')} →</Link>
      </div>
      <p className="text-[13px] text-muted mb-6">{t('subtitle')}</p>
      <AdminInteractionTable rows={rows} />
    </div>
  )
}
