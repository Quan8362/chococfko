import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations, getLocale } from "next-intl/server";
import { categories, places as staticPlaces, getAllPlacesFromDb, attachPlaceTags } from "@/lib/places";
import type { Place } from "@/lib/places";
import { loadSearchConfig } from "@/lib/searchConcepts";
import PlaceCard from "@/components/PlaceCard";
import ExploreSearch from "@/components/ExploreSearch";
import HomePosts from "@/components/HomePosts";
import { prefectureName } from "@/lib/japan";
import CollectionsRail from "@/components/explore/CollectionsRail";
import EventsRail from "@/components/explore/EventsRail";
import CommunityActivity from "@/components/explore/CommunityActivity";
import PersonalizedHome from "@/components/explore/PersonalizedHome";
import MapDiscoveryCard from "@/components/explore/MapDiscoveryCard";

export const dynamic = "force-dynamic";

const CAT_EMOJI: Record<string, string> = {
  landmark: "🏯",
  food: "🍜",
  sea: "🏖️",
  camp: "⛺",
  mountain: "⛰️",
  park: "🌳",
  viet: "🥢",
  grocery: "🛒",
  izakaya: "🍺",
  japanese: "🍣",
  thai: "🌶️",
  chinese: "🥡",
  korean: "🥩",
  cafe_milk_tea: "☕",
  kids_playground: "🎠",
  onsen: "♨️",
};

