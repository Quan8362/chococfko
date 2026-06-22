// Pure helpers for the saved-places set (guest localStorage + login merge).
// DOM/localStorage access lives in the provider; these are unit-testable.

/** Merge two slug lists, de-duplicating while preserving first-seen order. */
export function mergeSlugs(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...a, ...b]) {
    const v = (s ?? '').trim();
    if (v && !seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
}

/** Toggle a slug in a list (add if missing, remove if present). De-duplicated. */
export function toggleSlug(list: string[], slug: string): string[] {
  return list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];
}

export function parseSlugs(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
