import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { loadCollections } from '@/lib/collectionsDb';

// "Useful collections" — admin-curated or reliable structured filters. Each
// links to /collections/[slug] (which only renders if it has real results).
// Server-rendered, public, cache-safe.

export default async function CollectionsRail() {
  const [t, tc] = await Promise.all([
    getTranslations('explore_home'),
    getTranslations('collections'),
  ]);
  const collections = (await loadCollections()).slice(0, 8);
  if (collections.length === 0) return null;

  return (
    <section className="max-w-[1240px] mx-auto px-5 sm:px-7 mt-10">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="font-serif font-bold text-[20px] sm:text-[24px] text-ink">{t('collections_heading')}</h2>
        <Link href="/collections" className="text-[13px] text-rose hover:text-rose-deep">{t('see_all')}</Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {collections.map((c) => {
          const title = c.title ?? (c.titleKey ? tc(c.titleKey as 'rainy_day_title') : c.slug);
          const desc = c.description ?? (c.descKey ? tc(c.descKey as 'rainy_day_desc') : '');
          return (
            <Link
              key={c.slug}
              href={`/collections/${c.slug}`}
              className="group flex flex-col gap-1.5 p-4 rounded-2xl bg-paper border border-line hover:border-rose hover:shadow-card transition-all"
            >
              <span className="text-[26px] leading-none" aria-hidden>{c.emoji}</span>
              <span className="font-semibold text-[14.5px] text-ink group-hover:text-rose-deep">{title}</span>
              {desc && <span className="text-[12.5px] text-muted leading-snug line-clamp-2">{desc}</span>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
