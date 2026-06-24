'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useSavedPlaces } from '@/components/SavedPlacesProvider';
import { parseRecent, recentSlugs } from '@/lib/recentPlaces';
import { recommend, type PlaceLite, type RecoExplanation } from '@/lib/personalization';

// Personalized, returning-user homepage island. Entirely CLIENT-side so it is
// never cached across users (private recommendations stay per-browser):
//   • Signals: your saved places (provider: DB for members / local for guests),
//     recently viewed (localStorage), and a selected region (localStorage).
//   • Explainable: every recommendation shows a "why am I seeing this?" reason.
//   • Disable-able: a toggle stops algorithmic recommendations (your own saved /
//     recently-viewed lists remain, since those are explicit, not profiling).
//   • New users (no signal) render nothing → the page shows generic content.

const RECENT_KEY = 'chococfko_recent_views';
const REGION_KEY = 'chococfko_region';
const PERSONALIZE_KEY = 'chococfko_personalization';

export default function PersonalizedHome({
  cardsBySlug,
  placeIndex,
  prefectures,
}: {
  cardsBySlug: Record<string, ReactNode>;
  placeIndex: PlaceLite[];
  prefectures: { code: string; name: string }[];
}) {
  const t = useTranslations('explore_home');
  const tc = useTranslations('categories');
  const { saved, loggedIn, ready } = useSavedPlaces();

  const [mounted, setMounted] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [region, setRegion] = useState<string>('');
  const [personalize, setPersonalize] = useState(true);
  const [whyOpen, setWhyOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setRecent(recentSlugs(parseRecent(localStorage.getItem(RECENT_KEY))));
      setRegion(localStorage.getItem(REGION_KEY) ?? '');
      setPersonalize(localStorage.getItem(PERSONALIZE_KEY) !== '0');
    } catch { /* ignore */ }
  }, []);

  const savedSlugs = useMemo(() => Array.from(saved), [saved]);

  const recommendations = useMemo(() => {
    if (!personalize) return [];
    return recommend({
      candidates: placeIndex,
      signal: { savedSlugs, recentSlugs: recent, region: region || null },
      limit: 8,
      maxPerCategory: 2,
    });
  }, [personalize, placeIndex, savedSlugs, recent, region]);

  function setRegionPref(code: string) {
    setRegion(code);
    try { code ? localStorage.setItem(REGION_KEY, code) : localStorage.removeItem(REGION_KEY); } catch { /* ignore */ }
  }
  function togglePersonalize() {
    setPersonalize((p) => {
      const next = !p;
      try { localStorage.setItem(PERSONALIZE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }

  const prefName = (code: string) => prefectures.find((p) => p.code === code)?.name ?? code;
  function reasonText(r: RecoExplanation): string {
    const cat = r.params?.category ? tc(`${r.params.category}_full` as 'food_full') : '';
    switch (r.key) {
      case 'because_saved_category':   return t('why_saved_category', { category: cat });
      case 'recently_viewed_category': return t('why_recent_category', { category: cat });
      case 'popular_in_region':        return t('why_region', { region: prefName(String(r.params?.region ?? '')) });
      default:                         return t('why_discover');
    }
  }

  // Avoid hydration mismatch + new-user fallback: render nothing until we know
  // there is something personal to show.
  if (!mounted || !ready) return null;
  const hasRecent = recent.length > 0;
  const hasSaved = savedSlugs.length > 0;
  const showAnything = hasRecent || hasSaved || loggedIn || recommendations.length > 0;
  if (!showAnything) return null;

  const savedCards = savedSlugs.map((s) => cardsBySlug[s]).filter(Boolean).slice(0, 4);
  const recentCards = recent.map((s) => cardsBySlug[s]).filter(Boolean).slice(0, 4);

  return (
    <section className="max-w-[1240px] mx-auto px-5 sm:px-7 mt-12">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <h2 className="font-serif font-bold text-[20px] sm:text-[24px] text-ink">{t('for_you_heading')}</h2>
        {/* One consolidated control bar: region · personalization · why-info. */}
        <div className="flex items-center gap-1.5 rounded-full border border-line bg-paper px-1.5 py-1 shadow-sm">
          <label className="flex items-center gap-1.5 text-[12.5px] text-muted pl-2">
            <span className="hidden sm:inline">{t('region_label')}</span>
            <select
              value={region}
              onChange={(e) => setRegionPref(e.target.value)}
              aria-label={t('region_label')}
              className="text-[12.5px] font-medium px-1.5 py-1 rounded-lg bg-transparent text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 cursor-pointer"
            >
              <option value="">{t('region_all')}</option>
              {prefectures.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          </label>
          <span aria-hidden className="w-px h-5 bg-line" />
          <button
            type="button"
            onClick={togglePersonalize}
            aria-pressed={personalize}
            className={`text-[12.5px] font-medium px-3 py-1.5 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 ${personalize ? 'bg-rose-soft border-rose text-rose-deep' : 'bg-paper border-line text-muted'}`}
          >
            {personalize ? t('personalize_on') : t('personalize_off')}
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setWhyOpen((v) => !v)}
              aria-label={t('why_link')}
              aria-expanded={whyOpen}
              className={`grid place-items-center w-7 h-7 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 ${whyOpen ? 'bg-rose-soft text-rose-deep' : 'text-muted hover:bg-cream hover:text-ink'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden>
                <circle cx="12" cy="12" r="9" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-4M12 8h.01" />
              </svg>
            </button>
            {whyOpen && (
              <div role="tooltip" className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(280px,80vw)] text-left text-[12.5px] text-muted bg-paper border border-line rounded-xl shadow-card-hover p-3 animate-fadein">
                {t('why_explainer')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Continue planning — explicit, not algorithmic */}
      {loggedIn && (
        <div className="flex flex-wrap gap-2.5 mb-7">
          <Link href="/plans" className="inline-flex items-center gap-2 text-[13.5px] font-medium px-4 py-2.5 rounded-full bg-paper border border-line text-ink hover:border-rose">🗺️ {t('continue_plans')}</Link>
          <Link href="/lists" className="inline-flex items-center gap-2 text-[13.5px] font-medium px-4 py-2.5 rounded-full bg-paper border border-line text-ink hover:border-rose">📋 {t('continue_lists')}</Link>
        </div>
      )}

      {hasSaved && (
        <div className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-semibold text-[15px] text-ink">{t('saved_heading')}</h3>
            <Link href="/saved-places" className="text-[13px] text-rose hover:text-rose-deep">{t('see_all')}</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{savedCards}</div>
        </div>
      )}

      {hasRecent && (
        <div className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="font-semibold text-[15px] text-ink">{t('recent_heading')}</h3>
            <Link href="/saved-places" className="text-[13px] text-rose hover:text-rose-deep">{t('see_all')}</Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{recentCards}</div>
        </div>
      )}

      {personalize && recommendations.length > 0 && (
        <div>
          <h3 className="font-semibold text-[15px] text-ink mb-3">{t('recommended_heading')}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {recommendations.map((r) => cardsBySlug[r.slug] ? (
              <div key={r.slug} className="flex flex-col gap-1.5">
                {cardsBySlug[r.slug]}
                <span className="text-[11.5px] text-muted px-1">💡 {reasonText(r.reason)}</span>
              </div>
            ) : null)}
          </div>
        </div>
      )}
    </section>
  );
}
