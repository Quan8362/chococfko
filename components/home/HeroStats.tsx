"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

function useCountUp(target: number, run: boolean, duration = 1100) {
  const [val, setVal] = useState(run ? 0 : target);
  useEffect(() => {
    if (!run) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setVal(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setVal(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, duration]);
  return val;
}

/** Refined vertical divider — a hairline that fades at both ends. */
function Divider() {
  return (
    <span
      aria-hidden
      className="w-px h-10 bg-gradient-to-b from-transparent via-line to-transparent"
    />
  );
}

export default function HeroStats({
  places,
  categories,
}: {
  places: number;
  categories: number;
}) {
  const t = useTranslations("home");
  const ref = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(false);

  // Start the count-up when the block first enters the viewport (on load it is
  // above the fold, so this fires immediately).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setRun(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const p = useCountUp(places, run);
  const c = useCountUp(categories, run);

  return (
    <div
      ref={ref}
      className="group inline-flex items-center gap-x-5 sm:gap-x-7 px-5 sm:px-7 py-4 rounded-2xl bg-paper/85 border border-line shadow-[0_10px_34px_-18px_rgba(60,40,40,0.5)] backdrop-blur-[2px] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_rgba(60,40,40,0.55)] hover:border-rose/20"
    >
      <div className="text-center">
        <b className="font-serif text-[26px] font-bold block leading-none text-rose-deep tabular-nums">
          {p}
        </b>
        <span className="text-[11.5px] text-muted mt-2 block">{t("stat_places")}</span>
      </div>

      <Divider />

      <div className="text-center">
        <b className="font-serif text-[26px] font-bold block leading-none text-rose-deep tabular-nums">
          {c}
        </b>
        <span className="text-[11.5px] text-muted mt-2 block">{t("stat_categories")}</span>
      </div>

      <Divider />

      {/* Community status — a distinct badge rather than a faux number, so the
          three slots stay visually consistent. */}
      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-soft px-2.5 py-1 text-[12.5px] font-semibold text-rose-deep leading-none">
          <span className="relative flex h-2 w-2">
            <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-rose/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-rose" />
          </span>
          {t("stat_community_value")}
        </span>
        <span className="text-[11.5px] text-muted mt-2 block">
          {t("stat_community_label")}
        </span>
      </div>
    </div>
  );
}
