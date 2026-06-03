"use client";

import { useState } from "react";
import Link from "next/link";
import SmartImg from "./SmartImg";
import { useTranslations } from "next-intl";
import type { Post } from "@/lib/posts";

const CAT_EMOJI: Record<string, string> = {
  landmark: "🏯", food: "🍜", sea: "🏖️", camp: "⛺", mountain: "⛰️",
  park: "🌳", viet: "🥢", grocery: "🛒", izakaya: "🍺",
  japanese: "🍣", thai: "🌶️", chinese: "🥡", korean: "🥩",
  cafe_milk_tea: "☕",
};

// Maps Vietnamese time-of-day area strings to translation keys
const AREA_TIME_MAP: Record<string, string> = {
  "Tối": "area_toi",
  "Sáng": "area_sang",
  "Trưa": "area_trua",
  "Chiều": "area_chieu",
  "Trưa / Tối": "area_trua_toi",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Stars({ n }: { n: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          className={`w-3 h-3 ${i < n ? "text-gold" : "text-line"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.286 3.957a1 1 0 00.95.69h4.162c.969 0 1.372 1.24.588 1.81l-3.37 2.449a1 1 0 00-.364 1.118l1.286 3.957c.3.921-.755 1.688-1.54 1.118L10 15.347l-3.37 2.449c-.784.57-1.838-.197-1.539-1.118l1.286-3.957a1 1 0 00-.364-1.118L2.644 9.384c-.784-.57-.38-1.81.588-1.81h4.162a1 1 0 00.95-.69L9.05 2.927z" />
        </svg>
      ))}
    </div>
  );
}

interface Props {
  posts: Post[];
  isAdmin?: boolean;
}

export default function PostFeed({ posts, isAdmin = false }: Props) {
  const t = useTranslations("filters");
  const tc = useTranslations("common");
  const [active, setActive] = useState("all");

  const ALL_CATEGORY_FILTERS = [
    { f: "landmark", emoji: "🏯",  label: t("landmark") },
    { f: "food",     emoji: "🍜",  label: t("food") },
    { f: "sea",      emoji: "🏖️", label: t("sea") },
    { f: "camp",     emoji: "⛺",  label: t("camp") },
    { f: "mountain", emoji: "⛰️", label: t("mountain") },
    { f: "park",     emoji: "🌳",  label: t("park") },
    { f: "viet",     emoji: "🥢",  label: t("viet") },
    { f: "grocery",  emoji: "🛒",  label: t("grocery") },
    { f: "izakaya",  emoji: "🍺",  label: t("izakaya") },
    { f: "japanese", emoji: "🍣",  label: t("japanese") },
    { f: "thai",     emoji: "🌶️", label: t("thai") },
    { f: "chinese",  emoji: "🥡",  label: t("chinese") },
    { f: "korean",   emoji: "🥩",  label: t("korean") },
  ];

  // Chỉ hiển thị chip cho category có ít nhất 1 bài viết
  const FILTERS = [
    { f: "all", emoji: null, label: t("all") },
    ...ALL_CATEGORY_FILTERS.filter(({ f }) => posts.some((p) => p.category === f)),
  ];

  const shown = posts.filter((p) => active === "all" || p.category === active);

  function translateArea(area: string): string {
    const raw = area.split("·")[0].trim();
    const key = AREA_TIME_MAP[raw];
    return key ? tc(key as Parameters<typeof tc>[0]) : raw;
  }

  return (
    <>
      {/* ── Category filter ───────────────────────────── */}
      <div className="flex gap-1.5 flex-wrap mb-7">
        {FILTERS.map((f) => (
          <button
            key={f.f}
            onClick={() => setActive(f.f)}
            className={`inline-flex items-center gap-1.5 text-[12.5px] font-medium px-4 py-[8px] rounded-full border transition-all ${
              active === f.f
                ? "bg-rose text-white border-rose shadow-[0_2px_10px_rgba(194,24,91,0.25)]"
                : "bg-paper text-[#5c4d44] border-line hover:bg-rose-soft hover:border-rose/40 hover:text-rose"
            }`}
          >
            {f.emoji && <span className="text-[13px] leading-none">{f.emoji}</span>}
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Post grid ─────────────────────────────────── */}
      {shown.length === 0 ? (
        <div className="bg-paper border border-line rounded-2xl py-16 text-center">
          <div className="text-[36px] mb-3">✍️</div>
          <p className="text-muted text-[14px]">{tc("no_posts_feed")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {shown.map((p) => {
            const isDbPost = UUID_RE.test(p.id);
            const displayArea = translateArea(p.area);
            return (
              <article
                key={p.id}
                className={`bg-paper rounded-2xl overflow-hidden border border-line shadow-card flex flex-col transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover group relative ${
                  p.big ? "sm:col-span-2 sm:flex-row" : ""
                }`}
              >
                {/* Admin edit badge */}
                {isAdmin && isDbPost && (
                  <Link
                    href={`/admin/edit/${p.id}`}
                    className="absolute top-3 right-3 z-10 bg-teal text-white text-[11px] font-semibold px-2.5 py-1 rounded-full shadow-sm hover:bg-teal/85 transition-colors"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {tc("edit")}
                  </Link>
                )}

                {/* Image */}
                <Link
                  href={`/cong-dong/${p.id}`}
                  className={`relative overflow-hidden bg-gradient-to-br from-[#f3e1d2] to-[#e9cdb6] flex-none ${
                    p.big ? "sm:flex-[1.1] min-h-[240px]" : "h-[200px]"
                  }`}
                >
                  {/* Area tag */}
                  <span className="absolute top-3 left-3 z-[2] bg-paper/95 text-rose-deep text-[10.5px] font-semibold tracking-[0.5px] uppercase px-2.5 py-[5px] rounded-full shadow-sm">
                    {displayArea}
                  </span>
                  {/* Category emoji */}
                  {CAT_EMOJI[p.category] && (
                    <span className="absolute bottom-3 left-3 z-[2] w-7 h-7 bg-paper/90 rounded-full grid place-items-center text-[14px] shadow-sm">
                      {CAT_EMOJI[p.category]}
                    </span>
                  )}
                  <SmartImg
                    src={p.img}
                    fallback={p.imgFallback}
                    alt={p.title}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                </Link>

                {/* Content */}
                <div className={`flex flex-col flex-1 ${p.big ? "p-7 justify-center" : "p-4"}`}>
                  {/* Area + rating row */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[11px] text-teal font-semibold tracking-[0.8px] uppercase">
                      {p.area}
                    </span>
                    <Stars n={p.rating} />
                  </div>

                  {/* Title */}
                  <Link href={`/cong-dong/${p.id}`}>
                    <h3
                      className={`font-serif font-bold leading-[1.28] text-ink hover:text-rose transition-colors mb-2 ${
                        p.big ? "text-[26px]" : "text-[17.5px]"
                      }`}
                    >
                      {p.title}
                    </h3>
                  </Link>

                  {/* Excerpt */}
                  <p
                    className={`text-muted leading-[1.65] flex-1 line-clamp-2 ${
                      p.big ? "text-[14.5px]" : "text-[13px]"
                    }`}
                  >
                    {p.excerpt}
                  </p>

                  {/* Author row */}
                  <div className="flex items-center gap-2 pt-3 mt-auto border-t border-line/60">
                    {p.authorAvatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.authorAvatar}
                        alt={p.author}
                        className="w-6 h-6 rounded-full object-cover flex-none"
                      />
                    ) : (
                      <span
                        className="w-6 h-6 rounded-full grid place-items-center text-white font-semibold text-[11px] flex-none"
                        style={{ background: `linear-gradient(135deg, ${p.authorColor})` }}
                      >
                        {p.authorInitial}
                      </span>
                    )}
                    <span className="text-[12px] text-muted truncate">
                      {p.author}
                    </span>
                    <span className="text-muted/40 text-[11px] ml-auto flex-none">{p.date}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
