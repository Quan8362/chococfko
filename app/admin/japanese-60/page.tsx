import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { getJp60Settings } from '@/app/games/japanese-60/actions'
import { SettingsForm } from './SettingsForm'
import { ReportRow, type ReportDTO } from './ReportRow'
import { PreviewPanel } from './PreviewPanel'

export const dynamic = 'force-dynamic'

export async function generateMetadata() {
  const t = await getTranslations('admin_jp60')
  return { title: `Admin · ${t('breadcrumb')} · Chợ Cóc FKO` }
}

export default async function Jp60AdminPage() {
  if (!(await checkIsAdmin())) redirect('/')
  const t = await getTranslations('admin_jp60')
  const settings = await getJp60Settings()
  const admin = createAdminClient()

  const [sessionsRes, completedRes, suspiciousRes, reportsRes, disabledRes, levelCounts] = await Promise.all([
    admin.from('jp60_sessions').select('id', { count: 'exact', head: true }),
    admin.from('jp60_results').select('session_id', { count: 'exact', head: true }),
    admin.from('jp60_sessions').select('id', { count: 'exact', head: true }).eq('suspicious', true),
    admin.from('jp60_question_reports').select('*').eq('status', 'open').order('created_at', { ascending: false }).limit(50),
    admin.from('jp60_disabled_items').select('source_type,source_id', { count: 'exact', head: true }),
    Promise.all(['N5', 'N4', 'N3', 'N2', 'N1'].map(async (lv) => {
      const [w, k, g] = await Promise.all([
        admin.from('japanese_words').select('id', { count: 'exact', head: true }).eq('jlpt_level', lv).eq('is_published', true),
        admin.from('japanese_kanji').select('id', { count: 'exact', head: true }).eq('jlpt_level', lv).eq('is_published', true),
        admin.from('japanese_grammar').select('id', { count: 'exact', head: true }).eq('jlpt_level', lv).eq('is_published', true),
      ])
      return { lv, w: w.count ?? 0, k: k.count ?? 0, g: g.count ?? 0 }
    })),
  ]).catch(() => [{ count: 0 }, { count: 0 }, { count: 0 }, { data: [] }, { count: 0 }, []] as any)

  const reports: ReportDTO[] = (reportsRes.data ?? []).map((r: any) => ({
    id: r.id, sessionId: r.session_id, sourceType: r.source_type, sourceId: r.source_id,
    qType: r.q_type, questionText: r.question_text, correctAnswer: r.correct_answer,
    reason: r.reason, note: r.note, locale: r.locale, createdAt: r.created_at,
  }))

  return (
    <div className="max-w-[760px] mx-auto px-5 sm:px-6 py-8 pb-20">
      <Link href="/admin" className="text-[13px] text-muted hover:text-ink">← {t('back')}</Link>
      <h1 className="font-serif font-bold text-[26px] text-ink mt-2 mb-5">{t('title')}</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Metric label={t('sessions')} value={sessionsRes.count ?? 0} />
        <Metric label={t('completed')} value={completedRes.count ?? 0} />
        <Metric label={t('suspicious')} value={suspiciousRes.count ?? 0} />
        <Metric label={t('disabled_items')} value={disabledRes.count ?? 0} />
      </div>

      <SettingsForm initial={settings} />

      <h2 className="font-serif font-bold text-[18px] text-ink mt-8 mb-3">{t('stats')}</h2>
      <div className="bg-paper border border-line rounded-2xl overflow-hidden mb-8">
        <div className="grid grid-cols-4 px-4 py-2 text-[11px] font-bold uppercase text-muted border-b border-line">
          <span>JLPT</span><span className="text-right">語彙</span><span className="text-right">漢字</span><span className="text-right">文法</span>
        </div>
        {(levelCounts as any[]).map((c) => (
          <div key={c.lv} className="grid grid-cols-4 px-4 py-2 text-[13px] border-b border-line/50 last:border-0 tabular-nums">
            <span className="font-bold text-ink">{c.lv}</span>
            <span className="text-right text-muted">{c.w}</span>
            <span className="text-right text-muted">{c.k}</span>
            <span className="text-right text-muted">{c.g}</span>
          </div>
        ))}
      </div>

      <h2 className="font-serif font-bold text-[18px] text-ink mt-8 mb-3">{t('preview')}</h2>
      <PreviewPanel />

      <h2 className="font-serif font-bold text-[18px] text-ink mt-8 mb-3">{t('reports')} ({reports.length})</h2>
      {reports.length === 0 ? (
        <p className="text-muted text-[14px]">{t('no_reports')}</p>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => <ReportRow key={r.id} r={r} />)}
        </div>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-paper border border-line rounded-xl p-3 text-center">
      <p className="text-[11px] text-muted mb-0.5">{label}</p>
      <p className="text-[22px] font-bold text-ink tabular-nums">{value}</p>
    </div>
  )
}
