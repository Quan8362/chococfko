"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import SmartImg from "./SmartImg";
import UserAvatar from "./UserAvatar";
import { useTranslations } from "next-intl";
import type { Post } from "@/lib/posts";

// Community article categories (post_type = 'community').
// Colorful emoji match the site's visual language (homepage pills, place picker).
const COMMUNITY_CATS = [
  { f: "life",      emoji: "🏠", key: "cat_life" },
  { f: "paperwork", emoji: "📋", key: "cat_paperwork" },
  { f: "transport", emoji: "🚃", key: "cat_transport" },
  { f: "study",     emoji: "📚", key: "cat_study" },
  { f: "work",      emoji: "💼", key: "cat_work" },
  { f: "story",     emoji: "💬", key: "cat_story" },
] as const;

const CAT_EMOJI: Record<string, string> = Object.fromEntries(
  COMMUNITY_CATS.map((c) => [c.f, c.emoji])
);

const VALID_FILTERS = new Set<string>(["all", ...COMMUNITY_CATS.map((c) => c.f)]);

interface Props {
  posts: Post[];
  isAdmin?: boolean;
}

export default function PostFeed({ posts }: Props) {
  const t = useTranslations("community");
  const searchParams = useSearchParams();
  const topicParam = searchParams.get("topic");
  const initialActive = topicParam && VALID_FILTERS.has(topicParam) ? topicParam : "all";
  const [active, setActive] = useState(initialActive);

  // Hero suggestion cards link with ?topic=… — activate the matching tab
  useEffect(() => {
    const tp = searchParams.get("topic");
    if (tp && VALID_FILTERS.has(tp)) setActive(tp);
  }, [searchParams]);

  // Always show the full community topic taxonomy
  const FILTERS = [
    { f: "all", emoji: null as string | null, label: t("cat_all") },
    ...COMMUNITY_CATS.map(({ f, emoji, key }) => ({
      f,
      emoji,
      label: t(key as Parameters<typeof t>[0]),
    })),
  ];

  const shown = posts.filter((p) => active === "all" || p.category === active);

  function catLabel(p: Post): string {
    const cat = COMMUNITY_CATS.find((c) => c.f === p.category);
    return cat ? t(cat.key as Parameters<typeof t>[0]) : p.categoryLabel;
  }

  return (
    <>
      {/* ── Category filter — horizontally scrollable on mobile ── */}
      <div className="flex gap-2 mb-7 overflow-x-auto pb-1.5 -mx-1 px-1 sm:flex-wrap sm:overflow-visible sm:mx-0 sm:px-0 sm:pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => {
          const on = active === f.f;
          return (
            <button
              key={f.f}
              onClick={() => setActive(f.f)}
              aria-pressed={on}
              className={`inline-flex flex-none items-center gap-1.5 text-[12.5px] font-semibold px-4 py-[8px] rounded-full border whitespace-nowrap transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 ${
                on
                  ? "bg-rose text-white border-rose shadow-[0_2px_10px_rgba(194,24,91,0.25)]"
                  : "bg-paper text-ink border-line hover:bg-rose-soft hover:border-rose/40 hover:text-rose hover:-translate-y-px"
              }`}
            >
              {f.emoji && <span className="text-[13px] leading-none">{f.emoji}</span>}
              {f.label}
            </button>
          );
        })}
      </div>

      {/* ── Post grid ─────────────────────────────────── */}
      {shown.length === 0 ? (
        <div className="bg-paper border border-line shadow-card rounded-2xl py-16 px-6 text-center">
          <div className="mx-auto mb-4 grid place-items-center w-14 h-14 rounded-2xl bg-rose-soft text-[26px] leading-none">
            ✍️
          </div>
          <h3 className="font-serif font-bold text-[20px] text-ink mb-2">{t("empty_title")}</h3>
          <p className="text-muted text-[14px] max-w-[420px] mx-auto leading-[1.7] mb-6">
            {t("empty_sub")}
          </p>
          <Link
            href="/community/write"
            className="inline-flex items-center gap-2 font-semibold text-[14px] px-6 py-[11px] rounded-full bg-rose text-white shadow-[0_4px_14px_-4px_rgba(194,24,91,0.45)] hover:bg-rose-deep hover:-translate-y-px transition-all"
          >
            {t("empty_cta")}
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 items-stretch">
          {shown.map((p) => {
            const label = catLabel(p);
            return (
              <article
                key={p.id}
                className="bg-paper rounded-2xl overflow-hidden border border-line shadow-card flex flex-col h-full transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover group"
              >
                {/* Image */}
                <Link
                  href={`/community/${p.id}`}
                  className="relative block overflow-hidden bg-gradient-to-br from-[#f3e1d2] to-[#e9cdb6] flex-none h-[190px]"
                >
                  {/* Category tag */}
                  <span className="absolute top-3 left-3 z-[2] bg-paper/95 text-rose-deep text-[10.5px] font-semibold tracking-[0.5px] uppercase px-2.5 py-[5px] rounded-full shadow-sm">
                    {label}
                  </span>
                  {/* Category emoji chip (only for the known community taxonomy) */}
                  {CAT_EMOJI[p.category] && (
                    <span className="absolute bottom-3 left-3 z-[2] w-7 h-7 bg-paper/90 rounded-full grid place-items-center shadow-sm text-[14px] leading-none">
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
                <div className="flex flex-col flex-1 p-5">
                  {/* Meta row: category + relative date */}
                  <div className="mb-2 flex items-center gap-2 text-[11px]">
                    <span className="text-teal font-semibold tracking-[0.8px] uppercase">
                      {label}
                    </span>
                    <span className="text-muted/40" aria-hidden="true">·</span>
                    <span className="text-muted">{p.date}</span>
                  </div>

                  {/* Title */}
                  <Link href={`/community/${p.id}`}>
                    <h3 className="font-serif font-bold leading-[1.28] text-ink hover:text-rose transition-colors mb-2 text-[17.5px]">
                      {p.title}
                    </h3>
                  </Link>

                  {/* Excerpt */}
                  <p className="text-muted leading-[1.65] line-clamp-2 text-[13px]">
                    {p.excerpt}
                  </p>

                  {/* Author row — pinned to the bottom so cards align */}
                  <div className="flex items-center gap-2 pt-3 mt-auto border-t border-line/60">
                    <UserAvatar src={p.authorAvatar} name={p.author} size={24} />
                    <span className="text-[12px] text-muted truncate">
                      {p.author}
                    </span>
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
