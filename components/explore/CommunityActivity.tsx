import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getQuestionsNeedingAnswers, getPopularSavedSlugs } from '@/lib/communityFeed';
import CommunityPlaceRails, { type CommunityRail } from './CommunityPlaceRails';
import SectionHeader from '@/components/home/SectionHeader';

// Public community-activity section: questions needing answers, popular saved
// places (only when backed by real save data), and recently updated places.
// All public/aggregate data — no private user info. Renders nothing if empty.

export default async function CommunityActivity({
  cardsBySlug,
  recentlyUpdatedSlugs,
}: {
  cardsBySlug: Record<string, ReactNode>;
  recentlyUpdatedSlugs: string[];
}) {
  const t = await getTranslations('explore_home');
  const [questions, popularSlugs] = await Promise.all([
    getQuestionsNeedingAnswers(),
    getPopularSavedSlugs(2, 4),
  ]);
  // Distinct place rails for this section. They are de-duplicated client-side
  // (against each other AND against the personalized "recent"/"saved" rails that
  // render above) so the same famous places never appear three times down the
  // page — the single biggest "padded" smell on the homepage.
  const popular = popularSlugs.filter((s) => cardsBySlug[s]);
  const updated = recentlyUpdatedSlugs.filter((s) => cardsBySlug[s]).slice(0, 8);
  const railSlugs = Array.from(new Set([...popular, ...updated]));
  const railCards: Record<string, ReactNode> = Object.fromEntries(
    railSlugs.map((s) => [s, cardsBySlug[s]]),
  );
  const rails: CommunityRail[] = [
    popular.length > 0 && { key: 'popular', heading: t('popular_saved_heading'), href: '/places', seeAll: t('see_all'), slugs: popular },
    updated.length > 0 && { key: 'updated', heading: t('recently_updated_heading'), href: '/places', seeAll: t('see_all'), slugs: updated },
  ].filter(Boolean) as CommunityRail[];

  const hasAny = questions.length > 0 || rails.length > 0;
  if (!hasAny) return null;

  return (
    <section className="max-w-[1240px] mx-auto px-5 sm:px-7 mt-12">
      <SectionHeader title={t('community_heading')} className="mb-5" />

      {questions.length > 0 && (
        <div className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-semibold text-[15px] text-ink">{t('questions_heading')}</h3>
            <Link href="/places" className="text-[13px] text-rose hover:text-rose-deep">{t('see_all')}</Link>
          </div>
          <ul className="space-y-2">
            {questions.map((q) => (
              <li key={q.id}>
                <Link
                  href={`/places/${q.placeSlug}`}
                  className="flex items-start gap-3 p-3 rounded-xl bg-paper border border-line hover:border-rose transition-colors"
                >
                  <span aria-hidden className="text-[16px]">❓</span>
                  <span className="text-[13.5px] text-ink line-clamp-2">{q.content}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rails.length > 0 && <CommunityPlaceRails cards={railCards} rails={rails} />}
    </section>
  );
}
