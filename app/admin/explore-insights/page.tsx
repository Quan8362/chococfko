import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { checkIsAdmin } from '@/lib/supabase/admin';
import { getExploreInsights } from '@/lib/exploreInsights';
import { searchRates, formatPct, formatCount, rate } from '@/lib/metrics';
import { totalFindings } from '@/lib/dataQuality';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  return { title: 'Admin · Explore insights · Chợ Cóc FKO' };
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-paper border border-line rounded-xl p-4">
      <div className="font-serif font-bold text-[22px] text-rose-deep leading-none">{value}</div>
      <div className="text-[12px] text-muted mt-1.5">{label}</div>
    </div>
  );
}

export default async function ExploreInsightsPage() {
  if (!(await checkIsAdmin())) redirect('/');
  const t = await getTranslations('admin_insights');
  const ins = await getExploreInsights();

  const sr = ins.search ? searchRates(ins.search) : null;
  const noData = t('no_data');

  return (
    <div className="max-w-[960px] mx-auto px-6 py-10">
      <Link href="/admin" className="text-[13px] text-muted hover:text-rose">← Admin</Link>
      <h1 className="font-serif font-bold text-[28px] tracking-[-0.3px] text-ink mt-2 mb-1">{t('title')}</h1>
      <p className="text-[13px] text-muted mb-8">{t('sub')}</p>

      {/* ── Search quality ── */}
      <h2 className="font-semibold text-[16px] text-ink mb-3">{t('search_heading')}</h2>
      {ins.search === null ? (
        <p className="text-[13px] text-muted mb-8">{noData}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Stat label={t('total_searches')} value={formatCount(ins.search.total)} />
            <Stat label={t('success_rate')} value={formatPct(sr!.successRate)} />
            <Stat label={t('zero_rate')} value={formatPct(sr!.zeroResultRate)} />
            <Stat label={t('ctr')} value={formatPct(sr!.clickThroughRate)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            <div className="bg-paper border border-line rounded-xl p-4">
              <p className="font-semibold text-[13px] text-ink mb-2">{t('top_queries')}</p>
              {ins.search.topQueries.length ? (
                <ul className="text-[13px] text-muted space-y-1">{ins.search.topQueries.map((q) => <li key={q.q} className="flex justify-between gap-3"><span className="truncate">{q.q}</span><span>{q.n}</span></li>)}</ul>
              ) : <p className="text-[12px] text-muted">{noData}</p>}
            </div>
            <div className="bg-paper border border-line rounded-xl p-4">
              <p className="font-semibold text-[13px] text-ink mb-2">{t('unmatched_queries')}</p>
              {ins.search.unmatched.length ? (
                <ul className="text-[13px] text-muted space-y-1">{ins.search.unmatched.map((q) => <li key={q.q} className="flex justify-between gap-3"><span className="truncate">{q.q}</span><span>{q.n}</span></li>)}</ul>
              ) : <p className="text-[12px] text-muted">{noData}</p>}
            </div>
          </div>
        </>
      )}

      {/* ── Engagement ── */}
      <h2 className="font-semibold text-[16px] text-ink mb-3">{t('engagement_heading')}</h2>
      {ins.engagement === null ? (
        <p className="text-[13px] text-muted mb-8">{noData}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <Stat label={t('ev_save')} value={formatCount(ins.engagement.place_save)} />
          <Stat label={t('ev_directions')} value={formatCount(ins.engagement.place_directions)} />
          <Stat label={t('ev_reserve')} value={formatCount(ins.engagement.place_reserve_click)} />
          <Stat label={t('ev_share')} value={formatCount(ins.engagement.place_share)} />
        </div>
      )}

      {/* ── Planning ── */}
      <h2 className="font-semibold text-[16px] text-ink mb-3">{t('planning_heading')}</h2>
      {ins.planning === null ? (
        <p className="text-[13px] text-muted mb-8">{noData}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <Stat label={t('lists_created')} value={formatCount(ins.planning.lists)} />
          <Stat label={t('plans_created')} value={formatCount(ins.planning.plans)} />
          <Stat label={t('plans_shared')} value={formatCount(ins.planning.sharedPlans)} />
          <Stat label={t('plan_stops')} value={formatCount(ins.planning.stops)} />
        </div>
      )}

      {/* ── Community ── */}
      <h2 className="font-semibold text-[16px] text-ink mb-3">{t('community_heading')}</h2>
      {ins.community === null ? (
        <p className="text-[13px] text-muted mb-8">{noData}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <Stat label={t('questions')} value={formatCount(ins.community.questions)} />
          <Stat label={t('answer_rate')} value={formatPct(rate(ins.community.answers, ins.community.questions))} />
          <Stat label={t('reports_pending')} value={formatCount(ins.community.reportsPending)} />
          <Stat label={t('reports_resolved')} value={formatCount(ins.community.reportsResolved)} />
        </div>
      )}

      {/* ── Location quality (data-quality audit) ── */}
      <h2 className="font-semibold text-[16px] text-ink mb-1">{t('location_quality_heading')}</h2>
      <p className="text-[12px] text-muted mb-3">{t('location_quality_sub', { total: ins.totalPlaces, issues: totalFindings(ins.locationQuality) })}</p>
      <div className="bg-paper border border-line rounded-xl p-4">
        {Object.keys(ins.locationQuality).length === 0 ? (
          <p className="text-[13px] text-muted">{t('location_quality_clean')}</p>
        ) : (
          <ul className="text-[13px] space-y-1.5">
            {Object.entries(ins.locationQuality).sort((a, b) => b[1].length - a[1].length).map(([code, slugs]) => (
              <li key={code} className="flex justify-between gap-3">
                <span className="text-ink">{t(`dq_${code}` as 'dq_missing_coordinates')}</span>
                <span className="text-rose-deep font-semibold">{slugs.length}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
