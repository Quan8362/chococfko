import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations, getLocale } from "next-intl/server";
import { proxyStorageImages } from "@/lib/imageProxy";
import { getPlace, places, getAllPlacesFromDb, getPlaceFromDb } from "@/lib/places";
import { checkIsAdmin } from "@/lib/supabase/admin";
import SmartImg from "@/components/SmartImg";
import PlaceCard from "@/components/PlaceCard";

export const dynamic = "force-dynamic";

const CAT_EMOJI: Record<string, string> = {
  landmark: "🏯", food: "🍜", sea: "🏖️", camp: "⛺",
  mountain: "⛰️", park: "🌳", viet: "🥢", grocery: "🛒", izakaya: "🍺",
  japanese: "🍣", thai: "🌶️", chinese: "🥡", korean: "🥩",
  cafe_milk_tea: "☕",
  kids_playground: "🎠",
  onsen: "♨️",
};

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const dbPlace = await getPlaceFromDb(params.slug);
  const p = dbPlace ?? getPlace(params.slug);
  return { title: p ? `${p.name} · Chợ Cóc FKO` : "Chợ Cóc FKO" };
}

export default async function PlaceDetail({ params }: { params: { slug: string } }) {
  const locale = await getLocale()
  const [dbPlace, isAdmin, dbAllPlaces] = await Promise.all([
    getPlaceFromDb(params.slug, locale),
    checkIsAdmin(),
    getAllPlacesFromDb(locale),
  ]);

  const place = dbPlace ?? getPlace(params.slug);
  if (!place) notFound();

  const t = await getTranslations("common");
  const tCat = await getTranslations("categories");

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

  return (
    <article className="pb-16">
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
              <Link href={`/admin/dia-diem/${place.slug}`} className="text-rose font-semibold hover:underline">
                {t("add_desc")}
              </Link>
            </p>
          ) : null}

          {/* Member posts */}
          <div className="border-t border-line pt-8">
            <h3 className="font-serif font-bold text-[22px] mb-5">{t("member_posts")}</h3>
            <div className="bg-paper border border-dashed border-line rounded-2xl p-7 text-center">
              <p className="text-[14.5px] text-muted leading-[1.7] mb-5 max-w-[340px] mx-auto">
                {t("no_posts_place")}
              </p>
              <Link
                href={`/cong-dong/viet-bai?category=${place.category}`}
                className="inline-flex items-center gap-1.5 font-semibold text-[13.5px] px-5 py-2.5 rounded-full bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_4px_14px_-4px_rgba(194,24,91,0.4)]"
              >
                {t("write_about")} {place.name}
              </Link>
            </div>
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

        </aside>
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
