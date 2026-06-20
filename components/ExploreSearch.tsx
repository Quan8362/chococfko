"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { filterPlaces } from "@/lib/placeSearch";
import type { SearchConfig } from "@/lib/placeSearch";
import type { Place } from "@/lib/places";

interface CatProp {
  code: string;
  label: string;
  emoji: string;
}

interface PrefProp {
  code: string;
  name: string;
  count: number;
}

const GRID = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6";

// Homepage preview is a teaser, not an archive: show at most 9 cards per
// category (3×3) on desktop, 6 on tablet, 4 on mobile. We render the first 9 and
// hide the overflow per breakpoint with nth-child rules — cards are `flex`
// (PlaceCard root), so reveal with `:flex` (not `:block`) to keep their layout.
const PREVIEW_LIMIT = 9;
const PREVIEW_GRID =
  GRID +
  // Cards in a category section share its category, so the heading already says
  // it — hide the per-card category badge to keep the section calm.
  " [&_.place-cat-badge]:hidden" +
  " [&>*:nth-child(5)]:hidden [&>*:nth-child(6)]:hidden" +
  " sm:[&>*:nth-child(5)]:flex sm:[&>*:nth-child(6)]:flex" +
  " [&>*:nth-child(n+7)]:hidden lg:[&>*:nth-child(n+7)]:flex";

