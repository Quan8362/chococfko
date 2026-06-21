"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { buildTopicOrder, planVisibleTopics, type VisiblePlan } from "@/lib/topicFilter";

// useLayoutEffect warns on the server; fall back to useEffect there. The value
// is constant per environment, so this does not break the rules of hooks.
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface Topic {
  code: string;
  label: string;
  emoji: string;
}

interface Props {
  topics: Topic[];
  /** Currently active topic code (kept visible + highlighted), or null. */
  selected: string | null;
  /** Invoked when a topic chip / sheet item is chosen. */
  onSelect: (code: string) => void;
  /** Invoked by the "clear" control in the sheet, when a topic is active. */
  onClear?: () => void;
}

// Layout constants shared by the live row, the hidden measuring row and the
// packing math so measured widths and rendered widths agree.
const CHIP_GAP = 6; // matches gap-1.5 (0.375rem)
const MAX_ROWS = 2;

// One chip's visual style. Reused verbatim by the measuring row so offsetWidth
// reflects exactly what is rendered. `whitespace-nowrap` keeps each chip on a
// single line; `max-w-full` + truncate is a safety net for pathologically long
// labels so a single chip can never push the page wider than its container.
const chipBase =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 " +
  "min-h-[36px] text-[13px] font-medium transition-colors max-w-full " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40";
const chipIdle = "text-muted border-line bg-paper hover:bg-rose-soft hover:border-rose/40 hover:text-rose";
const chipActive = "text-rose border-rose/50 bg-rose-soft";

/**
 * Content-aware topic chips. Measures the real chip + container widths and shows
 * only the quick topics that fit within two rows; the rest live behind an
 * "All topics" bottom sheet. When everything fits (tablet/desktop, short
 * languages) it renders the full inline list with no trigger — no per-device
 * breakpoints, it simply reacts to the available width / text size / language.
 */
