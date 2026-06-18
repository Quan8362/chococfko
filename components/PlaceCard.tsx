import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SmartImg from "./SmartImg";
import SavePlaceButton from "./SavePlaceButton";
import TagList from "./tags/TagList";
import type { Place } from "@/lib/places";

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

// Maps Vietnamese area strings to common translation keys
const AREA_TIME_MAP: Record<string, string> = {
  // Time-of-day areas
  "Tối":                        "area_toi",
  "Sáng":                       "area_sang",
  "Trưa":                       "area_trua",
  "Chiều":                      "area_chieu",
  "Trưa / Tối":                 "area_trua_toi",
  // Location areas
  "Gần Ohori":                  "area_near_ohori",
  "Gần Fukuoka Tower":          "area_near_fukuoka_tower",
  // Mountain / hiking difficulty areas
  "Dễ · hợp người mới":         "area_mountain_easy_beginner",
  "Dễ–TB · gần thành phố":      "area_mountain_easymid_city",
  "Dễ–TB":                      "area_mountain_easymid",
  "Trung bình · rất nổi tiếng": "area_mountain_mid_popular",
  "Trung bình · thiên nhiên đẹp": "area_mountain_mid_nature",
  "Trung bình · mùa lá đỏ":    "area_mountain_mid_autumn",
  "Trung bình · view biển":     "area_mountain_mid_seaview",
  "Có cáp treo · ngắm đêm":     "area_mountain_cable_night",
  // Other Vietnamese areas
  "Umi-machi · gần Dazaifu":    "area_umi_near_dazaifu",
  "Đảo Nokonoshima":             "area_nokonoshima_island",
};

export default async function PlaceCard({ place }: { place: Place }) {
  const t = await getTranslations("common");
  const tCat = await getTranslations("categories");
  const href = `/places/${place.slug}`;

  const catKey = place.category as Parameters<typeof tCat>[0];
  const displayCategory = tCat(catKey);

  const areaTimeKey = AREA_TIME_MAP[place.area];
  const displayArea = areaTimeKey ? t(areaTimeKey as Parameters<typeof t>[0]) : place.area;

  return (
    <article className="bg-paper rounded-2xl overflow-hidden border border-line shadow-card flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover group">
      {/* Image */}
      <Link href={href} className="block relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-[#f3e1d2] to-[#e9cdb6] flex-none">
        {/* Category badge */}
        <span className="absolute top-3 left-3 z-[2] inline-flex items-center gap-1 bg-paper/95 text-ink text-[11px] font-semibold px-2.5 py-[5px] rounded-full shadow-sm">
          {CAT_EMOJI[place.category]} {displayCategory}
        </span>

        {/* Save button */}
        <span className="absolute top-3 right-3 z-[2]">
          <SavePlaceButton slug={place.slug} name={place.name} area={displayArea} img={place.img} categoryLabel={displayCategory} size="sm" />
        </span>

        {/* Fee badge — moved below save button if no fee */}
        {place.fee === "free" && (
          <span className="absolute bottom-3 right-3 z-[2] text-[10.5px] font-semibold px-2.5 py-[5px] rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
            {t("fee_free")}
          </span>
        )}
        {place.fee === "paid" && (
          <span className="absolute bottom-3 right-3 z-[2] text-[10.5px] font-semibold px-2.5 py-[5px] rounded-full bg-amber-50 text-amber-700 border border-amber-100">
            {t("fee_paid")}
          </span>
        )}

        <SmartImg
          src={place.img}
          fallback={place.imgFallback}
          alt={place.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      </Link>

      {/* Content */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <span className="text-[11px] font-semibold tracking-[0.8px] uppercase text-teal">
          {displayArea}
        </span>

        <Link href={href}>
          <h3 className="font-serif font-bold text-[18px] leading-[1.25] text-ink hover:text-rose transition-colors">
            {place.name}
          </h3>
        </Link>

        <p className="text-[13px] text-muted leading-[1.6] flex-1 line-clamp-2">
          {place.desc}
        </p>

        {/* Tags */}
        {place.tags && place.tags.length > 0 && (
          <TagList tags={place.tags.slice(0, 3)} size="sm" className="mt-0.5" />
        )}

        {/* Buttons */}
        <div className="flex gap-2 mt-2">
          <a
            href={place.mapUrl}
            target="_blank"
            rel="noopener"
            className="flex-1 text-center py-2 px-2 rounded-xl text-[12px] font-semibold bg-rose-soft text-rose border border-rose/20 hover:bg-rose hover:text-white hover:border-rose transition-all"
          >
            {t("map_btn")}
          </a>
          <Link
            href={href}
            className="flex-1 text-center py-2 px-2 rounded-xl text-[12px] font-semibold bg-teal-soft text-teal border border-teal/20 hover:bg-teal hover:text-white hover:border-teal transition-all"
          >
            {t("detail_btn")}
          </Link>
        </div>
      </div>
    </article>
  );
}
