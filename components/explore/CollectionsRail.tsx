import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { loadCollections } from '@/lib/collectionsDb';
import SectionHeader from '@/components/home/SectionHeader';

// "Useful collections" — admin-curated or reliable structured filters. Each
// links to /collections/[slug] (which only renders if it has real results).
// Server-rendered, public, cache-safe.

export default async function CollectionsRail() {
  const [t, tc] = await Promise.all([
    getTranslations('explore_home'),
    getTranslations('collections'),
  ]);
  // Cap at 6 so a 3-column grid forms two clean, full rows (no empty trailing
  // slots); the rest live behind "see all".
  const collections = (await loadCollections()).slice(0, 6);
  if (collections.length === 0) return null;

  // Rotating warm gradient tints so the collection cards feel like part of the
  // same premium system as the photo cards — never the plain emoji-on-paper
  // boxes they were. All hues are pulled from the existing brand palette.
  const TINTS = [
    'from-rose-soft via-paper to-paper',
    'from-gold-light/70 via-paper to-paper',
    'from-[#f2e7dd] via-paper to-paper',
  ];

  return (
    <section className="max-w-[1240px] mx-auto px-5 sm:px-7 mt-10">
      <SectionHeader title={t('collections_heading')} action={{ href: '/collections', label: t('see_all') }} />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        {collections.map((c, i) => {
          const title = c.title ?? (c.titleKey ? tc(c.titleKey as 'rainy_day_title') : c.slug);
          const desc = c.description ?? (c.descKey ? tc(c.descKey as 'rainy_day_desc') : '');
          return (
            <Link
              key={c.slug}
              href={`/collections/${c.slug}`}
              className={`group relative overflow-hidden flex flex-col gap-2 p-4 sm:p-5 rounded-2xl border border-line shadow-card bg-gradient-to-br ${TINTS[i % TINTS.length]} transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover hover:border-rose/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream`}
            >
              {/* Soft decorative orb — echoes the photo cards' depth on hover. */}
              <span aria-hidden className="pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full bg-rose/[0.06] group-hover:bg-rose/[0.1] transition-colors duration-300" />
              <span aria-hidden className="relative grid place-items-center w-11 h-11 rounded-xl bg-paper/80 border border-line text-[22px] leading-none shadow-sm group-hover:scale-105 group-hover:border-rose/30 transition-all duration-300">
                {c.emoji}
              </span>
              <span className="relative font-semibold text-[14.5px] text-ink group-hover:text-rose-deep transition-colors">{title}</span>
              {desc && <span className="relative text-[12.5px] text-muted leading-snug line-clamp-2">{desc}</span>}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