export default function TopicFilter({ topics, selected, onSelect, onClear }: Props) {
  const t = useTranslations("home");

  // null = not yet measured → render the full set (SSR-safe, matches hydration).
  const [plan, setPlan] = useState<VisiblePlan | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const measureRowRef = useRef<HTMLDivElement>(null);
  const triggerMeasureRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const byCode = useMemo(() => {
    const m = new Map<string, Topic>();
    for (const tp of topics) m.set(tp.code, tp);
    return m;
  }, [topics]);

  // Recompute the visible plan from live measurements. Cheap (≤ ~16 chips) so we
  // just re-read every width on each call rather than cache — handles text-zoom
  // and font-load width changes for free.
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const row = measureRowRef.current;
    if (!wrap || !row) return;

    const containerWidth = wrap.clientWidth;
    const widths = new Map<string, number>();
    for (const el of Array.from(row.children) as HTMLElement[]) {
      const code = el.dataset.code;
      if (code) widths.set(code, el.offsetWidth);
    }
    const triggerWidth = triggerMeasureRef.current?.offsetWidth ?? 0;
    const width = (code: string) => widths.get(code) ?? 0;

    const naturalOrder = topics.map((tp) => tp.code);
    const common = { width, containerWidth, triggerWidth, gap: CHIP_GAP, maxRows: MAX_ROWS };
    let next = planVisibleTopics({ order: naturalOrder, ...common });
    // Only reorder (hoist the selected topic) when we actually have to collapse,
    // so the inline desktop/tablet layout never reshuffles on selection.
    if (next.mode === "compact" && selected && byCode.has(selected)) {
      next = planVisibleTopics({ order: buildTopicOrder(naturalOrder, selected), ...common });
    }
    setPlan((prev) =>
      prev &&
      prev.mode === next.mode &&
      prev.hiddenCount === next.hiddenCount &&
      prev.visible.length === next.visible.length &&
      prev.visible.every((c, i) => c === next.visible[i])
        ? prev
        : next,
    );
  }, [topics, selected, byCode]);

  // Measure synchronously before paint to avoid a flash of the full chip set.
  useIsoLayoutEffect(() => {
    measure();
  }, [measure]);

  // Re-measure on container resize (rotation, side panels, zoom) via rAF batch.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    });
    ro.observe(wrap);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [measure]);

  const mode = plan?.mode ?? "inline";
  const visibleCodes = plan ? plan.visible : topics.map((tp) => tp.code);
  const hiddenCount = plan?.hiddenCount ?? 0;
  const showTrigger = mode === "compact";

  const pick = useCallback(
    (code: string) => {
      setSheetOpen(false);
      // Defer the jump-to-section until after the sheet unmounts and its scroll
      // lock releases (which restores scrollY); otherwise that restore would
      // override the section scroll and snap back to the original position.
      requestAnimationFrame(() => onSelect(code));
    },
    [onSelect],
  );

  return (
    <div ref={wrapRef} className="relative">
      {/* Hidden measuring row: every chip + the trigger, laid out on one line so
          offsetWidth is each item's natural width. aria-hidden / not focusable. */}
      <div
        ref={measureRowRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 flex h-0 flex-nowrap gap-1.5 overflow-hidden opacity-0"
      >
        {topics.map((tp) => (
          <span key={tp.code} data-code={tp.code} className={`${chipBase} ${chipIdle}`}>
            <span className="text-[14px] leading-none">{tp.emoji}</span>
            {tp.label}
          </span>
        ))}
        <span ref={triggerMeasureRef} className={`${chipBase} font-semibold`}>
          <GridIcon />
          {t("all_topics")}
          {/* Reserve room for the count badge so packing never overflows. */}
          <span className="ml-0.5 inline-grid min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-bold leading-[18px]">
            00
          </span>
        </span>
      </div>

      {/* Live chip row. Capped to two rows while unmeasured so pre-hydration HTML
          never balloons; once measured the plan controls the exact chip count. */}
      <div
        className={`flex flex-wrap gap-1.5 ${plan ? "" : "max-h-[80px] overflow-hidden"}`}
      >
        {visibleCodes.map((code) => {
          const tp = byCode.get(code);
          if (!tp) return null;
          const on = selected === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => onSelect(code)}
              aria-pressed={on}
              aria-label={on ? `${tp.label} — ${t("current_topic")}` : undefined}
              className={`${chipBase} ${on ? chipActive : chipIdle}`}
            >
              <span className="text-[14px] leading-none">{tp.emoji}</span>
              <span className="truncate">{tp.label}</span>
            </button>
          );
        })}

        {showTrigger && (
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={sheetOpen}
            className={`${chipBase} font-semibold text-rose border-rose/40 bg-rose-soft/60 hover:bg-rose-soft`}
          >
            <GridIcon />
            {t("all_topics")}
            {hiddenCount > 0 && (
              <span className="ml-0.5 inline-grid min-w-[18px] place-items-center rounded-full bg-rose/15 px-1 text-[11px] font-bold leading-[18px] text-rose">
                {hiddenCount}
              </span>
            )}
          </button>
        )}
      </div>

      {sheetOpen && (
        <TopicSheet
          topics={topics}
          selected={selected}
          onPick={pick}
          onClear={onClear}
          onClose={() => setSheetOpen(false)}
          restoreFocusRef={triggerRef}
        />
      )}
    </div>
  );
}

/* ── Bottom sheet ──────────────────────────────────────────────────────── */

