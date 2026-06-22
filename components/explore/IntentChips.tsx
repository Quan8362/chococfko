import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { encodeFilters, type ExploreFilters } from '@/lib/exploreParams';

// "What do you want to do today?" — intent shortcuts. Each is a RELIABLE
// structured-filter link into /places (the same search engine), so there's no
// editorial claim the data can't back. Server-rendered, public, cache-safe.

const CHIPS: { key: string; emoji: string; filters: ExploreFilters }[] = [
  { key: 'near_me',     emoji: '📍', filters: { nearby: true } },
  { key: 'open_now',    emoji: '🕒', filters: { openNow: true } },
  { key: 'eat_cheap',   emoji: '🍜', filters: { category: 'food', priceMax: 3000 } },
  { key: 'free',        emoji: '🎟️', filters: { fee: 'free' } },
  { key: 'rainy',       emoji: '🌧️', filters: { rainy: true, indoor: true } },
  { key: 'family',      emoji: '👨‍👩‍👧', filters: { children: true } },
  { key: 'night',       emoji: '🌙', filters: { category: 'izakaya' } },
  { key: 'reservable',  emoji: '📅', filters: { reservationAvailable: true } },
  { key: 'camping_bbq', emoji: '⛺', filters: { category: 'camp', bbq: true } },
  { key: 'vietnamese',  emoji: '🥢', filters: { category: 'viet' } },
];

export default async function IntentChips({ region }: { region?: string | null }) {
  const t = await getTranslations('explore_home');
  return (
    <section className="max-w-[1240px] mx-auto px-5 sm:px-7 mt-8 sm:mt-10">
      <h2 className="font-serif font-bold text-[20px] sm:text-[24px] text-ink mb-1">{t('intent_heading')}</h2>
      <p className="text-[13.5px] text-muted mb-4">{t('intent_sub')}</p>
      <div className="flex flex-wrap gap-2.5">
        {CHIPS.map((c) => {
          const filters = c.key === 'near_me' && region ? { ...c.filters } : c.filters;
          const qs = encodeFilters(filters).toString();
          return (
            <Link
              key={c.key}
              href={qs ? `/places?${qs}` : '/places'}
              className="inline-flex items-center gap-2 text-[13.5px] font-medium px-4 py-2.5 rounded-full bg-paper border border-line text-ink hover:border-rose hover:bg-rose-soft hover:text-rose-deep transition-colors"
            >
              <span aria-hidden>{c.emoji}</span>
              {t(`intent_${c.key}` as 'intent_near_me')}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
