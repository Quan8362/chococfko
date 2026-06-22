// Pure metric helpers for the Admin Explore-insights dashboard. The cardinal
// rule: NEVER fabricate a metric. When a denominator is zero (no historical
// data), rate() returns null and formatPct() renders an em dash — the dashboard
// shows "no data", not a fake 0% or 100%.

/** Ratio in [0,1], or null when there's nothing to divide by. */
export function rate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

/** Percentage string, or '—' when the rate is null/unknown. */
export function formatPct(r: number | null, digits = 1): string {
  if (r == null) return '—';
  return `${(r * 100).toFixed(digits)}%`;
}

/** Count-or-dash for raw totals (distinguishes "0 (real)" from "unknown"). */
export function formatCount(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString();
}

export interface SearchTotals {
  total: number;
  withResults: number;
  clicked: number;
}

/** Search-quality rates from raw search_queries totals. */
export function searchRates(t: SearchTotals): {
  successRate: number | null;
  zeroResultRate: number | null;
  clickThroughRate: number | null;
} {
  return {
    successRate: rate(t.withResults, t.total),
    zeroResultRate: rate(t.total - t.withResults, t.total),
    clickThroughRate: rate(t.clicked, t.total),
  };
}

/** Share of sessions that completed >= 1 useful action. */
export function usefulActionRate(sessionsWithUsefulAction: number, totalSessions: number): number | null {
  return rate(sessionsWithUsefulAction, totalSessions);
}