export default async function Home() {
  const [t, tc, locale] = await Promise.all([
    getTranslations("home"),
    getTranslations("categories"),
    getLocale(),
  ])

  // Fetch places + search taxonomy in parallel (independent). The taxonomy load
  // overlaps the places query instead of running after it.
  const [dbPlaces, searchConfig] = await Promise.all([
    getAllPlacesFromDb(locale),
    loadSearchConfig(),
  ]);
  // getAllPlacesFromDb filters out pending places (status='pending')
  // so only approved/pre-existing places reach here
  const basePlaces: Place[] = dbPlaces ?? staticPlaces;
  // Attach tags so cards show chips and search matches tag names. Best-effort.
  const allPlaces: Place[] = await attachPlaceTags(basePlaces);

  // Only render categories that have at least 1 place
  const visibleCategories = categories
    .map((c) => ({ ...c, items: allPlaces.filter((p) => p.category === c.code) }))
    .filter(({ items }) => items.length > 0);

  // Prefectures that actually have places (only these appear in the selector)
  const prefCounts = new Map<string, number>();
  for (const p of allPlaces) {
    const code = p.prefecture ?? "fukuoka";
    prefCounts.set(code, (prefCounts.get(code) ?? 0) + 1);
  }
  const prefectures = Array.from(prefCounts.entries())
    .map(([code, count]) => ({ code, name: prefectureName(code), count }))
    .sort((a, b) => b.count - a.count);

  // Pre-render every place card once; reused by ExploreSearch, the personalized
  // island, and the community-activity section (no double fetch/render).
  const cardsBySlug: Record<string, ReactNode> = Object.fromEntries(
    allPlaces.map((p) => [p.slug, <PlaceCard key={p.slug} place={p} />]),
  );
  // Lightweight index for client-side personalization (no private data).
  const placeIndex = allPlaces.map((p) => ({ slug: p.slug, category: p.category, prefecture: p.prefecture ?? null }));
  // Recently updated/verified places (derived from already-loaded data).
  const recentlyUpdatedSlugs = [...allPlaces]
    .filter((p) => p.lastVerifiedAt || p.updatedAt)
    .sort((a, b) => (new Date(b.lastVerifiedAt ?? b.updatedAt ?? 0).getTime()) - (new Date(a.lastVerifiedAt ?? a.updatedAt ?? 0).getTime()))
    .slice(0, 8)
    .map((p) => p.slug);

  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative pt-10 sm:pt-12 lg:pt-14 pb-6 sm:pb-8 overflow-hidden">
        {/* Warm ambient glow — keeps the editorial identity without imagery. */}
        <div className="absolute -top-[160px] -right-[120px] w-[440px] h-[440px] rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(194,24,91,0.09),transparent_60%)] pointer-events-none" aria-hidden="true" />
        <div className="absolute top-[42%] -left-[90px] w-[340px] h-[340px] rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(31,143,166,0.07),transparent_65%)] pointer-events-none" aria-hidden="true" />

        {/* Editorial "journey across places" motif: a faint dashed route threading
            a few location pins. Decorative only — desktop, low opacity, no JS. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 320 220"
          fill="none"
          className="hidden xl:block absolute top-[64px] right-[10px] 2xl:right-[44px] w-[210px] h-[150px] text-rose pointer-events-none motion-safe:animate-fadeup"
        >
          <path d="M24 188 C 70 150, 60 96, 120 92 S 232 86, 252 30" stroke="currentColor" strokeOpacity="0.18" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 9" />
          <g className="text-rose">
            <circle cx="24" cy="188" r="5" fill="currentColor" fillOpacity="0.22" />
            <circle cx="120" cy="92" r="5" fill="currentColor" fillOpacity="0.28" />
          </g>
          <path d="M252 30 c-9 0-16 7-16 16 0 11 16 25 16 25s16-14 16-25c0-9-7-16-16-16z" fill="currentColor" fillOpacity="0.16" />
          <circle cx="252" cy="46" r="5.5" fill="#faf4ea" />
        </svg>
        <svg
          aria-hidden="true"
          viewBox="0 0 160 140"
          fill="none"
          className="hidden xl:block absolute bottom-[6px] left-[10px] 2xl:left-[44px] w-[120px] h-[104px] text-teal pointer-events-none motion-safe:animate-fadeup"
        >
          <path d="M18 18 C 60 40, 50 92, 132 110" stroke="currentColor" strokeOpacity="0.16" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 9" />
          <circle cx="18" cy="18" r="4.5" fill="currentColor" fillOpacity="0.22" />
          <circle cx="132" cy="110" r="4.5" fill="currentColor" fillOpacity="0.24" />
        </svg>

        <div className="max-w-[1240px] mx-auto px-5 sm:px-7 relative z-[1]">
          <div className="text-center max-w-[760px] mx-auto animate-fadeup">
            <span className="inline-flex items-center gap-2 text-[11.5px] font-semibold tracking-[2.5px] uppercase text-rose mb-4 sm:mb-5 before:content-[''] before:w-6 before:h-px before:bg-rose/60 after:content-[''] after:w-6 after:h-px after:bg-rose/60">
              {t("label")}
            </span>

            {/* Headline wrap is locale-safe: the highlighted accent always begins a
                new line (the translations split at the natural clause break), so no
                language produces an orphaned final word. text-balance tidies the
                clause itself. */}
            <h1 className="font-serif font-black text-[clamp(31px,4.4vw,52px)] leading-[1.14] tracking-[-0.5px] mb-4 sm:mb-5 text-ink text-balance max-w-[820px] mx-auto">
              <span className="block">{t("heading")}</span>
              <em className="not-italic font-semibold text-rose">{t("heading_accent")}</em>
              <span aria-hidden="true">.</span>
            </h1>

            <p className="text-[16px] sm:text-[17px] text-muted max-w-[500px] mx-auto mb-7 leading-[1.65] whitespace-pre-line text-pretty">
              {t("description")}
            </p>

            {/* CTA hierarchy: primary (filled) · secondary (quiet outline) ·
                tertiary (ghost). Stacks on phones so the primary stays obvious. */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2.5 sm:gap-3 mb-7 sm:mb-8">
              <Link
                href="#sec-landmark"
                className="group inline-flex items-center justify-center gap-2 font-semibold text-[14.5px] px-7 py-3.5 rounded-full bg-rose text-white shadow-[0_8px_24px_-8px_rgba(194,24,91,0.55)] hover:bg-rose-deep hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-8px_rgba(194,24,91,0.55)] active:translate-y-0 active:shadow-[0_4px_14px_-8px_rgba(194,24,91,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/45 focus-visible:ring-offset-2 focus-visible:ring-offset-cream transition-all duration-200"
              >
                {t("cta_explore")}
                <svg className="w-4 h-4 motion-safe:group-hover:translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
              <Link
                href="/community"
                className="inline-flex items-center justify-center font-semibold text-[14.5px] px-6 py-3.5 rounded-full border border-line bg-paper text-ink hover:border-ink/30 hover:bg-cream active:bg-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20 focus-visible:ring-offset-2 focus-visible:ring-offset-cream transition-all duration-200"
              >
                {t("cta_community")}
              </Link>
              <Link
                href="/places/new"
                className="inline-flex items-center justify-center font-medium text-[14px] px-4 py-3 rounded-full text-muted hover:text-rose hover:bg-rose-soft/60 active:bg-rose-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/30 focus-visible:ring-offset-2 focus-visible:ring-offset-cream transition-colors duration-200"
              >
                {t("write_place_cta")}
              </Link>
            </div>

            {/* Lightweight social proof — sits close to the CTAs, no heavy card. */}
            <div className="inline-flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 sm:gap-x-7 max-w-full px-5 sm:px-6 py-2.5 rounded-2xl bg-paper/70 border border-line/70">
              <div className="text-center">
                <b className="font-serif text-[23px] font-bold block leading-none text-rose-deep">{allPlaces.length}</b>
                <span className="text-[11.5px] text-muted mt-0.5 block">{t("stat_places")}</span>
              </div>
              <div className="hidden sm:block w-px h-7 bg-line" aria-hidden="true" />
              <div className="text-center">
                <b className="font-serif text-[23px] font-bold block leading-none text-rose-deep">{visibleCategories.length}</b>
                <span className="text-[11.5px] text-muted mt-0.5 block">{t("stat_categories")}</span>
              </div>
              <div className="hidden sm:block w-px h-7 bg-line" aria-hidden="true" />
              <div className="text-center">
                <span className="flex items-center justify-center h-[23px] text-rose-deep">
                  <svg className="w-[22px] h-[22px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6-4a3 3 0 11-3-3" />
                  </svg>
                </span>
                <span className="text-[11.5px] text-muted mt-0.5 block">{t("community_open")}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── DISCOVERY: intro → region+search → quick needs → categories → results.
          ExploreSearch owns the four-layer hierarchy (Phase 8 UI refactor). Cards
          are pre-rendered server-side (PlaceCard is async); ExploreSearch decides
          which to show (filtered flat grid when searching, sectioned browse when
          idle). filterPlaces is the seam that moves server-side later. */}
      <ExploreSearch
        places={allPlaces}
        searchConfig={searchConfig}
        prefectures={prefectures}
        categories={visibleCategories.map((c) => ({
          code: c.code,
          label: tc(`${c.code}_full` as Parameters<typeof tc>[0]),
          emoji: CAT_EMOJI[c.code],
        }))}
        cards={cardsBySlug}
      />

      {/* ── MAP DISCOVERY CTA (compact, sits between discovery + personalized) ── */}
      <MapDiscoveryCard />

      {/* ── PERSONALIZED (returning users; client-only, never cached cross-user) ── */}
      <PersonalizedHome
        cardsBySlug={cardsBySlug}
        placeIndex={placeIndex}
        prefectures={prefectures.map((p) => ({ code: p.code, name: p.name }))}
      />

      {/* ── USEFUL COLLECTIONS ───────────────────────────────── */}
      <CollectionsRail />

      {/* ── UPCOMING EVENTS ──────────────────────────────────── */}
      <EventsRail />

      {/* ── COMMUNITY ACTIVITY ───────────────────────────────── */}
      <CommunityActivity cardsBySlug={cardsBySlug} recentlyUpdatedSlugs={recentlyUpdatedSlugs} />

      {/* ── LATEST COMMUNITY POSTS ───────────────────────────── */}
      <HomePosts />

      {/* ── CTA BOTTOM ───────────────────────────────────────── */}
      <section className="mt-10 sm:mt-14 px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="max-w-[1100px] mx-auto">
          <div className="relative overflow-hidden rounded-2xl bg-[linear-gradient(130deg,#9d1248_0%,#c2185b_52%,#cd3570_100%)]">
            <div className="absolute -top-20 -right-20 w-[320px] h-[320px] rounded-full bg-white/[0.05] pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-[200px] h-[200px] rounded-full bg-white/[0.04] pointer-events-none" />
            <div className="absolute top-0 right-0 w-[420px] h-full bg-[radial-gradient(ellipse_at_80%_40%,rgba(255,255,255,0.06)_0%,transparent_60%)] pointer-events-none hidden sm:block" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_70%,rgba(255,255,255,0.05)_0%,transparent_55%)] pointer-events-none" />

            <div className="relative z-[1] px-8 sm:px-12 lg:px-16 py-10 sm:py-12 flex flex-col sm:flex-row items-center gap-7 sm:gap-10 lg:gap-16">
              <div className="flex-1 min-w-0 text-center sm:text-left text-white">
                <h2 className="font-serif text-[clamp(26px,3.5vw,42px)] font-bold leading-[1.15] tracking-[-0.4px] mb-3">
                  {t("cta_heading")}
                </h2>
                <p className="text-[15.5px] text-white/75 leading-[1.72] max-w-[520px] mx-auto sm:mx-0">
                  {t("cta_sub")}
                </p>
              </div>
              <div className="flex-none">
                <Link
                  href="/community/write"
                  className="group inline-flex items-center gap-2.5 font-semibold text-[15px] px-9 py-4 rounded-full bg-white text-rose-deep shadow-[0_8px_30px_rgba(0,0,0,0.22)] hover:bg-[#fffdf8] hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(0,0,0,0.3)] transition-all duration-200 whitespace-nowrap"
                >
                  {t("cta_write")}
                  <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
