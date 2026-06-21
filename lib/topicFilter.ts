// Pure, framework-free helpers for the compact topic-filter (homepage category
// chips). Kept out of React so the row-packing / priority logic is unit-testable
// with `node --test` and reusable by both the compact bar and the full sheet.
//
// The chips are *content-aware*: instead of a per-device breakpoint we measure
// the real chip widths and the container width, then decide how many "quick"
// chips fit within a small number of rows. The same source list drives the
// compact bar and the "All topics" sheet — there is no second topic array.

/** A topic chip plus its natural (single-line) rendered width in px. */
export interface MeasuredTopic {
  code: string;
  /** offsetWidth of the chip when laid out on one line, in CSS px. */
  width: number;
}

export interface VisiblePlan {
  /**
   * `inline`  → every topic fits within `maxRows`; render them all, no trigger.
   * `compact` → topics overflow; render `visible` quick chips + the trigger.
   */
  mode: "inline" | "compact";
  /** Codes shown as quick chips, in display order. */
  visible: string[];
  /** Topics not shown inline (reachable via the "All topics" trigger). */
  hiddenCount: number;
}

/**
 * Priority order for the compact bar:
 *   1. the currently selected topic (if any),
 *   2. the configured/featured order (the curated `allCodes` order),
 *   3. everything else (already covered by 2).
 * The selected topic is hoisted to the front so it stays visible; it is never
 * duplicated. Returns codes only — widths are looked up separately.
 */
export function buildTopicOrder(allCodes: string[], selected?: string | null): string[] {
  if (!selected || !allCodes.includes(selected)) return [...allCodes];
  return [selected, ...allCodes.filter((c) => c !== selected)];
}

/**
 * Number of rows needed to flow `widths` (in order) into a container of
 * `containerWidth`, separated by `gap`. An item wider than the container still
 * occupies its own row (never returns a "0-row" result). Empty → 0 rows.
 */
function rowsNeeded(widths: number[], containerWidth: number, gap: number): number {
  let rows = 0;
  let used = 0;
  for (const w of widths) {
    if (rows === 0) {
      rows = 1;
      used = w;
    } else if (used + gap + w <= containerWidth) {
      used += gap + w;
    } else {
      rows += 1;
      used = w;
    }
  }
  return rows;
}

/**
 * Decide which quick chips to show. Packs chips in `order` into at most
 * `maxRows`. If they all fit (without needing a trigger) the bar stays inline;
 * otherwise it collapses to the longest prefix of `order` that still fits
 * alongside the always-present "All topics" trigger.
 *
 * Guarantees:
 *  - the trigger is always reachable in compact mode (it is packed last and
 *    never dropped — chips are dropped to make room for it instead);
 *  - the first item of `order` (the selected/priority topic) stays visible as
 *    long as it plus the trigger fit within `maxRows` (true for any sane
 *    `maxRows >= 1` since a chip + trigger fit across two rows).
 */
export function planVisibleTopics(opts: {
  order: string[];
  width: (code: string) => number;
  containerWidth: number;
  triggerWidth: number;
  gap: number;
  maxRows: number;
}): VisiblePlan {
  const { order, width, containerWidth, triggerWidth, gap, maxRows } = opts;

  if (order.length === 0) return { mode: "inline", visible: [], hiddenCount: 0 };

  // Not yet measured (container width unknown): treat as inline so SSR / first
  // paint renders the full set; the caller re-runs this once measured.
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return { mode: "inline", visible: [...order], hiddenCount: 0 };
  }

  const allWidths = order.map(width);
  if (rowsNeeded(allWidths, containerWidth, gap) <= maxRows) {
    return { mode: "inline", visible: [...order], hiddenCount: 0 };
  }

  // Overflow → find the largest prefix that fits together with the trigger.
  let count = 0;
  for (let k = order.length; k >= 0; k--) {
    const widths = order.slice(0, k).map(width);
    widths.push(triggerWidth); // trigger always reserved at the end
    if (rowsNeeded(widths, containerWidth, gap) <= maxRows) {
      count = k;
      break;
    }
  }

  return {
    mode: "compact",
    visible: order.slice(0, count),
    hiddenCount: order.length - count,
  };
}
