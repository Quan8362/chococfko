import Link from 'next/link';
import { getTranslations, getLocale } from 'next-intl/server';
import { places as staticPlaces, getAllPlacesFromDb, attachPlaceTags, type Place } from '@/lib/places';
import { loadSearchConfig } from '@/lib/searchConcepts';
import { loadCollections } from '@/lib/collectionsDb';
import { filterPlaces } from '@/lib/placeSearch';
import { filtersToCriteria } from '@/lib/exploreParams';

export const dynamic = 'force-dynamic';

export async function generateMetadata() {
  const t = await getTranslations('collections');
  return { title: `${t('page_title')} · Chợ Cóc FKO` };
}

export default async function CollectionsPage() {
  const [t, tc, locale] = await Promise.all([
    getTranslations('explore_home'),
    getTranslations('collections'),
    getLocale(),
  ]);
  const base = (await getAllPlacesFromDb(locale)) ?? staticPlaces;
  const allPlaces: Place[] = await attachPlaceTags(base);
  const [collections, searchConfig] = await Promise.all([loadCollections(), loadSearchConfig()]);

  // Only show collections that actually yield results (no empty promises).
  const withCounts = collections
    .map((c) => ({ c, count: filterPlaces(allPlaces, filtersToCriteria(c.filters), searchConfig).length }))
    .filter((x) => x.count > 0);

  return (
    <div className="max-w-[1100px] mx-auto px-5 sm:px-7 py-10">
      <h1 className="font-serif font-bold text-[30px] tracking-[-0.3px] text-ink mb-1">{tc('page_title')}</h1>
      <p className="text-[14px] text-muted mb-7">{tc('page_sub')}</p>

      {withCounts.length === 0 ? (
        <p className="text-[14px] text-muted bg-paper border border-line rounded-2xl p-6">{t('collections_empty')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {withCounts.map(({ c, count }) => {
            const title = c.title ?? (c.titleKey ? tc(c.titleKey as 'rainy_day_title') : c.slug);
            const desc = c.description ?? (c.descKey ? tc(c.descKey as 'rainy_day_desc') : '');
            return (
              <Link key={c.slug} href={`/collections/${c.slug}`} className="group flex flex-col gap-2 p-5 rounded-2xl bg-paper border border-line hover:border-rose hover:shadow-card transition-all">
                <span className="text-[30px] leading-none" aria-hidden>{c.emoji}</span>
                <span className="font-serif font-bold text-[17px] text-ink group-hover:text-rose-deep">{title}</span>
                {desc && <span className="text-[13px] text-muted leading-snug">{desc}</span>}
                <span className="text-[12px] text-rose mt-1">{t('collection_count', { count })}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
