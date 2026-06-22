import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { getPublishedEvents } from '@/lib/eventsDb';
import { filterEvents, sortEvents } from '@/lib/events';
import EventCard from './EventCard';

// Homepage "Upcoming events" rail: the soonest non-expired published events,
// optionally scoped to a selected region. Renders nothing when empty.

export default async function EventsRail({ region }: { region?: string | null }) {
  const t = await getTranslations('explore_home');
  const all = await getPublishedEvents();
  const upcoming = sortEvents(filterEvents(all, { view: 'upcoming', prefecture: region ?? null })).slice(0, 4);
  if (upcoming.length === 0) return null;

  return (
    <section className="max-w-[1240px] mx-auto px-5 sm:px-7 mt-10">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-serif font-bold text-[20px] sm:text-[24px] text-ink">{t('events_heading')}</h2>
        <Link href="/events" className="text-[13px] text-rose hover:text-rose-deep">{t('see_all')}</Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {upcoming.map((ev) => <EventCard key={ev.id} ev={ev} />)}
      </div>
    </section>
  );
}
