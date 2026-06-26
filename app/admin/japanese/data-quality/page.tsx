import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'

export async function generateMetadata() {
  const t = await getTranslations('admin_jp')
  return { title: `Admin · ${t('dq_title')}` }
}
export const dynamic = 'force-dynamic'

type Table = 'japanese_words' | 'japanese_grammar' | 'japanese_kanji'

export default async function DataQualityPage() {
  if (!(await checkIsAdmin())) redirect('/')

  const t = await getTranslations('admin_jp')
  const admin = createAdminClient()

  async function count(table: Table, build?: (q: any) => any): Promise<number> {
    let q = admin.from(table).select('id', { count: 'exact', head: true })
    if (build) q = build(q)
    const { count } = await q
    return count ?? 0
  }

  const [
    wordsMissingReading,
    wordsMissingMeaning,
    grammarMissingMeaning,
    grammarMissingExamples,
    kanjiMissingMeaning,
    kanjiMissingReading,
  ] = await Promise.all([
    count('japanese_words', q => q.or('reading.is.null,reading.eq.')),
    count('japanese_words', q => q.is('meanings', null)),
    count('japanese_grammar', q => q.or('meaning_vi.is.null,meaning_vi.eq.')),
    count('japanese_grammar', q => q.is('examples', null)),
    count('japanese_kanji', q => q.is('meanings', null)),
    count('japanese_kanji', q => q.is('onyomi', null)),
  ])

  const rows = [
    { label: t('dq_words_missing_reading'), value: wordsMissingReading },
    { label: t('dq_words_missing_meaning'), value: wordsMissingMeaning },
    { label: t('dq_grammar_missing_meaning'), value: grammarMissingMeaning },
    { label: t('dq_grammar_missing_examples'), value: grammarMissingExamples },
    { label: t('dq_kanji_missing_meaning'), value: kanjiMissingMeaning },
    { label: t('dq_kanji_missing_reading'), value: kanjiMissingReading },
  ]
  const allGood = rows.every(r => r.value === 0)

  return (
    <div className="max-w-[760px] mx-auto px-6 py-10">
      <nav className="flex items-center gap-1.5 text-[12.5px] text-muted mb-8">
        <Link href="/admin" className="hover:text-rose transition-colors">Admin</Link>
        <span>/</span>
        <Link href="/admin/japanese" className="hover:text-rose transition-colors">{t('breadcrumb')}</Link>
        <span>/</span>
        <span className="text-ink">{t('dq_title')}</span>
      </nav>

      <div className="mb-8">
        <h1 className="font-serif font-bold text-[28px] text-ink mb-1">🩺 {t('dq_title')}</h1>
        <p className="text-[14px] text-muted">{t('dq_subtitle')}</p>
      </div>

      {allGood && (
        <p className="text-[13.5px] text-emerald-600 mb-6">✓ {t('dq_all_good')}</p>
      )}

      <div className="overflow-x-auto border border-line rounded-2xl">
        <table className="w-full text-[13.5px] min-w-[360px]">
          <thead>
            <tr className="bg-cream text-muted">
              <th className="text-left font-semibold px-5 py-3">{t('dq_issue')}</th>
              <th className="text-right font-semibold px-5 py-3">{t('dq_count')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.label} className="border-t border-line">
                <td className="px-5 py-3 text-ink">{r.label}</td>
                <td className={`px-5 py-3 text-right font-bold tabular-nums ${r.value > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {r.value.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
