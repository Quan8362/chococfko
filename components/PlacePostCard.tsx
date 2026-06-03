import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { Post } from "@/lib/posts";

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

export default async function PlacePostCard({ post }: { post: Post }) {
  const t = await getTranslations("common");
  const tCat = await getTranslations("categories");

  const href = `/cong-dong/${post.id}`;
  const catKey = post.category as Parameters<typeof tCat>[0];
  const displayCategory = tCat(catKey);

  return (
    <article className="bg-paper rounded-2xl overflow-hidden border border-line shadow-card flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover group">
      {/* Image */}
      <Link href={href} className="block relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-[#f3e1d2] to-[#e9cdb6] flex-none">
        {/* Category badge */}
        <span className="absolute top-3 left-3 z-[2] inline-flex items-center gap-1 bg-paper/95 text-ink text-[11px] font-semibold px-2.5 py-[5px] rounded-full shadow-sm">
          {CAT_EMOJI[post.category]} {displayCategory}
        </span>

        {/* Community badge */}
        <span className="absolute top-3 right-3 z-[2] text-[10px] font-semibold px-2 py-[4px] rounded-full bg-teal/10 text-teal border border-teal/20">
          👤 Cộng đồng
        </span>

        {/* Fee badge */}
        {post.fee === "free" && (
          <span className="absolute bottom-3 right-3 z-[2] text-[10.5px] font-semibold px-2.5 py-[5px] rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
            {t("fee_free")}
          </span>
        )}
        {post.fee === "paid" && (
          <span className="absolute bottom-3 right-3 z-[2] text-[10.5px] font-semibold px-2.5 py-[5px] rounded-full bg-amber-50 text-amber-700 border border-amber-100">
            {t("fee_paid")}
          </span>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={post.img}
          alt={post.title}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          loading="lazy"
          onError={undefined}
        />
      </Link>

      {/* Content */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <span className="text-[11px] font-semibold tracking-[0.8px] uppercase text-teal">
          {post.area}
        </span>

        <Link href={href}>
          <h3 className="font-serif font-bold text-[18px] leading-[1.25] text-ink hover:text-rose transition-colors">
            {post.title}
          </h3>
        </Link>

        <p className="text-[13px] text-muted leading-[1.6] flex-1 line-clamp-2">
          {post.excerpt}
        </p>

        {/* Buttons */}
        <div className="flex gap-2 mt-2">
          {post.mapUrl ? (
            <a
              href={post.mapUrl}
              target="_blank"
              rel="noopener"
              className="flex-1 text-center py-2 px-2 rounded-xl text-[12px] font-semibold bg-rose-soft text-rose border border-rose/20 hover:bg-rose hover:text-white hover:border-rose transition-all"
            >
              {t("map_btn")}
            </a>
          ) : (
            <span className="flex-1" />
          )}
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
