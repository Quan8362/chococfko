import Link from "next/link";
import { getTranslations, getLocale } from "next-intl/server";
import { categories, places as staticPlaces, getAllPlacesFromDb } from "@/lib/places";
import type { Place } from "@/lib/places";
import PlaceCard from "@/components/PlaceCard";
import ExploreSearch from "@/components/ExploreSearch";
import HomePosts from "@/components/HomePosts";
import { prefectureName } from "@/lib/japan";

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

  const dbPlaces = await getAllPlacesFromDb(locale);
  // getAllPlacesFromDb filters out pending places (status='pending')
  // so only approved/pre-existing places reach here
  const allPlaces: Place[] = dbPlaces ?? staticPlaces;

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

  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative pt-[72px] pb-10 overflow-hidden">
        <div className="absolute -top-[180px] -right-[140px] w-[480px] h-[480px] rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(194,24,91,0.09),transparent_60%)] pointer-events-none" />
        <div className="absolute top-[40%] -left-[100px] w-[360px] h-[360px] rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(31,143,166,0.07),transparent_65%)] pointer-events-none" />

        <div className="max-w-[1240px] mx-auto px-7 relative z-[1]">
          <div className="text-center max-w-[720px] mx-auto animate-fadeup">
            <span className="inline-flex items-center gap-2 text-[11.5px] font-semibold tracking-[2.5px] uppercase text-rose mb-6 before:content-[''] before:w-6 before:h-px before:bg-rose/60 after:content-[''] after:w-6 after:h-px after:bg-rose/60">
              {t("label")}
            </span>

            <h1 className="font-serif font-black text-[clamp(34px,4.8vw,60px)] leading-[1.1] tracking-[-0.5px] mb-5 text-ink">
              {t("heading")}{" "}
              <em className="italic font-semibold text-rose not-italic">{t("heading_accent")}</em>.
            </h1>

            <p className="text-[17px] text-muted max-w-[520px] mx-auto mb-8 leading-[1.7] whitespace-pre-line">
              {t("description")}
            </p>

            {/* CTA buttons — single "Đăng địa điểm" at hero level */}
            <div className="flex gap-3 justify-center flex-wrap mb-12">
              <Link
                href="#sec-landmark"
                className="font-semibold text-[14px] px-6 py-3 rounded-full bg-rose text-white shadow-[0_6px_20px_-6px_rgba(194,24,91,0.5)] hover:bg-rose-deep hover:-translate-y-0.5 transition-all"
              >
                {t("cta_explore")}
              </Link>
              <Link
                href="/community"
                className="font-semibold text-[14px] px-6 py-3 rounded-full border border-[#c8b8a8] text-[#5c4d44] hover:border-ink hover:bg-ink hover:text-cream transition-all"
              >
                {t("cta_community")}
              </Link>
              <Link
                href="/places/new"
                className="font-semibold text-[14px] px-6 py-3 rounded-full border border-rose/50 text-rose bg-rose-soft hover:bg-rose hover:text-white hover:border-rose transition-all"
              >
                {t("write_place_cta")}
              </Link>
            </div>

            {/* Stats */}
            <div className="inline-flex items-center gap-8 px-8 py-4 rounded-2xl bg-paper border border-line shadow-card">
              <div className="text-center">
                <b className="font-serif text-[28px] font-bold block leading-none text-rose-deep">{allPlaces.length}</b>
                <span className="text-[12px] text-muted mt-1 block">{t("stat_places")}</span>
              </div>
              <div className="w-px h-8 bg-line" />
              <div className="text-center">
                <b className="font-serif text-[28px] font-bold block leading-none text-rose-deep">{visibleCategories.length}</b>
                <span className="text-[12px] text-muted mt-1 block">{t("stat_categories")}</span>
              </div>
              <div className="w-px h-8 bg-line" />
              <div className="text-center">
                <b className="font-serif text-[28px] font-bold block leading-none text-rose-deep">∞</b>
                <span className="text-[12px] text-muted mt-1 block">{t("stat_members")}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SEARCH + CATEGORY FILTER + RESULTS ───────────────── */}
      {/* Cards are pre-rendered server-side (PlaceCard is async); ExploreSearch
          decides which to show (filtered flat grid when searching, sectioned
          browse when idle). filterPlaces is the seam that moves server-side later. */}
      <ExploreSearch
        places={allPlaces}
        prefectures={prefectures}
        categories={visibleCategories.map((c) => ({
          code: c.code,
          label: tc(`${c.code}_full` as Parameters<typeof tc>[0]),
          emoji: CAT_EMOJI[c.code],
        }))}
        cards={Object.fromEntries(
          allPlaces.map((p) => [p.slug, <PlaceCard key={p.slug} place={p} />]),
        )}
      />

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
