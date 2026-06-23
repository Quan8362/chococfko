"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/**
 * Key-city overlay. The map PNG's own labels are tiny and unreadable; we layer
 * our own crisp pins + chips on top for the 5–6 most important destinations.
 * Coordinates are percentages of the *natural* image, so they stay aligned as
 * the map scales. Only shown on lg+, where the image renders uncropped
 * (object-contain); on mobile the image is cropped, so the overlay is hidden.
 *
 * name = romaji chip label · jp = native name shown in the hover tooltip.
 * side controls which way the chip extends so it never runs off the map.
 */
const CITIES: {
  name: string;
  jp: string;
  x: number;
  y: number;
  side: "l" | "r";
}[] = [
  { name: "Sapporo", jp: "札幌", x: 77.5, y: 11.2, side: "r" },
  { name: "Tokyo", jp: "東京", x: 83.1, y: 52.9, side: "r" },
  { name: "Fuji", jp: "富士山", x: 67.3, y: 48.9, side: "l" },
  { name: "Kyoto", jp: "京都", x: 59.5, y: 54.7, side: "l" },
  { name: "Osaka", jp: "大阪", x: 58.4, y: 64.5, side: "l" },
  { name: "Fukuoka", jp: "福岡", x: 20.2, y: 60.0, side: "r" },
];

function CityMarker({ c }: { c: (typeof CITIES)[number] }) {
  const chipSide =
    c.side === "r" ? "left-full ml-2.5" : "right-full mr-2.5";
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${c.x}%`, top: `${c.y}%` }}
    >
      <div className="group/pin relative block pointer-events-auto cursor-default">
        {/* Pin dot */}
        <span className="relative grid place-items-center w-[14px] h-[14px]">
          <span className="absolute inline-flex w-full h-full rounded-full bg-rose/25 scale-0 group-hover/pin:scale-150 transition-transform duration-200" />
          <span className="relative w-[11px] h-[11px] rounded-full bg-rose ring-2 ring-white shadow-[0_2px_6px_-1px_rgba(157,18,72,0.55)] transition-transform duration-200 group-hover/pin:scale-125" />
        </span>

        {/* Label chip */}
        <span
          className={`absolute top-1/2 -translate-y-1/2 ${chipSide} whitespace-nowrap rounded-full bg-cream/85 backdrop-blur-[2px] border border-rose/15 px-2.5 py-1 text-[11px] font-semibold text-ink leading-none shadow-[0_2px_8px_-3px_rgba(60,40,40,0.4)] transition-all duration-200 group-hover/pin:-translate-y-[calc(50%+2px)] group-hover/pin:border-rose/35 group-hover/pin:shadow-[0_8px_18px_-6px_rgba(157,18,72,0.4)]`}
        >
          {c.name}
        </span>

        {/* Hover tooltip — native name teaser */}
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap rounded-lg bg-ink/92 px-2.5 py-1 text-[11px] font-medium text-cream leading-none opacity-0 translate-y-1 transition-all duration-200 group-hover/pin:opacity-100 group-hover/pin:translate-y-0"
        >
          {c.jp} · {c.name}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-x-4 border-x-transparent border-t-4 border-t-ink/92" />
        </span>
      </div>
    </div>
  );
}

export default function HeroMap({ alt }: { alt: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [y, setY] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.innerWidth < 1024) return; // parallax on desktop only

    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const prog = (r.top + r.height / 2 - vh / 2) / vh;
      setY(Math.max(-26, Math.min(26, prog * -34)));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-center mt-2 sm:mt-4 lg:mt-0 mx-auto lg:mx-0 w-full max-w-[440px] sm:max-w-[560px] lg:max-w-none lg:-mr-2 xl:-mr-4 relative pointer-events-none select-none will-change-transform"
      style={{ transform: `translate3d(0, ${y}px, 0)` }}
    >
      {/* Soft brand glow radiating from the map's optical centre — the brightest
          point sits behind central Japan (Tokyo/Mt. Fuji) and feathers out
          seamlessly into the cream, lifting the map off the page. Pink-only,
          low opacity, large + heavily blurred for a soft ambient falloff. */}
      <div
        aria-hidden
        className="hidden lg:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -z-[1] w-[138%] h-[132%] blur-[12px] bg-[radial-gradient(ellipse_56%_50%_at_61%_49%,rgba(194,24,91,0.22),rgba(194,24,91,0.12)_36%,rgba(194,24,91,0.04)_58%,transparent_74%)]"
      />
      <div className="animate-float lg:scale-[1.05] xl:scale-[1.08] origin-center relative">
        <Image
          src="/bg_web.png"
          alt={alt}
          width={1508}
          height={941}
          priority
          sizes="(min-width: 1280px) 62vw, (min-width: 1024px) 56vw, (min-width: 640px) 560px, 88vw"
          className="w-full aspect-[1508/886] object-cover object-bottom lg:aspect-auto lg:h-auto lg:object-contain saturate-[1.05] contrast-[1.02] drop-shadow-[0_26px_50px_rgba(194,24,91,0.12)]"
        />
        {/* City overlay — desktop only (image is uncropped there). */}
        <div className="hidden lg:block absolute inset-0 pointer-events-none">
          {CITIES.map((c) => (
            <CityMarker key={c.name} c={c} />
          ))}
        </div>
      </div>
    </div>
  );
}
