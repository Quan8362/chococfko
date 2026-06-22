// ============================================================
// Reduced-motion helpers (Map UX Phase 9). PURE/testable.
//
// The site-wide CSS `@media (prefers-reduced-motion: reduce)` rule neutralizes
// CSS animations/transitions, but Leaflet pan/zoom/fit are animated in JS and
// ignore it. These helpers let the map honour the OS "reduce motion" setting by
// passing `{ animate:false }` to Leaflet pan/setView/fitBounds.
// ============================================================

interface MediaQueryLike { matches: boolean }
interface WindowLike { matchMedia?: (q: string) => MediaQueryLike }

/** Does the user prefer reduced motion? Safe in SSR/old browsers (→ false). */
export function prefersReducedMotion(win?: WindowLike): boolean {
  const w = win ?? (typeof window !== 'undefined' ? (window as unknown as WindowLike) : undefined);
  try {
    return !!w?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  } catch {
    return false;
  }
}

export interface LeafletMotionOptions { animate: boolean; duration?: number }

/** Leaflet pan/zoom/fit option set: no animation when reduced motion is preferred. */
export function motionOptions(reduced: boolean): LeafletMotionOptions {
  return reduced ? { animate: false } : { animate: true };
}

/** scrollIntoView behavior honoring reduced motion. */
export function scrollBehavior(reduced: boolean): ScrollBehavior {
  return reduced ? 'auto' : 'smooth';
}
