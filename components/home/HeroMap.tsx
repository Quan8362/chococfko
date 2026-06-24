"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

// Location markers rendered as a DOM overlay on top of the (label-free) base
// illustration. Coordinates are percentages of the image box (left/top), so
// they stay aligned at every breakpoint as long as the container keeps the
// image's native aspect ratio (1586×992) with object-contain — no letterbox,
// percentages map 1:1. Calibrated visually against /bg_web.png.
//
// labelTier — single source of truth for which markers render (dot + label are
// one unit; a dot never shows without its label):
//   'all'     → dot + label on mobile + tablet + desktop (6 anchor cities)
//   'desktop' → dot + label ONLY at ≥1280px (xl); nothing below (4 cities)
//   'none'    → not rendered at all (kept in the array + i18n for future use)
// left/top — the DOT position (% of the image box). Calibrated to sit ON LAND
// just BESIDE the city's landmark illustration (never on top of it, never in
// the sea), verified against the bg_web.png alpha mask.
// labelPos — which side the chip sits relative to its dot, offset into open
// sea / empty land so it covers no illustration and no other label.
type LabelTier = "all" | "desktop" | "none";
type LabelPos = "top" | "bottom" | "left" | "right";
const MARKERS: {
  id: string;
  left: number;
  top: number;
  labelTier: LabelTier;
  labelPos: LabelPos;
}[] = [
  { id: "sapporo", left: 70, top: 18, labelTier: "all", labelPos: "left" },
  { id: "sendai", left: 82, top: 30, labelTier: "none", labelPos: "right" },
  { id: "nikko", left: 72, top: 44, labelTier: "none", labelPos: "top" },
  { id: "tokyo", left: 87, top: 53, labelTier: "all", labelPos: "right" },
  { id: "yokohama", left: 83, top: 52, labelTier: "none", labelPos: "right" },
  { id: "kamakura", left: 80, top: 55, labelTier: "none", labelPos: "bottom" },
  { id: "hakone", left: 74, top: 53, labelTier: "none", labelPos: "top" },
  { id: "mount_fuji", left: 72, top: 54, labelTier: "desktop", labelPos: "top" },
  { id: "nagoya", left: 60, top: 59, labelTier: "desktop", labelPos: "bottom" },
  { id: "nara", left: 65, top: 66, labelTier: "desktop", labelPos: "right" },
  { id: "osaka", left: 53, top: 69, labelTier: "all", labelPos: "bottom" },
  { id: "kobe", left: 46, top: 58, labelTier: "none", labelPos: "left" },
  { id: "kyoto", left: 50, top: 53, labelTier: "all", labelPos: "top" },
  { id: "kanazawa", left: 48, top: 43, labelTier: "none", labelPos: "top" },
  { id: "shirakawago", left: 58, top: 38, labelTier: "none", labelPos: "top" },
  { id: "hiroshima", left: 38, top: 58, labelTier: "desktop", labelPos: "left" },
  { id: "miyajima", left: 36, top: 69, labelTier: "none", labelPos: "bottom" },
  { id: "beppu", left: 24, top: 72, labelTier: "none", labelPos: "bottom" },
  { id: "dazaifu", left: 24, top: 57, labelTier: "none", labelPos: "right" },
  { id: "fukuoka", left: 19, top: 58, labelTier: "all", labelPos: "left" },
  { id: "nagasaki", left: 10, top: 73, labelTier: "none", labelPos: "left" },
  { id: "okinawa", left: 10, top: 90, labelTier: "all", labelPos: "top" },
];

// Chip placement classes per side. Each anchors the chip off the dot and adds a
// small directional lift on hover (composes with the centring translate vars).
const CHIP_POS: Record<LabelPos, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5 group-hover:-translate-y-0.5",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5 group-hover:translate-y-0.5",
  left: "right-full top-1/2 -translate-y-1/2 mr-1.5 group-hover:-translate-x-0.5",
  right: "left-full top-1/2 -translate-y-1/2 ml-1.5 group-hover:translate-x-0.5",
};

