"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/**
 * Hero map visual. The PNG is a fixed asset — we only enhance it through its
 * container: a soft brand glow behind it, a gentle idle float, a subtle
 * scroll-parallax (desktop only), and a grounding drop shadow.
 *
 * Mobile keeps the cropped framing (object-cover/-bottom over the near-empty
 * transparent top of the PNG); desktop shows the full intrinsic image.
 */
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
      // Progress of the element centre through the viewport, clamped so the
      // shift stays subtle and never detaches the map from the layout.
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
      {/* Soft brand glow — fills the right side so it balances the text block. */}
      <div
        aria-hidden
        className="hidden lg:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 -z-[1] w-[122%] h-[118%] rounded-full blur-[2px] bg-[radial-gradient(ellipse_at_56%_46%,rgba(194,24,91,0.11),rgba(31,143,166,0.055)_46%,transparent_72%)]"
      />
      <div className="animate-float lg:scale-[1.05] xl:scale-[1.08] origin-center">
        <Image
          src="/bg_web.png"
          alt={alt}
          width={1508}
          height={941}
          priority
          sizes="(min-width: 1280px) 62vw, (min-width: 1024px) 56vw, (min-width: 640px) 560px, 88vw"
          className="w-full aspect-[1508/886] object-cover object-bottom lg:aspect-auto lg:h-auto lg:object-contain saturate-[1.08] contrast-[1.02] drop-shadow-[0_26px_50px_rgba(194,24,91,0.12)]"
        />
      </div>
    </div>
  );
}