export default function ExploreSearch({
  places,
  categories,
  prefectures,
  cards,
  searchConfig,
}: {
  places: Place[];
  categories: CatProp[];
  prefectures: PrefProp[];
  cards: Record<string, React.ReactNode>;
  /** Data-driven search taxonomy from the server; falls back to engine default. */
  searchConfig?: SearchConfig;
}) {
  const t = useTranslations("home");
  const [q, setQ] = useState("");
  const [prefecture, setPrefecture] = useState<string | null>(prefectures[0]?.code ?? null);
  const [prefOpen, setPrefOpen] = useState(false);
  const [pendingScroll, setPendingScroll] = useState<string | null>(null);
  const prefRef = useRef<HTMLDivElement>(null);

  // Close prefecture dropdown on outside click / Escape
  useEffect(() => {
    if (!prefOpen) return;
    const onDown = (e: MouseEvent) => {
      if (prefRef.current && !prefRef.current.contains(e.target as Node)) setPrefOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPrefOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [prefOpen]);

  const selectedPref = prefectures.find((p) => p.code === prefecture) ?? null;

  // Places of the currently selected prefecture (base set for browse mode)
  const scoped = useMemo(
    () => (prefecture ? places.filter((p) => (p.prefecture ?? "fukuoka") === prefecture) : places),
    [places, prefecture],
  );

  const active = q.trim() !== "";

  const results = useMemo(
    () => (active ? filterPlaces(places, { q, prefecture }, searchConfig) : []),
    [active, q, prefecture, places, searchConfig],
  );

  // Total sticky height = top nav (68px) + this search/chips bar (measured live,
  // since chips can wrap to 2+ rows). Sections carry their top spacing as a
  // margin (outside the border box) so the border-box top IS the heading row —
  // landing it just below the sticky area hides the previous section cleanly.
  const stickyOffset = () => {
    const bar = document.getElementById("categories");
    const gap = typeof window !== "undefined" && window.innerWidth < 640 ? 16 : 24;
    return 68 + (bar?.offsetHeight ?? 120) + gap;
  };

  const scrollToSection = (code: string) => {
    const el = document.getElementById(`sec-${code}`);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - stickyOffset();
    window.scrollTo({ top, behavior: "smooth" });
  };

  // Keep --explore-sticky-offset in sync so the CSS scroll-margin-top fallback
  // (e.g. the hero's #sec-landmark anchor link) lands at the same clean spot.
  useEffect(() => {
    const apply = () => {
      document.documentElement.style.setProperty("--explore-sticky-offset", `${stickyOffset()}px`);
    };
    apply();
    const bar = document.getElementById("categories");
    const ro = bar ? new ResizeObserver(apply) : null;
    if (bar && ro) ro.observe(bar);
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", apply);
      ro?.disconnect();
    };
  }, []);

  // Click a chip → jump to that category section. If a search is active, exit
  // search first (so the sectioned layout renders) then scroll once it mounts.
  const goToSection = (code: string) => {
    if (active) {
      setQ("");
      setPendingScroll(code);
    } else {
      scrollToSection(code);
    }
  };

  useEffect(() => {
    if (pendingScroll && !active) {
      scrollToSection(pendingScroll);
      setPendingScroll(null);
    }
  }, [pendingScroll, active]);

  return (
    <>
      {/* ── STICKY SEARCH BAR + CATEGORY CHIPS ──────────────── */}
      <div
        id="categories"
        className="sticky top-[68px] z-[90] bg-[rgba(250,244,234,0.985)] backdrop-blur-md border-b border-line"
      >
        <div className="max-w-[1240px] mx-auto px-6 py-3.5 flex flex-col gap-3">
          {/* Unified search bar: [ prefecture ▾ | search input ] */}
          <div className="flex flex-col sm:flex-row sm:items-stretch gap-2 sm:gap-0 sm:rounded-full sm:border sm:border-line sm:bg-paper sm:shadow-sm sm:overflow-visible max-w-[640px] w-full">
            {/* Prefecture selector */}
            <div ref={prefRef} className="relative sm:flex-none">
              <button
                type="button"
                onClick={() => setPrefOpen((o) => !o)}
                aria-haspopup="listbox"
                aria-expanded={prefOpen}
                aria-label={t("search_prefecture")}
                className="w-full sm:w-auto flex items-center justify-between sm:justify-start gap-2 px-4 py-2.5 text-[14px] font-semibold text-ink rounded-full sm:rounded-l-full sm:rounded-r-none border border-line sm:border-0 sm:border-r sm:border-line bg-paper hover:bg-rose-soft/50 transition-colors whitespace-nowrap"
              >
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-rose" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {selectedPref ? selectedPref.name : t("search_prefecture")}
                </span>
                <svg
                  className={`w-3.5 h-3.5 text-muted transition-transform ${prefOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {prefOpen && (
                <ul
                  role="listbox"
                  className="absolute left-0 top-[calc(100%+6px)] z-50 min-w-[200px] max-h-[320px] overflow-auto rounded-2xl border border-line bg-paper shadow-card-hover p-1.5"
                >
                  {prefectures.map((p) => {
                    const on = p.code === prefecture;
                    return (
                      <li key={p.code}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={on}
                          onClick={() => {
                            setPrefecture(p.code);
                            setPrefOpen(false);
                          }}
                          className={
                            on
                              ? "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-[13.5px] font-semibold bg-rose-soft text-rose transition-colors"
                              : "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-[13.5px] font-medium text-ink hover:bg-cream transition-colors"
                          }
                        >
                          <span>{p.name}</span>
                          <span className={on ? "text-[12px] text-rose/80" : "text-[12px] text-muted"}>{p.count}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Search input */}
            <div className="relative flex-1 min-w-0">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
              </svg>
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("search_placeholder")}
                aria-label={t("search_placeholder")}
                className="w-full pl-10 pr-9 py-2.5 text-[14px] rounded-full sm:rounded-l-none sm:rounded-r-full border border-line sm:border-0 bg-paper text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-rose/15 sm:focus:ring-0 transition-all"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  aria-label={t("search_clear")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 grid place-items-center rounded-full text-muted hover:text-rose hover:bg-rose-soft transition-all"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>

          {/* Category chips — click to jump to that category section */}
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => goToSection(c.code)}
                className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium text-muted border border-line bg-paper px-3.5 py-[6px] rounded-full hover:bg-rose-soft hover:border-rose/40 hover:text-rose transition-all"
              >
                <span className="text-[13px] leading-none">{c.emoji}</span>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── RESULTS ────────────────────────────────────────── */}
      {active ? (
        <section className="pt-10 pb-2">
          <div className="max-w-[1240px] mx-auto px-6">
            <p className="text-[14px] text-muted mb-6">
              {t("search_results_count", { count: results.length })}
            </p>
            {results.length === 0 ? (
              <div className="bg-paper border border-line rounded-2xl p-10 text-center">
                <p className="text-muted text-[15px]">{t("search_empty")}</p>
              </div>
            ) : (
              <div className={GRID}>
                {results.map((p) => (
                  <Fragment key={p.slug}>{cards[p.slug]}</Fragment>
                ))}
              </div>
            )}
          </div>
        </section>
      ) : (
        /* Browse layout — sectioned by category, scoped to selected prefecture.
           Each section is a preview (max 9 cards) with a "View all" link to the
           full, paginated category page; no per-section pagination. */
        categories.map((c) => {
          const items = scoped.filter((p) => p.category === c.code);
          if (items.length === 0) return null;
          const href = prefecture
            ? `/places?category=${c.code}&prefecture=${prefecture}`
            : `/places?category=${c.code}`;
          return (
            <section key={c.code} id={`sec-${c.code}`} className="explore-section mt-14 pb-2">
              <div className="max-w-[1240px] mx-auto px-6">
                <div className="flex items-center gap-3.5 mb-7">
                  <div className="w-10 h-10 flex-none rounded-xl bg-rose/10 text-[20px] grid place-items-center border border-rose/15">
                    {c.emoji}
                  </div>
                  <h2 className="font-serif text-[clamp(22px,2.8vw,32px)] font-bold tracking-[-0.3px] leading-tight text-ink flex-1 min-w-0">
                    {c.label}
                  </h2>
                  <Link
                    href={href}
                    aria-label={t("view_all_aria", { category: c.label })}
                    className="group inline-flex items-center gap-1 flex-none text-[13px] font-medium text-muted hover:text-rose transition-colors whitespace-nowrap"
                  >
                    <span className="hidden sm:inline">{t("view_all_count", { count: items.length })}</span>
                    <span className="sm:hidden">{t("view_all")}</span>
                    <svg className="w-3.5 h-3.5 text-muted/60 group-hover:text-rose group-hover:translate-x-0.5 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
                <div className={PREVIEW_GRID}>
                  {items.slice(0, PREVIEW_LIMIT).map((p) => (
                    <Fragment key={p.slug}>{cards[p.slug]}</Fragment>
                  ))}
                </div>
              </div>
            </section>
          );
        })
      )}
    </>
  );
}