export default function HeroMap({ alt }: { alt: string }) {
  const t = useTranslations("home.map_markers");
  const ref = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const [y, setY] = useState(0);

  // Idle float driven by requestAnimationFrame instead of a CSS @keyframe.
  // A CSS animation is bound to the document timeline, which keeps advancing
  // while the tab is hidden / the window is unfocused but not composited — so
  // on refocus the browser paints the new timeline position and the map
  // visibly jumps. rAF, by contrast, only fires for frames that are actually
  // rendered: it stops while the tab is hidden and throttles while the window
  // is blurred, so `phase` only advances during active frames. A per-frame
  // delta clamp absorbs the large timestamp gap on the first frame after a
  // resume, so the map holds its position and never jumps — covering both the
  // tab-switch and window-refocus cases. Disabled under reduced-motion.
  useEffect(() => {
    const el = floatRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const AMP = 4.5; // px — half of the original 9px travel
    const PERIOD = 13000; // ms for a full 0 → -9 → 0 cycle (old 6.5s alternate)
    let phase = 0;
    let last = 0;
    let raf = 0;

    const frame = (now: number) => {
      if (last === 0) last = now;
      let dt = now - last;
      last = now;
      if (dt > 50) dt = 16; // clamp the resume gap so it never steps
      phase += (dt / PERIOD) * Math.PI * 2;
      const offset = AMP * Math.cos(phase) - AMP; // 0 → -9 → 0, like floatY
      el.style.transform = `translateY(${offset.toFixed(2)}px)`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

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
      /* Desktop: a mid-size map, right-aligned in its grid track but pulled
         left so its right edge sits ~115px inside the viewport on every width.
         Because the map is wider than its track, that single leftward shift
         both opens clear safe padding on the right (no clipped cities) and
         closes the gap to the text column — the horizontal slack lands roughly
         balanced left/right instead of all on the left. The mr formula anchors
         to the viewport edge regardless of the centred container (the min()
         clause accounts for the container capping at 1280px). The landmass +
         all labels stay inside; only the soft glow feathers off the edge. The
         hero <section> has overflow-hidden so nothing creates an h-scroll.
         Below lg the map is centred + contained. */
      className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-center lg:justify-self-end mt-2 sm:mt-4 lg:mt-0 mx-auto lg:ml-0 lg:mr-[calc(min(0px,_(1280px_-_100vw)_/_2)_+_90px)] w-full max-w-[440px] sm:max-w-[560px] lg:max-w-none lg:w-[44vw] xl:w-[min(44vw,1380px)] relative pointer-events-none select-none will-change-transform"
      style={{ transform: `translate3d(0, ${y}px, 0)` }}
    >
      {/* Soft brand glow radiating from the map's optical centre — the brightest
          point sits behind central Japan (Tokyo/Mt. Fuji) and feathers out
          seamlessly into the cream, lifting the map off the page. Pink-only,
          low opacity, large + heavily blurred for a soft ambient falloff. */}
      <div
        aria-hidden
        className="hidden lg:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -z-[1] w-[126%] h-[120%] blur-[10px] bg-[radial-gradient(ellipse_56%_50%_at_58%_49%,rgba(194,24,91,0.22),rgba(194,24,91,0.12)_36%,rgba(194,24,91,0.04)_58%,transparent_74%)]"
      />
      <div ref={floatRef} className="origin-center relative will-change-transform">
        <Image
          src="/bg_web.png?v=3"
          alt={alt}
          width={1586}
          height={992}
          priority
          sizes="(min-width: 1024px) 44vw, (min-width: 640px) 560px, 88vw"
          className="w-full aspect-[1586/992] object-contain saturate-[1.05] contrast-[1.02] drop-shadow-[0_26px_50px_rgba(194,24,91,0.12)]"
        />

        {/* Marker overlay — sits exactly over the image box (object-contain +
            matching aspect ratio ⇒ no letterbox), so percentage left/top map
            straight onto the illustration. The parent map div is
            pointer-events-none; each marker re-enables pointer events so hover
            works without blocking page scroll elsewhere. */}
        <div className="absolute inset-0">
          {MARKERS.map((m, i) => {
            // Dot + label render as one unit; tier decides whether (and where)
            // it shows. 'none' renders nothing; 'desktop' shows only ≥xl.
            if (m.labelTier === "none") return null;
            const gated = m.labelTier === "desktop" ? "hidden xl:block" : "";
            return (
              <div
                key={m.id}
                className={`group absolute z-[2] pointer-events-auto hover:z-20 ${gated}`}
                style={{ left: `${m.left}%`, top: `${m.top}%`, transform: "translate(-50%, -50%)" }}
              >
                <span
                  className={`pointer-events-none absolute whitespace-nowrap rounded-full border border-rose/15 bg-cream/85 px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold leading-none text-ink/90 shadow-[0_1px_4px_rgba(120,60,40,0.18)] backdrop-blur-[1px] transition-all duration-200 ease-out group-hover:bg-cream group-hover:shadow-[0_6px_16px_-4px_rgba(194,24,91,0.35)] ${CHIP_POS[m.labelPos]}`}
                >
                  {t(m.id)}
                </span>
                {/* Pin dot — solid brand-magenta dot with a soft expanding ring,
                    reusing the community status indicator's animate-ping. Stagger
                    the ring per index so they pulse organically; motion-safe drops
                    the pulse entirely under prefers-reduced-motion. */}
                <span className="relative flex h-2 w-2">
                  <span
                    className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-rose/60"
                    style={{ animationDelay: `${(i * 120) % 960}ms` }}
                  />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-rose shadow-[0_0_0_2px_rgba(255,255,255,0.85),0_2px_5px_rgba(194,24,91,0.45)] transition-transform duration-200 ease-out group-hover:scale-150" />
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
