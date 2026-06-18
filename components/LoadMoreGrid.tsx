"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Progressive "Load more" grid. Cards are pre-rendered on the server (PlaceCard
 * is async) and passed in as an array of nodes; this component only controls how
 * many are revealed, so no extra data is fetched on the client.
 */
export default function LoadMoreGrid({
  cards,
  initial = 12,
  step = 12,
}: {
  cards: React.ReactNode[];
  initial?: number;
  step?: number;
}) {
  const t = useTranslations("home");
  const [count, setCount] = useState(initial);
  const hasMore = count < cards.length;

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {cards.slice(0, count)}
      </div>

      {(hasMore || cards.length > initial) && (
        <div className="mt-10 flex justify-center">
          {hasMore ? (
            <button
              type="button"
              onClick={() => setCount((c) => c + step)}
              className="inline-flex items-center gap-2 font-semibold text-[14px] px-7 py-3 rounded-full border border-rose/40 text-rose bg-rose-soft hover:bg-rose hover:text-white hover:border-rose transition-all"
            >
              {t("load_more")}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          ) : (
            <p className="text-[13px] text-muted">{t("no_more")}</p>
          )}
        </div>
      )}
    </>
  );
}
