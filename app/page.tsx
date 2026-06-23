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
import HeroMap from "@/components/home/HeroMap";
import HeroStats from "@/components/home/HeroStats";
import Reveal from "@/components/home/Reveal";

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
      <section className="relative pt-9 sm:pt-11 lg:pt-12 pb-8 lg:pb-10 overflow-hidden">
        {/* Subtle teal ambient on the far left — keeps the cream from feeling
            flat without competing with the map's own pink glow (in HeroMap). */}
        <div className="absolute top-[42%] -left-[120px] w-[360px] h-[360px] rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(31,143,166,0.05),transparent_65%)] pointer-events-none" />

        {/* Two-column on lg+ via grid so the map can vertically centre against the
            full text+stats stack; single column (text → map → stats) below lg.
            The right column is weighted heavier so the map reads as the anchor.
            Container matches the header for edge alignment. */}
        <div className="max-w-[1280px] mx-auto px-4 sm:px-6 relative z-[1] lg:grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.12fr)] lg:items-center lg:gap-x-8 xl:gap-x-10">

          {/* TEXT — eyebrow, headline, supporting copy, CTAs */}
          <div className="text-center lg:text-left lg:col-start-1 lg:row-start-1 max-w-[600px] mx-auto lg:mx-0 animate-fadeup">
            <span className="inline-flex items-center gap-3 text-[12px] font-semibold tracking-[0.22em] uppercase text-rose-deep mb-5 before:content-[''] before:w-7 before:h-px before:bg-rose-deep/45 after:content-[''] after:w-7 after:h-px after:bg-rose-deep/45">
              {t("label")}
            </span>

            <h1 className="font-serif font-black text-[clamp(32px,4.4vw,56px)] leading-[1.07] tracking-[-0.5px] text-ink text-balance">
              {t("heading")}{" "}
              {/* Keep the emphasised phrase + period together so it never breaks
                  to a lone "trang." — locale-safe (no fixed <br/>). */}
              <span className="whitespace-nowrap"><em className="not-italic font-semibold text-rose">{t("heading_accent")}</em>.</span>
            </h1>

            <p className="mt-5 text-[16.5px] leading-[1.7] text-[#50443b] max-w-[480px] mx-auto lg:mx-0 whitespace-pre-line">
              {t("description")}
            </p>

            {/* CTA cluster: primary (solid) + secondary (outline) on one row,
                then the tertiary "add a place" link grouped just beneath with a
                short connector so it reads as part of the cluster, not floating. */}
            <div className="mt-8 flex flex-col items-stretch sm:items-start gap-3.5">
              <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center lg:justify-start gap-3">
                <Link
                  href="#sec-landmark"
                  className="group inline-flex items-center justify-center gap-2 min-h-[48px] px-7 text-[14.5px] font-semibold rounded-full bg-rose text-white shadow-[0_6px_20px_-6px_rgba(194,24,91,0.5)] hover:bg-rose-deep hover:-translate-y-0.5 hover:scale-[1.02] hover:shadow-[0_14px_30px_-8px_rgba(194,24,91,0.6)] active:translate-y-0 active:scale-100 active:shadow-[0_4px_12px_-6px_rgba(194,24,91,0.5)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/55 focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                >
                  {t("cta_explore")}
                  <svg className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                </Link>
                <Link
                  href="/community"
                  className="inline-flex items-center justify-center min-h-[48px] px-6 text-[14.5px] font-semibold rounded-full border border-[#c8b8a8] text-[#5c4d44] hover:border-ink hover:bg-ink hover:text-cream hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-cream"
                >
                  {t("cta_community")}
                </Link>
              </div>

              {/* Tertiary action — a deliberate text link with a grow-underline,
                  grouped with the CTAs (consistent spacing, not floating). */}
              <Link
                href="/places/new"
                className="group/add relative inline-flex items-center self-center sm:self-start min-h-[32px] px-1 text-[13.5px] font-semibold text-rose hover:text-rose-deep no-underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream rounded after:absolute after:left-1 after:right-1 after:-bottom-0.5 after:h-px after:bg-rose-deep after:origin-left after:scale-x-0 after:transition-transform after:duration-200 hover:after:scale-x-100"
              >
                {t("write_place_cta")}
              </Link>
            </div>
          </div>

          {/* MAP — the hero visual (parallax + idle float + brand glow). */}
          <HeroMap alt={t("hero_map_alt")} />

          {/* STATS + community proof — the trust row extends the left column so
              it balances the taller map on the right. */}
          <div className="lg:col-start-1 lg:row-start-2 mt-7 lg:mt-8 flex flex-col items-center lg:items-start gap-5">
            <HeroStats places={allPlaces.length} categories={visibleCategories.length} />
            <div className="hidden lg:flex items-center gap-2.5 text-[12.5px] text-muted">
              <span className="grid place-items-center w-5 h-5 rounded-full bg-rose-soft text-rose">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              {t("hero_trust")}
            </div>
          </div>
        </div>
      </section>

      {/* Soft wave divider bridging the hero into the discovery section so the
          reading flow feels continuous (decorative, no added reading gap). */}
      <div aria-hidden className="relative -mt-px pointer-events-none">
        <div className="absolute left-1/2 -translate-x-1/2 -top-10 w-[72%] max-w-[760px] h-24 bg-[radial-gradient(ellipse_at_center,rgba(194,24,91,0.05),transparent_70%)]" />
        <svg className="block w-full h-[28px] text-paper/60" viewBox="0 0 1440 40" preserveAspectRatio="none" fill="currentColor">
          <path d="M0 40 C 360 0, 1080 0, 1440 40 Z" />
        </svg>
      </div>

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
      <Reveal><CollectionsRail /></Reveal>

      {/* ── UPCOMING EVENTS ──────────────────────────────────── */}
      <Reveal><EventsRail /></Reveal>

      {/* ── COMMUNITY ACTIVITY ───────────────────────────────── */}
      <Reveal><CommunityActivity cardsBySlug={cardsBySlug} recentlyUpdatedSlugs={recentlyUpdatedSlugs} /></Reveal>

      {/* ── LATEST COMMUNITY POSTS ───────────────────────────── */}
      <Reveal><HomePosts /></Reveal>

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
