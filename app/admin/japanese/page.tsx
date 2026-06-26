import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'

export async function generateMetadata() {
  const t = await getTranslations('admin_jp')
  return { title: `Admin · ${t('breadcrumb')}` }
}
export const dynamic = 'force-dynamic'

export default async function JapaneseAdminPage() {
  if (!(await checkIsAdmin())) redirect('/')

  const t = await getTranslations('admin_jp')
  const admin = createAdminClient()
  const [words, kanji, grammar, quiz, comments] = await Promise.all([
    admin.from('japanese_words').select('id,is_published', { count: 'exact' }).then(r => ({
      total: r.count ?? 0,
      published: r.data?.filter(x => x.is_published).length ?? 0,
    })),
    admin.from('japanese_kanji').select('id,is_published', { count: 'exact' }).then(r => ({
      total: r.count ?? 0,
      published: r.data?.filter(x => x.is_published).length ?? 0,
    })),
    admin.from('japanese_grammar').select('id,is_published', { count: 'exact' }).then(r => ({
      total: r.count ?? 0,
      published: r.data?.filter(x => x.is_published).length ?? 0,
    })),
    admin.from('jp_quiz_questions').select('id,is_published', { count: 'exact' }).then(r => ({
      total: r.count ?? 0,
      published: r.data?.filter(x => x.is_published).length ?? 0,
    })),
    admin.from('japanese_comments').select('id,status', { count: 'exact' }).then(r => ({
      total: r.count ?? 0,
      published: r.data?.filter(x => x.status === 'approved').length ?? 0,
    })).then(s => s, () => ({ total: 0, published: 0 })),
  ])

  const sections = [
    { emoji: '📖', label: t('section_dictionary'), href: '/admin/japanese/dictionary', stats: words, color: 'rose' },
    { emoji: '漢', label: 'Kanji', href: '/admin/japanese/kanji', stats: kanji, color: 'amber' },
    { emoji: '✏️', label: t('section_grammar'), href: '/admin/japanese/grammar', stats: grammar, color: 'violet' },
    { emoji: '🎯', label: 'Quiz', href: '/admin/japanese/quiz', stats: quiz, color: 'teal' },
    { emoji: '💬', label: t('section_comments'), href: '/admin/japanese/comments', stats: comments, color: 'rose' },
  ]

  const quickLinks = [
    { emoji: '🩺', label: t('dq'), href: '/admin/japanese/data-quality' },
  ]

  return (
    <div className="max-w-[960px] mx-auto px-6 py-10">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8">
        <Link href="/admin" className="hover:text-rose transition-colors">Admin</Link>
        <span>/</span>
        <span className="text-ink">{t('breadcrumb')}</span>
      </nav>

      <div className="flex items-start justify-between gap-4 mb-8 flex-wrap">
        <div>
          <h1 className="font-serif font-bold text-[28px] text-ink mb-1">🇯🇵 {t('hub_title')}</h1>
          <p className="text-[14px] text-muted">{t('hub_subtitle')}</p>
        </div>
        <Link href="/admin/japanese/import"
          className="flex items-center gap-2 px-4 py-2.5 bg-cream border border-line rounded-xl text-[13px] font-semibold text-ink hover:border-rose/40 hover:text-rose transition-colors shrink-0">
          📥 {t('import_data')}
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {sections.map(s => (
          <Link key={s.href} href={s.href}
            className="bg-paper border border-line rounded-2xl p-5 hover:border-rose/30 hover:shadow-sm hover:-translate-y-0.5 transition-all group">
            <div className="text-[32px] mb-3">{s.emoji}</div>
            <h2 className="font-serif font-bold text-[16px] text-ink group-hover:text-rose transition-colors mb-3">
              {s.label}
            </h2>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted">{t('stat_total')}</span>
                <span className="font-bold text-ink">{s.stats.total}</span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted">{t('stat_published')}</span>
                <span className="font-semibold text-emerald-600">{s.stats.published}</span>
              </div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted">{t('stat_hidden')}</span>
                <span className="font-semibold text-amber-600">{s.stats.total - s.stats.published}</span>
              </div>
            </div>
            <div className="mt-4 text-[11px] font-semibold text-rose flex items-center gap-1 group-hover:gap-1.5 transition-all">
              {t('manage')}
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 mt-6">
        {quickLinks.map(l => (
          <Link key={l.href} href={l.href}
            className="flex items-center gap-2 px-4 py-2.5 bg-cream border border-line rounded-xl text-[13px] font-semibold text-ink hover:border-rose/40 hover:text-rose transition-colors">
            {l.emoji} {l.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
