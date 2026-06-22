import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { getQuestionsNeedingAnswers, getPopularSavedSlugs } from '@/lib/communityFeed';

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
  const popularCards = popularSlugs.map((s) => cardsBySlug[s]).filter(Boolean);
  const updatedCards = recentlyUpdatedSlugs.map((s) => cardsBySlug[s]).filter(Boolean).slice(0, 4);

  const hasAny = questions.length > 0 || popularCards.length > 0 || updatedCards.length > 0;
  if (!hasAny) return null;

  return (
    <section className="max-w-[1240px] mx-auto px-5 sm:px-7 mt-12">
      <h2 className="font-serif font-bold text-[20px] sm:text-[24px] text-ink mb-5">{t('community_heading')}</h2>

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

      {popularCards.length > 0 && (
        <div className="mb-8">
          <h3 className="font-semibold text-[15px] text-ink mb-3">{t('popular_saved_heading')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{popularCards}</div>
        </div>
      )}

      {updatedCards.length > 0 && (
        <div>
          <h3 className="font-semibold text-[15px] text-ink mb-3">{t('recently_updated_heading')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{updatedCards}</div>
        </div>
      )}
    </section>
  );
}
