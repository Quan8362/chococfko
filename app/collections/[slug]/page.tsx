import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getTranslations, getLocale } from 'next-intl/server';
import { places as staticPlaces, getAllPlacesFromDb, attachPlaceTags, type Place } from '@/lib/places';
import { loadSearchConfig } from '@/lib/searchConcepts';
import { loadCollections } from '@/lib/collectionsDb';
import { filterPlaces } from '@/lib/placeSearch';
import { filtersToCriteria, encodeFilters } from '@/lib/exploreParams';
import PlaceCard from '@/components/PlaceCard';

export const dynamic = 'force-dynamic';

export default async function CollectionPage({ params }: { params: { slug: string } }) {
  const [t, tc, locale] = await Promise.all([
    getTranslations('explore_home'),
    getTranslations('collections'),
    getLocale(),
  ]);
  const collections = await loadCollections();
  const collection = collections.find((c) => c.slug === params.slug);
  if (!collection) notFound();

  const base = (await getAllPlacesFromDb(locale)) ?? staticPlaces;
  const allPlaces: Place[] = await attachPlaceTags(base);
  const searchConfig = await loadSearchConfig();
  const results = filterPlaces(allPlaces, filtersToCriteria(collection.filters), searchConfig);

  const title = collection.title ?? (collection.titleKey ? tc(collection.titleKey as 'rainy_day_title') : collection.slug);
  const desc = collection.description ?? (collection.descKey ? tc(collection.descKey as 'rainy_day_desc') : '');
  const exploreHref = `/places?${encodeFilters(collection.filters).toString()}`;

  return (
    <div className="max-w-[1240px] mx-auto px-5 sm:px-7 py-10">
      <Link href="/collections" className="text-[13px] text-muted hover:text-rose">← {tc('page_title')}</Link>
      <div className="flex items-start gap-3 mt-2 mb-1">
        <span className="text-[34px] leading-none" aria-hidden>{collection.emoji}</span>
        <div>
          <h1 className="font-serif font-bold text-[28px] tracking-[-0.3px] text-ink">{title}</h1>
          {desc && <p className="text-[14px] text-muted mt-1">{desc}</p>}
        </div>
      </div>
      <Link href={exploreHref} className="inline-block text-[13px] text-rose hover:text-rose-deep mt-2 mb-6">{t('refine_in_search')} →</Link>

      {results.length === 0 ? (
        <p className="text-[14px] text-muted bg-paper border border-line rounded-2xl p-6">{t('collections_empty')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {results.map((p) => <PlaceCard key={p.slug} place={p} />)}
        </div>
      )}
    </div>
  );
}
