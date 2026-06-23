import Link from "next/link";
import { getTranslations } from "next-intl/server";
import SmartImg from "./SmartImg";
import SavePlaceButton from "./SavePlaceButton";
import TagList from "./tags/TagList";
import { formatArea, type Place } from "@/lib/places";

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

export default async function PlaceCard({
  place,
  showCategoryBadge = true,
}: {
  place: Place;
  // Hide the category badge in same-category contexts (e.g. a category section
  // or the single-category list page) where the heading already states it.
  // The badge also carries the `place-cat-badge` class so the homepage — which
  // reuses one pre-rendered card node in both the category section (hidden) and
  // mixed search results (shown) — can toggle it purely with CSS.
  showCategoryBadge?: boolean;
}) {
  const t = await getTranslations("common");
  const tCat = await getTranslations("categories");
  const href = `/places/${place.slug}`;

  const catKey = place.category as Parameters<typeof tCat>[0];
  const displayCategory = tCat(catKey);

  const displayArea = formatArea(place, (k, v) => t(k as never, v as never));

  const hasFee = place.fee === "free" || place.fee === "paid";

  return (
    <article className="bg-paper rounded-2xl overflow-hidden border border-line shadow-card flex flex-col h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover focus-within:ring-2 focus-within:ring-rose/40 focus-within:ring-offset-2 focus-within:ring-offset-cream group">
      {/* Image */}
      <Link
        href={href}
        className="block relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-[#f3e1d2] to-[#e9cdb6] flex-none focus:outline-none"
      >
        <SmartImg
          src={place.img}
          fallback={place.imgFallback}
          alt={place.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
        />

        {/* Bottom scrim — keeps the fee badge legible over any photo. */}
        {hasFee && (
          <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 via-black/10 to-transparent z-[1]" />
        )}

        {/* Category badge — top-left. Hidden inside same-category sections (see prop docs). */}
        {showCategoryBadge && (
          <span className="place-cat-badge absolute top-3 left-3 z-[3] inline-flex items-center gap-1 bg-paper/95 backdrop-blur-sm text-ink text-[11px] font-semibold px-2.5 py-[5px] rounded-full shadow-sm">
            {CAT_EMOJI[place.category]} {displayCategory}
          </span>
        )}

        {/* Favorite (heart) — top-right. */}
        <span className="absolute top-3 right-3 z-[3]">
          <SavePlaceButton slug={place.slug} name={place.name} area={displayArea} img={place.img} categoryLabel={displayCategory} size="sm" />
        </span>

        {/* Fee badge — fixed bottom-left over the scrim. Green = free, amber = paid. */}
        {place.fee === "free" && (
          <span className="absolute bottom-3 left-3 z-[3] inline-flex items-center text-[10.5px] font-semibold px-2.5 py-[5px] rounded-full bg-white/95 text-emerald-700 ring-1 ring-emerald-600/15 shadow-sm">
            {t("fee_free")}
          </span>
        )}
        {place.fee === "paid" && (
          <span className="absolute bottom-3 left-3 z-[3] inline-flex items-center text-[10.5px] font-semibold px-2.5 py-[5px] rounded-full bg-white/95 text-amber-700 ring-1 ring-amber-600/15 shadow-sm">
            {t("fee_paid")}
          </span>
        )}
      </Link>

      {/* Content */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        {/* Location label — quiet single accent line, capped to one line with a
            reserved height so 1- and 2-line areas don't shift the title row. */}
        <span className="block truncate min-h-[1.25em] leading-[1.25] text-[10.5px] font-semibold tracking-[0.5px] uppercase text-teal/90">
          {displayArea}
        </span>

        <Link href={href} className="focus:outline-none focus-visible:underline decoration-rose/40">
          {/* Reserve 2 lines so titles align across a row regardless of length. */}
          <h3 className="font-serif font-bold text-[18px] leading-[1.25] text-ink group-hover:text-rose transition-colors line-clamp-2 min-h-[2.5em]">
            {place.name}
          </h3>
        </Link>

        {/* line-clamp-2 must NOT share an element with flex-1: flex-grow stretches
            the -webkit-box so the clamp leaks (ellipsis mid-word + overflow rows
            still visible). Keep clamp on its own reserved height; mt-auto pins
            the buttons. */}
        <p className="text-[13px] text-muted leading-[1.6] line-clamp-2 min-h-[3.2em]">
          {place.desc}
        </p>

        {/* Tags — capped at 2 visible + "+N" so a long tag list can't push the
            action row down unevenly across a grid row. */}
        {place.tags && place.tags.length > 0 && (
          <TagList tags={place.tags} max={2} size="sm" variant="plain" />
        )}

        {/* Buttons — pinned to the bottom (mt-auto) so action rows align across
            cards regardless of title/description/tag length. "Details" is the
            primary (solid magenta); "Map" is the secondary (ghost outline). */}
        <div className="flex gap-2 mt-auto pt-3">
          <a
            href={place.mapUrl}
            target="_blank"
            rel="noopener"
            className="flex-1 inline-flex items-center justify-center min-h-[40px] px-2 rounded-xl text-[12.5px] font-semibold bg-paper text-ink/80 border border-line hover:border-rose/40 hover:text-rose transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
          >
            {t("map_btn")}
          </a>
          <Link
            href={href}
            className="flex-1 inline-flex items-center justify-center min-h-[40px] px-2 rounded-xl text-[12.5px] font-semibold bg-rose text-white border border-rose shadow-[0_2px_10px_-4px_rgba(194,24,91,0.6)] hover:bg-rose-deep hover:border-rose-deep transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          >
            {t("detail_btn")}
          </Link>
        </div>
      </div>
    </article>
  );
}
