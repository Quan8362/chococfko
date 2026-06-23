"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export default function HeroMap({ alt }: { alt: string }) {
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
          src="/bg_web.png?v=2"
          alt={alt}
          width={1508}
          height={941}
          priority
          sizes="(min-width: 1024px) 44vw, (min-width: 640px) 560px, 88vw"
          className="w-full aspect-[1508/886] object-cover object-bottom lg:aspect-auto lg:h-auto lg:object-contain saturate-[1.05] contrast-[1.02] drop-shadow-[0_26px_50px_rgba(194,24,91,0.12)]"
        />
      </div>
    </div>
  );
}
