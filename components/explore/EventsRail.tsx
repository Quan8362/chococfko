import { getTranslations } from 'next-intl/server';
import { getPublishedEvents } from '@/lib/eventsDb';
import { filterEvents, sortEvents } from '@/lib/events';
import EventCard from './EventCard';
import SectionHeader from '@/components/home/SectionHeader';

// Homepage "Upcoming events" rail: the soonest non-expired published events,
// optionally scoped to a selected region. Renders nothing when empty.

export default async function EventsRail({ region }: { region?: string | null }) {
  const t = await getTranslations('explore_home');
  const all = await getPublishedEvents();
  const upcoming = sortEvents(filterEvents(all, { view: 'upcoming', prefecture: region ?? null })).slice(0, 4);
  if (upcoming.length === 0) return null;

  return (
    <section className="max-w-[1240px] mx-auto px-5 sm:px-7 mt-10">
      <SectionHeader title={t('events_heading')} action={{ href: '/events', label: t('see_all') }} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {upcoming.map((ev) => <EventCard key={ev.id} ev={ev} />)}
      </div>
    </section>
  );
}
