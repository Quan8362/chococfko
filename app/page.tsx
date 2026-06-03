import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { categories, places as staticPlaces, getAllPlacesFromDb } from "@/lib/places";
import type { Place } from "@/lib/places";
import { getPlacePostsFromDb } from "@/lib/posts";
import type { Post } from "@/lib/posts";
import PlaceCard from "@/components/PlaceCard";
import HomePosts from "@/components/HomePosts";

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
};

export default async function Home() {
  const t = await getTranslations("home");
  const tc = await getTranslations("categories");
  const ta = await getTranslations("actions");

  const [dbPlaces, dbPlacePosts] = await Promise.all([
    getAllPlacesFromDb(),
    getPlacePostsFromDb(),
  ]);
  const allPlaces: Place[] = dbPlaces ?? staticPlaces;

  // Group user-submitted place posts by category
  const placePostsByCategory: Record<string, Post[]> = {};
  if (dbPlacePosts) {
    for (const post of dbPlacePosts) {
      if (!placePostsByCategory[post.category]) placePostsByCategory[post.category] = [];
      placePostsByCategory[post.category].push(post);
    }
  }

  // Chỉ render những category có ít nhất 1 địa điểm
  const visibleCategories = categories
    .map((c) => ({ ...c, items: allPlaces.filter((p) => p.category === c.code) }))
    .filter(({ items }) => items.length > 0);

  return (
    <>
      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative pt-[72px] pb-10 overflow-hidden">
        {/* Background blobs – subtle */}
        <div className="absolute -top-[180px] -right-[140px] w-[480px] h-[480px] rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(194,24,91,0.09),transparent_60%)] pointer-events-none" />
        <div className="absolute top-[40%] -left-[100px] w-[360px] h-[360px] rounded-full bg-[radial-gradient(circle_at_50%_50%,rgba(31,143,166,0.07),transparent_65%)] pointer-events-none" />

        <div className="max-w-[1240px] mx-auto px-7 relative z-[1]">
          <div className="text-center max-w-[720px] mx-auto animate-fadeup">
            {/* Label */}
            <span className="inline-flex items-center gap-2 text-[11.5px] font-semibold tracking-[2.5px] uppercase text-rose mb-6 before:content-[''] before:w-6 before:h-px before:bg-rose/60 after:content-[''] after:w-6 after:h-px after:bg-rose/60">
              {t("label")}
            </span>

            {/* Heading */}
            <h1 className="font-serif font-black text-[clamp(34px,4.8vw,60px)] leading-[1.1] tracking-[-0.5px] mb-5 text-ink">
              {t("heading")}{" "}
              <em className="italic font-semibold text-rose not-italic">{t("heading_accent")}</em>.
            </h1>

            {/* Description */}
            <p className="text-[17px] text-muted max-w-[520px] mx-auto mb-8 leading-[1.7] whitespace-pre-line">
              {t("description")}
            </p>

            {/* CTA buttons */}
            <div className="flex gap-3 justify-center flex-wrap mb-12">
              <Link
                href="#sec-landmark"
                className="font-semibold text-[14px] px-6 py-3 rounded-full bg-rose text-white shadow-[0_6px_20px_-6px_rgba(194,24,91,0.5)] hover:bg-rose-deep hover:-translate-y-0.5 transition-all"
              >
                {t("cta_explore")}
              </Link>
              <Link
                href="/cong-dong"
                className="font-semibold text-[14px] px-6 py-3 rounded-full border border-[#c8b8a8] text-[#5c4d44] hover:border-ink hover:bg-ink hover:text-cream transition-all"
              >
                {t("cta_community")}
              </Link>
              <Link
                href="/cong-dong/viet-bai?type=place"
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

      {/* ── CATEGORY NAV ─────────────────────────────────────── */}
      <div id="categories" className="sticky top-[68px] z-[90] bg-[rgba(250,244,234,0.94)] backdrop-blur-md border-b border-line">
        <div className="max-w-[1240px] mx-auto px-6">
          <div className="flex flex-wrap gap-1.5 py-3">
            {visibleCategories.map((c) => (
              <a
                key={c.code}
                href={`#sec-${c.code}`}
                className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium text-muted border border-line bg-paper px-3.5 py-[6px] rounded-full hover:bg-rose-soft hover:border-rose/40 hover:text-rose transition-all"
              >
                <span className="text-[13px] leading-none">{CAT_EMOJI[c.code]}</span>
                {tc(`${c.code}_full` as Parameters<typeof tc>[0])}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ── CATEGORY SECTIONS ────────────────────────────────── */}
      {visibleCategories.map((c, idx) => {
        const communityPosts = placePostsByCategory[c.code] ?? [];
        return (
          <section key={c.code} id={`sec-${c.code}`} className="pt-14 pb-2 scroll-mt-[140px]">
            <div className="max-w-[1240px] mx-auto px-6">
              {/* Section header */}
              <div className="flex items-center gap-3.5 mb-7">
                <div className="w-10 h-10 flex-none rounded-xl bg-rose/10 text-rose font-bold text-[15px] grid place-items-center border border-rose/15">
                  {idx + 1}
                </div>
                <h2 className="font-serif text-[clamp(22px,2.8vw,32px)] font-bold tracking-[-0.3px] leading-tight text-ink flex-1">
                  {tc(`${c.code}_full` as Parameters<typeof tc>[0])}
                </h2>
                <Link
                  href={`/cong-dong/viet-bai?type=place&category=${c.code}`}
                  className="hidden sm:inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-rose hover:text-rose-deep transition-colors border border-rose/30 bg-rose-soft px-3.5 py-1.5 rounded-full hover:bg-rose hover:text-white hover:border-rose"
                >
                  ✍️ {ta("writePlace")}
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {c.items.map((p) => (
                  <PlaceCard key={p.slug} place={p} />
                ))}
              </div>

              {/* Community-submitted place posts for this category */}
              {communityPosts.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-[13px] font-semibold text-muted uppercase tracking-[1.5px] mb-4 flex items-center gap-2">
                    <span className="w-px h-4 bg-line" />
                    {t("community_places_heading")}
                    <span className="w-px h-4 bg-line" />
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {communityPosts.map((post) => (
                      <Link
                        key={post.id}
                        href={`/cong-dong/${post.id}`}
                        className="group bg-cream border border-line rounded-2xl overflow-hidden shadow-card hover:-translate-y-1 hover:shadow-card-hover transition-all flex flex-col"
                      >
                        <div className="relative h-36 overflow-hidden bg-gradient-to-br from-[#f3e1d2] to-[#e9cdb6] flex-none">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={post.img}
                            alt={post.title}
                            className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-500"
                            loading="lazy"
                          />
                        </div>
                        <div className="p-4 flex flex-col gap-1.5 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold tracking-[0.8px] uppercase text-teal truncate">
                              {post.area}
                            </span>
                            <span className="text-[11px] text-gold ml-2 whitespace-nowrap">
                              {"★".repeat(post.rating)}{"☆".repeat(5 - post.rating)}
                            </span>
                          </div>
                          <h4 className="font-serif font-bold text-[15px] leading-snug text-ink group-hover:text-rose transition-colors line-clamp-2">
                            {post.title}
                          </h4>
                          <p className="text-[12.5px] text-muted leading-[1.6] line-clamp-2 flex-1">
                            {post.excerpt}
                          </p>
                          <div className="flex items-center gap-2 pt-1.5 border-t border-line mt-1">
                            <div
                              className="w-5 h-5 rounded-full text-white text-[9px] font-semibold grid place-items-center flex-none"
                              style={{ background: `linear-gradient(135deg, ${post.authorColor.split(",")[0]}, ${post.authorColor.split(",")[1] ?? post.authorColor.split(",")[0]})` }}
                            >
                              {post.authorInitial}
                            </div>
                            <span className="text-[11.5px] text-muted truncate">{post.author}</span>
                            <span className="text-[11px] text-muted/70 ml-auto whitespace-nowrap">{post.date}</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        );
      })}

      {/* ── LATEST COMMUNITY POSTS ───────────────────────────── */}
      <HomePosts />

      {/* ── CTA BOTTOM ───────────────────────────────────────── */}
      <section className="mt-10 sm:mt-14 px-4 sm:px-6 pb-16 sm:pb-24">
        <div className="max-w-[1100px] mx-auto">
          <div className="relative overflow-hidden rounded-2xl
            bg-[linear-gradient(130deg,#9d1248_0%,#c2185b_52%,#cd3570_100%)]">

            {/* Decorative geometry */}
            <div className="absolute -top-20 -right-20 w-[320px] h-[320px] rounded-full bg-white/[0.05] pointer-events-none" />
            <div className="absolute -bottom-12 -left-12 w-[200px] h-[200px] rounded-full bg-white/[0.04] pointer-events-none" />
            <div className="absolute top-0 right-0 w-[420px] h-full
              bg-[radial-gradient(ellipse_at_80%_40%,rgba(255,255,255,0.06)_0%,transparent_60%)]
              pointer-events-none hidden sm:block" />
            <div className="absolute inset-0
              bg-[radial-gradient(ellipse_at_20%_70%,rgba(255,255,255,0.05)_0%,transparent_55%)]
              pointer-events-none" />

            <div className="relative z-[1] px-8 sm:px-12 lg:px-16
              py-10 sm:py-12
              flex flex-col sm:flex-row items-center gap-7 sm:gap-10 lg:gap-16">

              {/* ── Text block ──────────────────────────────── */}
              <div className="flex-1 min-w-0 text-center sm:text-left text-white">
                <h2 className="font-serif text-[clamp(26px,3.5vw,42px)] font-bold
                  leading-[1.15] tracking-[-0.4px] mb-3">
                  {t("cta_heading")}
                </h2>
                <p className="text-[15.5px] text-white/75 leading-[1.72]
                  max-w-[520px] mx-auto sm:mx-0">
                  {t("cta_sub")}
                </p>
              </div>

              {/* ── Button block ─────────────────────────────── */}
              <div className="flex-none">
                <Link
                  href="/cong-dong/viet-bai?type=community"
                  className="group inline-flex items-center gap-2.5
                    font-semibold text-[15px] px-9 py-4 rounded-full
                    bg-white text-rose-deep
                    shadow-[0_8px_30px_rgba(0,0,0,0.22)]
                    hover:bg-[#fffdf8] hover:-translate-y-0.5
                    hover:shadow-[0_14px_40px_rgba(0,0,0,0.3)]
                    transition-all duration-200 whitespace-nowrap"
                >
                  {t("cta_write")}
                  <svg
                    className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200"
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
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
