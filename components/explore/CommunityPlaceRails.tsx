'use client';

import Link from 'next/link';
import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { useSavedPlaces } from '@/components/SavedPlacesProvider';
import { parseRecent, recentSlugs } from '@/lib/recentPlaces';

const RECENT_KEY = 'chococfko_recent_views';

export interface CommunityRail {
  key: string;
  heading: string;
  href: string;
  seeAll: string;
  slugs: string[];
}

/**
 * Client-side de-duplicated place rails for the community-activity section.
 *
 * The personalized "recently viewed" / "saved" rails (PersonalizedHome) render
 * client-only from localStorage, so a server component can't know what they
 * already showed. This island reads the same signals (recent views + saved set)
 * and builds a running `seen` set so a place is never printed twice: not across
 * these rails, and not when it already appeared in a personalized rail above.
 *
 * SSR-safe: `seen` starts empty so the first paint matches the server HTML, then
 * the effect fills it and the rails collapse to only genuinely-new cards.
 */
export default function CommunityPlaceRails({
  cards,
  rails,
}: {
  cards: Record<string, ReactNode>;
  rails: CommunityRail[];
}) {
  const { saved } = useSavedPlaces();
  const [seen, setSeen] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    const next = new Set<string>();
    try {
      for (const slug of recentSlugs(parseRecent(localStorage.getItem(RECENT_KEY)))) next.add(slug);
    } catch { /* ignore */ }
    for (const slug of Array.from(saved)) next.add(slug);
    setSeen(next);
  }, [saved]);

  const used = new Set(seen);
  const rendered = rails
    .map((rail) => {
      const slugs = rail.slugs.filter((slug) => cards[slug] && !used.has(slug));
      for (const slug of slugs) used.add(slug);
      return { ...rail, slugs };
    })
    .filter((rail) => rail.slugs.length > 0);

  if (rendered.length === 0) return null;

  return (
    <>
      {rendered.map((rail, i) => (
        <div key={rail.key} className={i < rendered.length - 1 ? 'mb-8' : undefined}>
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-semibold text-[15px] text-ink">{rail.heading}</h3>
            <Link href={rail.href} className="text-[13px] text-rose hover:text-rose-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 rounded">
              {rail.seeAll}
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {rail.slugs.map((slug) => <Fragment key={slug}>{cards[slug]}</Fragment>)}
          </div>
        </div>
      ))}
    </>
  );
}
