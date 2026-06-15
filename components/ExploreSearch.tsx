"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { filterPlaces } from "@/lib/placeSearch";
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

export default function ExploreSearch({
  places,
  categories,
  prefectures,
  cards,
}: {
  places: Place[];
  categories: CatProp[];
  prefectures: PrefProp[];
  cards: Record<string, React.ReactNode>;
}) {
  const t = useTranslations("home");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [prefecture, setPrefecture] = useState<string | null>(prefectures[0]?.code ?? null);
  const [prefOpen, setPrefOpen] = useState(false);
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

  const active = q.trim() !== "" || selected.length > 0;

  const results = useMemo(
    () => (active ? filterPlaces(places, { q, categories: selected, prefecture }) : []),
    [active, q, selected, prefecture, places],
  );

  const toggleCat = (code: string) =>
    setSelected((s) => (s.includes(code) ? s.filter((c) => c !== code) : [...s, code]));

  const reset = () => {
    setQ("");
    setSelected([]);
  };

  return (
    <>
      {/* ── STICKY SEARCH BAR + CATEGORY CHIPS ──────────────── */}
      <div
        id="categories"
        className="sticky top-[68px] z-[90] bg-[rgba(250,244,234,0.94)] backdrop-blur-md border-b border-line"
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

          {/* Category chips */}
          <div className="flex flex-wrap gap-1.5">
            {categories.map((c) => {
              const on = selected.includes(c.code);
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => toggleCat(c.code)}
                  aria-pressed={on}
                  className={
                    on
                      ? "inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-semibold text-white bg-rose border border-rose px-3.5 py-[6px] rounded-full shadow-[0_4px_12px_-4px_rgba(194,24,91,0.6)] transition-all"
                      : "inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-medium text-muted border border-line bg-paper px-3.5 py-[6px] rounded-full hover:bg-rose-soft hover:border-rose/40 hover:text-rose transition-all"
                  }
                >
                  <span className="text-[13px] leading-none">{c.emoji}</span>
                  {c.label}
                </button>
              );
            })}
            {active && (
              <button
                type="button"
                onClick={reset}
                className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] font-semibold text-rose bg-rose-soft border border-rose/30 px-3.5 py-[6px] rounded-full hover:bg-rose hover:text-white hover:border-rose transition-all"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
                {t("search_clear")}
              </button>
            )}
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
        /* Browse layout — sectioned by category, scoped to selected prefecture */
        categories.map((c, idx) => {
          const items = scoped.filter((p) => p.category === c.code);
          if (items.length === 0) return null;
          return (
            <section key={c.code} id={`sec-${c.code}`} className="pt-14 pb-2 scroll-mt-[140px]">
              <div className="max-w-[1240px] mx-auto px-6">
                <div className="flex items-center gap-3.5 mb-7">
                  <div className="w-10 h-10 flex-none rounded-xl bg-rose/10 text-rose font-bold text-[15px] grid place-items-center border border-rose/15">
                    {idx + 1}
                  </div>
                  <h2 className="font-serif text-[clamp(22px,2.8vw,32px)] font-bold tracking-[-0.3px] leading-tight text-ink flex-1">
                    {c.label}
                  </h2>
                </div>
                <div className={GRID}>
                  {items.map((p) => (
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
