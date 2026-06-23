"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

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
      </div>
    </div>
  );
}
