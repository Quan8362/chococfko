import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getPublishedEvents } from '@/lib/eventsDb';
import { filterEvents, sortEvents, type EventView } from '@/lib/events';
import { prefectureName } from '@/lib/japan';
import EventCard from '@/components/explore/EventCard';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const t = await getTranslations('events');
  return { title: `${t('page_title')}` };
}

const VIEWS: EventView[] = ['today', 'weekend', 'upcoming', 'free'];

export default async function EventsPage({
  searchParams,
}: {
  searchParams: { view?: string; pref?: string };
}) {
  const t = await getTranslations('events');
  const view = (VIEWS.includes(searchParams.view as EventView) ? searchParams.view : 'upcoming') as EventView;
  const pref = searchParams.pref || null;

  const all = await getPublishedEvents();
  const events = sortEvents(filterEvents(all, { view, prefecture: pref }));

  // Prefectures that actually have non-expired published events.
  const prefSet = new Map<string, number>();
  for (const e of filterEvents(all, { view: 'all' })) if (e.prefecture) prefSet.set(e.prefecture, (prefSet.get(e.prefecture) ?? 0) + 1);
  const prefs = Array.from(prefSet.keys());

  const tabHref = (v: EventView) => {
    const sp = new URLSearchParams();
    if (v !== 'upcoming') sp.set('view', v);
    if (pref) sp.set('pref', pref);
    const qs = sp.toString();
    return qs ? `/events?${qs}` : '/events';
  };

  return (
    <div className="max-w-[1100px] mx-auto px-5 sm:px-7 py-10">
      <h1 className="font-serif font-bold text-[30px] tracking-[-0.3px] text-ink mb-1">{t('page_title')}</h1>
      <p className="text-[14px] text-muted mb-6">{t('page_sub')}</p>

      <div className="flex flex-wrap gap-2 mb-5">
        {VIEWS.map((v) => (
          <Link
            key={v}
            href={tabHref(v)}
            className={`text-[13.5px] font-medium px-4 py-2 rounded-full border transition-colors ${view === v ? 'bg-rose text-white border-rose' : 'bg-paper border-line text-ink hover:border-rose'}`}
          >
            {t(`view_${v}` as 'view_today')}
          </Link>
        ))}
      </div>

      {prefs.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-7">
          <Link href={tabHref(view).replace(/([?&])pref=[^&]*/, '$1').replace(/[?&]$/, '')} className={`text-[12.5px] px-3 py-1.5 rounded-full border ${!pref ? 'bg-ink text-cream border-ink' : 'bg-paper border-line text-muted hover:border-ink'}`}>{t('all_areas')}</Link>
          {prefs.map((p) => {
            const sp = new URLSearchParams();
            if (view !== 'upcoming') sp.set('view', view);
            sp.set('pref', p);
            return (
              <Link key={p} href={`/events?${sp.toString()}`} className={`text-[12.5px] px-3 py-1.5 rounded-full border ${pref === p ? 'bg-ink text-cream border-ink' : 'bg-paper border-line text-muted hover:border-ink'}`}>
                {prefectureName(p)}
              </Link>
            );
          })}
        </div>
      )}

      {events.length === 0 ? (
        <p className="text-[14px] text-muted bg-paper border border-line rounded-2xl p-6">{t('empty')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {events.map((ev) => <EventCard key={ev.id} ev={ev} />)}
        </div>
      )}
    </div>
  );
}
