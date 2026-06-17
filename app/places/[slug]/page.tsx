import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations, getLocale } from "next-intl/server";
import { proxyStorageImages } from "@/lib/imageProxy";
import { getPlace, places, getAllPlacesFromDb, getPlaceFromDb, getPlaceComments, getPlaceRating, type Place } from "@/lib/places";
import { getPostsForPlace } from "@/lib/posts";
import { checkIsAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { stripHtml } from "@/lib/sanitize";
import { SITE_URL, SITE_NAME, DEFAULT_OG_IMAGE, OG_LOCALE, breadcrumbJsonLd, jsonLdString } from "@/lib/seo";
import SmartImg from "@/components/SmartImg";
import StarsDisplay from "@/components/marketplace/StarsDisplay";
import PlaceCard from "@/components/PlaceCard";
import PlacePostCard from "@/components/PlacePostCard";
import PlaceRating from "./PlaceRating";
import PlaceComments from "./PlaceComments";

async function getCurrentUser() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const name = (user.user_metadata?.display_name as string) || user.email?.split("@")[0] || "?";
    return { id: user.id, initial: name[0]?.toUpperCase() ?? "?" };
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";

const CAT_EMOJI: Record<string, string> = {
  landmark: "🏯", food: "🍜", sea: "🏖️", camp: "⛺",
  mountain: "⛰️", park: "🌳", viet: "🥢", grocery: "🛒", izakaya: "🍺",
  japanese: "🍣", thai: "🌶️", chinese: "🥡", korean: "🥩",
  cafe_milk_tea: "☕",
  kids_playground: "🎠",
  onsen: "♨️",
};

// schema.org type per place category (falls back to LocalBusiness).
const PLACE_SCHEMA_TYPE: Record<string, string> = {
  food: "Restaurant", viet: "Restaurant", izakaya: "Restaurant", japanese: "Restaurant",
  thai: "Restaurant", chinese: "Restaurant", korean: "Restaurant",
  cafe_milk_tea: "CafeOrCoffeeShop",
  park: "Park",
  landmark: "TouristAttraction", sea: "TouristAttraction", camp: "TouristAttraction",
  mountain: "TouristAttraction", onsen: "TouristAttraction", kids_playground: "TouristAttraction",
  grocery: "GroceryStore",
};

function placeDescription(p: Place): string {
  const raw = (p.body ? stripHtml(p.body) : "") || p.desc || "";
  return raw.length > 200 ? `${raw.slice(0, 197).trimEnd()}…` : raw;
}

function placeImage(p: Place): string {
  const src = p.img || p.imgFallback || "";
  return /^https?:\/\//i.test(src) ? src : DEFAULT_OG_IMAGE;
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const locale = await getLocale();
  const p = (await getPlaceFromDb(params.slug, locale)) ?? getPlace(params.slug);
  if (!p) return { title: SITE_NAME, robots: { index: false, follow: true } };

  const canonical = `${SITE_URL}/places/${p.slug}`;
  const description = placeDescription(p) || `${p.name} — ${p.area}`;
  const image = placeImage(p);
  const keywords = [p.name, p.categoryLabel, p.area, p.city, p.prefecture, "Nhật Bản"]
    .filter(Boolean) as string[];

  return {
    title: p.name,
    description,
    keywords,
    alternates: { canonical },
    openGraph: {
      type: "article",
      url: canonical,
      locale: OG_LOCALE[locale] ?? "vi_VN",
      siteName: SITE_NAME,
      title: `${p.name} · ${SITE_NAME}`,
      description,
      images: [{ url: image }],
    },
    twitter: { card: "summary_large_image", title: `${p.name} · ${SITE_NAME}`, description, images: [image] },
  };
}

export default async function PlaceDetail({ params }: { params: { slug: string } }) {
  const locale = await getLocale()
  const currentUser = await getCurrentUser();
  const [dbPlace, isAdmin, dbAllPlaces, comments, rating, placePosts] = await Promise.all([
    getPlaceFromDb(params.slug, locale),
    checkIsAdmin(),
    getAllPlacesFromDb(locale),
    getPlaceComments(params.slug),
    getPlaceRating(params.slug, currentUser?.id),
    getPostsForPlace(params.slug, locale),
  ]);

  const place = dbPlace ?? getPlace(params.slug);
  if (!place) notFound();

  const t = await getTranslations("common");
  const tCat = await getTranslations("categories");
  const tMeta = await getTranslations("meta");

  const AREA_TIME_MAP: Record<string, string> = {
    "Tối": "area_toi", "Sáng": "area_sang", "Trưa": "area_trua",
    "Chiều": "area_chieu", "Trưa / Tối": "area_trua_toi",
    "Gần Ohori": "area_near_ohori", "Gần Fukuoka Tower": "area_near_fukuoka_tower",
    "Dễ · hợp người mới": "area_mountain_easy_beginner",
    "Dễ–TB · gần thành phố": "area_mountain_easymid_city",
    "Dễ–TB": "area_mountain_easymid",
    "Trung bình · rất nổi tiếng": "area_mountain_mid_popular",
    "Trung bình · thiên nhiên đẹp": "area_mountain_mid_nature",
    "Trung bình · mùa lá đỏ": "area_mountain_mid_autumn",
    "Trung bình · view biển": "area_mountain_mid_seaview",
    "Có cáp treo · ngắm đêm": "area_mountain_cable_night",
    "Umi-machi · gần Dazaifu": "area_umi_near_dazaifu",
    "Đảo Nokonoshima": "area_nokonoshima_island",
  };
  const areaTimeKey = AREA_TIME_MAP[place.area];
  const displayArea = areaTimeKey ? t(areaTimeKey as Parameters<typeof t>[0]) : place.area;
  const displayCategory = tCat(place.category as Parameters<typeof tCat>[0]);

  const allPlaces = dbAllPlaces ?? places;
  const related = allPlaces
    .filter((x) => x.category === place.category && x.slug !== place.slug)
    .slice(0, 3);

  const costLabel =
    place.fee === "free" ? t("cost_free") :
    place.fee === "paid" ? t("cost_paid") :
    t("cost_varies");

  const canonical = `${SITE_URL}/places/${place.slug}`;
  const hasGeo = typeof place.lat === "number" && typeof place.lng === "number";
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": PLACE_SCHEMA_TYPE[place.category] ?? "LocalBusiness",
        "@id": `${canonical}#place`,
        name: place.name,
        description: placeDescription(place) || undefined,
        url: canonical,
        image: placeImage(place),
        address: {
          "@type": "PostalAddress",
          addressLocality: place.city || place.area || undefined,
          addressRegion: place.prefecture || undefined,
          addressCountry: "JP",
        },
        geo: hasGeo ? { "@type": "GeoCoordinates", latitude: place.lat, longitude: place.lng } : undefined,
        hasMap: place.mapUrl || undefined,
      },
      breadcrumbJsonLd([
        { name: SITE_NAME, path: "/" },
        { name: tMeta("places"), path: "/places" },
        { name: place.name, path: `/places/${place.slug}` },
      ]),
    ],
  };

  return (
    <article className="pb-16">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      {/* ── HERO ─────────────────────────────────────────────── */}
      <div className="relative h-[45vh] min-h-[340px] max-h-[540px] overflow-hidden bg-gradient-to-br from-[#f3e1d2] to-[#e9cdb6]">
        <SmartImg
          src={place.img.replace("/680/460/", "/1400/900/")}
          fallback={place.imgFallback.replace("/680/460", "/1400/900")}
          alt={place.name}
          className="w-full h-full object-cover"
          sizes="100vw"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(36,26,23,0.82)] via-[rgba(36,26,23,0.18)] to-transparent" />
        <div className="absolute inset-x-0 bottom-0">
          <div className="max-w-[1100px] mx-auto px-6 pb-8">
            <Link href="/" className="inline-flex items-center gap-1.5 text-white/80 text-[13px] mb-3 hover:text-white transition-colors">
              {t("back_home")}
            </Link>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="bg-[rgba(255,253,248,0.94)] text-rose-deep text-[11.5px] font-bold tracking-[0.4px] px-3 py-[5px] rounded-full">
                {CAT_EMOJI[place.category]} {displayCategory}
              </span>
              {place.fee === "free" && (
                <span className="text-[11.5px] font-bold px-3 py-[5px] rounded-full bg-[#e7f6e0] text-[#3f8f1f]">{t("fee_free")}</span>
              )}
              {place.fee === "paid" && (
                <span className="text-[11.5px] font-bold px-3 py-[5px] rounded-full bg-[#fbeee0] text-[#a8671d]">{t("fee_paid")}</span>
              )}
              <span className="text-white/85 text-[13px] font-semibold tracking-[0.4px]">📍 {displayArea}</span>
              {rating.count > 0 && (
                <span className="inline-flex items-center gap-1.5 bg-[rgba(255,253,248,0.94)] text-[#a8671d] text-[11.5px] font-bold px-3 py-[5px] rounded-full">
                  <StarsDisplay value={rating.average} className="w-3 h-3" />
                  {rating.average.toFixed(1)} · {t("rating_count", { count: rating.count })}
                </span>
              )}
            </div>
            <h1 className="font-serif font-black text-white text-[clamp(28px,5vw,52px)] leading-[1.06] tracking-[-1px] drop-shadow">
              {place.name}
            </h1>
          </div>
        </div>
      </div>

      {/* ── BODY — 2-column desktop ───────────────────────────── */}
      <div className="max-w-[1100px] mx-auto px-6 mt-10 grid lg:grid-cols-[1fr_268px] gap-10 items-start">

        {/* ── LEFT — main content ───────────────────────────── */}
        <div className="min-w-0">
          {/* Short description */}
          <p className="font-serif text-[20px] leading-[1.6] text-[#3a2d22] mb-7">
            {place.desc}
          </p>

          {/* Rich text body */}
          {place.body ? (
            <div
              className="rich-content text-[#3a2d22] mb-8"
              dangerouslySetInnerHTML={{ __html: proxyStorageImages(place.body) }}
            />
          ) : isAdmin ? (
            <p className="text-[14px] text-muted mb-8 flex items-center gap-2">
              {t("no_desc")}
              {" "}
              <Link href={`/admin/places/${place.slug}`} className="text-rose font-semibold hover:underline">
                {t("add_desc")}
              </Link>
            </p>
          ) : null}

          {/* Member posts written about this place */}
          <div className="border-t border-line pt-8">
            <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
              <h3 className="font-serif font-bold text-[22px]">{t("member_posts")}</h3>
              <Link
                href={`/community/write?place=${encodeURIComponent(place.slug)}`}
                className="inline-flex items-center gap-1.5 font-semibold text-[13px] px-4 py-2 rounded-full bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_4px_14px_-4px_rgba(194,24,91,0.4)]"
              >
                {t("write_about")} {place.name}
              </Link>
            </div>

            {placePosts.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {placePosts.map((post) => (
                  <PlacePostCard key={post.id} post={post} />
                ))}
              </div>
            ) : (
              <div className="bg-paper border border-dashed border-line rounded-2xl p-7 text-center">
                <p className="text-[14.5px] text-muted leading-[1.7] max-w-[340px] mx-auto">
                  {t("no_posts_place")}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT — sticky sidebar ────────────────────────── */}
        <aside className="lg:sticky lg:top-[88px] h-fit space-y-3">
          {/* Primary action */}
          <a
            href={place.mapUrl}
            target="_blank"
            rel="noopener"
            className="flex items-center justify-center gap-2 font-semibold text-[14px] px-5 py-3.5 rounded-2xl bg-rose text-white shadow-[0_8px_20px_-6px_rgba(200,30,91,0.55)] hover:bg-rose-deep hover:-translate-y-px transition-all"
          >
            {t("open_maps")}
          </a>

          {/* Secondary action */}
          <a
            href={place.photoUrl}
            target="_blank"
            rel="noopener"
            className="flex items-center justify-center gap-2 font-semibold text-[14px] px-5 py-3.5 rounded-2xl bg-[#e8f3f6] text-teal border border-[#cfe6ec] hover:bg-teal hover:text-white transition-all"
          >
            {t("view_photos")}
          </a>

          {/* Quick info card */}
          <div className="bg-paper border border-line rounded-2xl p-5">
            <h4 className="font-serif font-bold text-[15px] mb-3.5 text-ink">{t("quick_info")}</h4>
            <ul className="text-[13.5px] text-[#5c4d44] space-y-2.5">
              <li className="flex items-start gap-2.5">
                <span className="text-[15px] leading-none mt-px">📂</span>
                <span>{t("topic")} <b className="text-ink">{displayCategory}</b></span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="text-[15px] leading-none mt-px">📍</span>
                <span>{t("location")} <b className="text-ink">{displayArea}</b></span>
              </li>
              {place.fee && (
                <li className="flex items-start gap-2.5">
                  <span className="text-[15px] leading-none mt-px">💰</span>
                  <span>{t("cost")} <b className="text-ink">{costLabel}</b></span>
                </li>
              )}
            </ul>
          </div>

          {/* Place rating */}
          <PlaceRating
            slug={place.slug}
            average={rating.average}
            count={rating.count}
            myStars={rating.myStars}
            myReview={rating.myReview}
            isLoggedIn={!!currentUser}
          />

        </aside>
      </div>

      {/* ── COMMENTS / KINH NGHIỆM ───────────────────────────── */}
      <div className="max-w-[1100px] mx-auto px-6">
        <div className="lg:max-w-[calc(100%-308px)]">
          <PlaceComments
            slug={place.slug}
            comments={comments}
            currentUser={currentUser}
            isAdmin={isAdmin}
          />
        </div>
      </div>

      {/* ── RELATED ──────────────────────────────────────────── */}
      {related.length > 0 && (
        <div className="max-w-[1100px] mx-auto px-6 mt-14 pb-2">
          <h3 className="font-serif font-bold text-[24px] mb-6">{t("related")}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {related.map((p) => <PlaceCard key={p.slug} place={p} />)}
          </div>
        </div>
      )}
    </article>
  );
}