function TopicSheet({
  topics,
  selected,
  onPick,
  onClear,
  onClose,
  restoreFocusRef,
}: {
  topics: Topic[];
  selected: string | null;
  onPick: (code: string) => void;
  onClear?: () => void;
  onClose: () => void;
  restoreFocusRef: React.RefObject<HTMLElement>;
}) {
  const t = useTranslations("home");
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [mounted, setMounted] = useState(false);

  // Portal target only exists on the client; gate the first render so SSR and
  // hydration agree (nothing is rendered server-side for the open sheet).
  useEffect(() => setMounted(true), []);

  // iOS-safe background scroll lock: `overflow:hidden` on <body> does NOT stop
  // scrolling in iOS Safari, so we pin the body with position:fixed at the
  // current offset and restore the exact scroll position on close. paddingRight
  // compensates for the now-removed scrollbar to avoid a horizontal shift.
  useEffect(() => {
    const body = document.body;
    const scrollY = window.scrollY;
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    if (sbw > 0) body.style.paddingRight = `${sbw}px`;

    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      body.style.paddingRight = prev.paddingRight;
      // Jump straight to the saved offset (no smooth scroll) to feel seamless.
      window.scrollTo(0, scrollY);
    };
  }, []);

  // Focus the close button (a non-input control, so iOS won't pop the keyboard),
  // trap focus, and close on Escape. Restore focus to the trigger on unmount.
  useEffect(() => {
    closeRef.current?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);

    return () => {
      document.removeEventListener("keydown", onKey, true);
      restoreFocusRef.current?.focus({ preventScroll: true });
    };
  }, [onClose, restoreFocusRef]);

  if (!mounted) return null;

  // Rendered through a portal into <body> so it escapes the sticky search bar's
  // backdrop-filter containing block (which otherwise traps position:fixed and
  // pins the sheet inside the ~120px header box). z-[200] sits above the nav
  // header (z-100) and the sticky chips bar (z-90).
  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center sm:items-center motion-safe:animate-fadein"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      {/* Backdrop — covers the entire viewport including the header. */}
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" />

      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: "min(85svh, calc(100dvh - env(safe-area-inset-top) - 24px))" }}
        className="relative flex w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl bg-paper shadow-card-hover motion-safe:animate-sheetup sm:mx-4 sm:rounded-2xl"
      >
        {/* Non-scrolling header (handle + title + close) stays pinned. */}
        <div className="flex-none">
          {/* Grab handle (phones) */}
          <div className="pt-2 sm:hidden" aria-hidden="true">
            <div className="mx-auto h-1 w-9 rounded-full bg-line" />
          </div>

          <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-3 sm:pt-4">
            <h2 id={titleId} className="font-serif text-[17px] font-bold text-ink">
              {t("select_topic")}
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label={t("topic_close")}
              className="grid h-9 w-9 flex-none place-items-center rounded-lg text-muted transition-colors hover:bg-line hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable topic list — the only scroller. min-h-0 lets it shrink
            inside the flex column; touch-action/overscroll keep iOS swipes in. */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-1 [touch-action:pan-y] [-webkit-overflow-scrolling:touch] pb-[max(env(safe-area-inset-bottom),16px)]"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {topics.map((tp) => {
              const on = selected === tp.code;
              return (
                <button
                  key={tp.code}
                  type="button"
                  onClick={() => onPick(tp.code)}
                  aria-pressed={on}
                  className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40 ${
                    on
                      ? "border-rose/50 bg-rose-soft text-rose"
                      : "border-line bg-paper text-ink hover:border-rose/30 hover:bg-cream"
                  }`}
                >
                  <span className="flex-none text-[16px] leading-none">{tp.emoji}</span>
                  <span className="min-w-0 break-words leading-snug">{tp.label}</span>
                </button>
              );
            })}
          </div>

          {selected && onClear && (
            <button
              type="button"
              onClick={() => {
                onClear();
                onClose();
              }}
              className="mt-3 mb-1 w-full rounded-xl border border-line py-2.5 text-[13.5px] font-medium text-muted transition-colors hover:border-rose/30 hover:text-rose focus:outline-none focus-visible:ring-2 focus-visible:ring-rose/40"
            >
              {t("clear_topic")}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function GridIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 6h16M4 12h16M4 18h16"
      />
    </svg>
  );
}
