import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { adminSetJpCommentStatus } from '../actions'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('admin_jp')
  return { title: `Admin · ${t('c_title')} · Chợ Cóc FKO` }
}

type Row = {
  id: string
  item_type: string
  item_id: string
  parent_id: string | null
  user_id: string
  content: string
  is_anonymous: boolean
  status: string
  created_at: string
}

const TABS = ['all', 'visible', 'hidden'] as const
type Tab = typeof TABS[number]

export default async function JpCommentsAdminPage({
  searchParams,
}: {
  searchParams: { status?: string }
}) {
  if (!(await checkIsAdmin())) redirect('/')

  const [t, locale] = await Promise.all([getTranslations('admin_jp'), getLocale()])
  const tab: Tab = TABS.includes(searchParams.status as Tab) ? (searchParams.status as Tab) : 'all'
  const admin = createAdminClient()

  let q = admin
    .from('japanese_comments')
    .select('id,item_type,item_id,parent_id,user_id,content,is_anonymous,status,created_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (tab === 'visible') q = q.eq('status', 'approved')
  if (tab === 'hidden') q = q.eq('status', 'deleted')

  const { data } = await q
  const rows = (data as Row[] | null) ?? []

  // Context labels
  const wordIds = Array.from(new Set(rows.filter(r => r.item_type === 'word').map(r => r.item_id)))
  const grammarIds = Array.from(new Set(rows.filter(r => r.item_type === 'grammar').map(r => r.item_id)))
  const userIds = Array.from(new Set(rows.map(r => r.user_id)))

  const [wordsRes, grammarsRes, profilesRes] = await Promise.all([
    wordIds.length ? admin.from('japanese_words').select('id,word').in('id', wordIds) : Promise.resolve({ data: [] }),
    grammarIds.length ? admin.from('japanese_grammar').select('id,pattern').in('id', grammarIds) : Promise.resolve({ data: [] }),
    userIds.length ? admin.from('profiles').select('id,display_name').in('id', userIds) : Promise.resolve({ data: [] }),
  ])
  const wordMap = new Map((wordsRes.data as { id: string; word: string }[] ?? []).map(w => [w.id, w.word]))
  const grammarMap = new Map((grammarsRes.data as { id: string; pattern: string }[] ?? []).map(g => [g.id, g.pattern]))
  const profileMap = new Map((profilesRes.data as { id: string; display_name: string | null }[] ?? []).map(p => [p.id, p.display_name]))

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="max-w-[1000px] mx-auto px-6 py-10">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8">
        <Link href="/admin" className="hover:text-rose transition-colors">Admin</Link>
        <span>/</span>
        <Link href="/admin/tieng-nhat" className="hover:text-rose transition-colors">{t('breadcrumb')}</Link>
        <span>/</span>
        <span className="text-ink">{t('c_title')}</span>
      </nav>

      <div className="mb-6">
        <h1 className="font-serif font-bold text-[24px] text-ink">💬 {t('c_title')}</h1>
        <p className="text-[13px] text-muted mt-1">{t('c_subtitle')}</p>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-6">
        {TABS.map(tk => (
          <Link
            key={tk}
            href={`/admin/tieng-nhat/binh-luan${tk === 'all' ? '' : `?status=${tk}`}`}
            className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${
              tab === tk ? 'bg-rose text-white' : 'bg-cream text-muted hover:text-ink hover:bg-line'
            }`}
          >
            {tk === 'all' ? t('c_filter_all') : tk === 'visible' ? t('c_filter_visible') : t('c_filter_hidden')}
          </Link>
        ))}
      </div>

      {/* List */}
      {rows.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl px-6 py-12 text-center text-[14px] text-muted">
          {t('c_empty')}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map(r => {
            const isWord = r.item_type === 'word'
            const label = isWord ? (wordMap.get(r.item_id) ?? '?') : (grammarMap.get(r.item_id) ?? '?')
            const href = isWord
              ? `/tieng-nhat/tu-dien/${encodeURIComponent(label)}`
              : `/tieng-nhat/ngu-phap/item/${r.item_id}`
            const authorName = profileMap.get(r.user_id) || r.user_id.slice(0, 8)
            const hidden = r.status === 'deleted'

            return (
              <div
                key={r.id}
                className={`bg-paper border rounded-2xl p-4 ${hidden ? 'border-amber-300/70 bg-amber-50/40' : 'border-line'}`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap mb-2">
                  <div className="flex items-center gap-2 flex-wrap text-[12px]">
                    <span className={`font-bold px-2 py-0.5 rounded-full ${isWord ? 'bg-rose/10 text-rose' : 'bg-violet-100 text-violet-700'}`}>
                      {isWord ? t('c_word') : t('c_grammar')}
                    </span>
                    <Link href={href} lang="ja" className="font-semibold text-ink hover:text-rose transition-colors" target="_blank">
                      {label}
                    </Link>
                    {r.parent_id && (
                      <span className="text-[11px] text-muted">↳ {t('c_reply')}</span>
                    )}
                    {r.is_anonymous && (
                      <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded bg-ink/10 text-ink/70">🤫 {t('c_anon')}</span>
                    )}
                  </div>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${hidden ? 'bg-amber-200/70 text-amber-800' : 'bg-emerald-100 text-emerald-700'}`}>
                    {hidden ? t('c_status_hidden') : t('c_status_visible')}
                  </span>
                </div>

                <p className="text-[14px] text-ink leading-relaxed whitespace-pre-wrap break-words mb-2">{r.content}</p>

                <div className="flex items-center justify-between gap-3 flex-wrap text-[11.5px] text-muted">
                  <span>{authorName} · {fmtDate(r.created_at)}</span>
                  <form action={adminSetJpCommentStatus}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="status" value={hidden ? 'approved' : 'deleted'} />
                    <button
                      type="submit"
                      className={`font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                        hidden
                          ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                          : 'border-red-300 text-red-600 hover:bg-red-50'
                      }`}
                    >
                      {hidden ? t('c_restore') : t('c_hide')}
                    </button>
                  </form>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
