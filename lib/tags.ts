import type { SupabaseClient } from '@supabase/supabase-js'
import { findSystemTag } from './systemTags'

// ── Constants ───────────────────────────────────────────────
export const MAX_TAGS = 10
export const MAX_TAG_LEN = 30

export type TagContentType = 'place' | 'post' | 'listing'

// Per-locale display columns + the minimum a UI needs to render a localized chip.
// Stored tags carry their own translations (set at creation / via the seed);
// proper nouns leave them null and fall back to `name`.
export interface LocalizedTag {
  name: string
  slug: string
  display_name_vi?: string | null
  display_name_en?: string | null
  display_name_ja?: string | null
  display_name_ko?: string | null
  display_name_zh?: string | null
}

export interface Tag extends LocalizedTag {
  id: string
  normalized_name: string
  usage_count: number
  is_system_tag?: boolean
}

// Columns selected wherever a tag is read for display.
const TAG_COLS =
  'id, name, slug, normalized_name, usage_count, is_system_tag, display_name_vi, display_name_en, display_name_ja, display_name_ko, display_name_zh'

/** Display name for the current UI locale; falls back to the original name. */
export function getLocalizedTagName(tag: LocalizedTag, locale: string): string {
  const key = `display_name_${locale}` as keyof LocalizedTag
  const value = tag[key]
  return typeof value === 'string' && value.trim() ? value : tag.name
}

// ── Normalization (must mirror SQL public.tag_normalize) ────
/** lower + trim + collapse internal whitespace. Empty string when blank. */
export function normalizeTagName(name: string): string {
  return (name ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * URL-safe slug for a tag. Prefers an ASCII slug (diacritics stripped) so latin
 * & Vietnamese tags get clean SEO URLs; falls back to a stable hashed slug when
 * the name is non-latin only (e.g. CJK), keeping every slug non-empty & 1:1 with
 * the normalized name.
 */
export function slugifyTag(name: string): string {
  const normalized = normalizeTagName(name)
  const ascii = normalized
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (ascii) return ascii.slice(0, 60)
  // Non-latin only → stable short hash so the slug is deterministic & unique.
  let h = 0
  for (let i = 0; i < normalized.length; i++) {
    h = (h * 31 + normalized.charCodeAt(i)) >>> 0
  }
  return 'tag-' + h.toString(36)
}

/**
 * Parse a raw tags field (comma-separated string or JSON array) into a clean,
 * de-duplicated list of display names. Trims, caps length, drops duplicates
 * (case-insensitive) and the max-tag count.
 */
export function parseTagsInput(raw: unknown): string[] {
  let parts: string[] = []
  if (Array.isArray(raw)) {
    parts = raw.map((x) => String(x))
  } else if (typeof raw === 'string') {
    const s = raw.trim()
    if (s.startsWith('[')) {
      try {
        const arr = JSON.parse(s)
        if (Array.isArray(arr)) parts = arr.map((x) => String(x))
      } catch {
        parts = s.split(',')
      }
    } else {
      parts = s.split(',')
    }
  }

  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    const display = part.trim().slice(0, MAX_TAG_LEN).trim()
    const norm = normalizeTagName(display)
    if (!norm || seen.has(norm)) continue
    seen.add(norm)
    out.push(display)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

// ── Write (service-role only) ───────────────────────────────
/**
 * Replace the full tag set for a piece of content. Creates any missing tags
 * (case-insensitive), syncs the polymorphic join rows, and refreshes usage
 * counts. Best-effort: never throws — tags are secondary metadata and must not
 * break content submission. Pass an admin (service-role) client.
 */
export async function setContentTags(
  admin: SupabaseClient,
  contentType: TagContentType,
  contentId: string,
  rawTags: unknown,
): Promise<void> {
  try {
    const names = parseTagsInput(rawTags)

    // Resolve / create tag ids for the desired set.
    const desiredIds: string[] = []
    for (const name of names) {
      const id = await resolveTagId(admin, name)
      if (id) desiredIds.push(id)
    }

    // Current join rows for this content.
    const { data: currentRows } = await admin
      .from('content_tags')
      .select('tag_id')
      .eq('content_type', contentType)
      .eq('content_id', contentId)
    const currentIds = (currentRows ?? []).map((r) => (r as { tag_id: string }).tag_id)

    const toInsert = desiredIds.filter((id) => !currentIds.includes(id))
    const toDelete = currentIds.filter((id) => !desiredIds.includes(id))

    if (toInsert.length) {
      await admin.from('content_tags').insert(
        toInsert.map((tag_id) => ({ tag_id, content_type: contentType, content_id: contentId })),
      )
    }
    if (toDelete.length) {
      await admin
        .from('content_tags')
        .delete()
        .eq('content_type', contentType)
        .eq('content_id', contentId)
        .in('tag_id', toDelete)
    }

    const affected = Array.from(new Set([...toInsert, ...toDelete]))
    if (affected.length) {
      await admin.rpc('refresh_tag_usage', { p_tag_ids: affected })
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Get-or-create a tag id for a user-entered (any-language) label.
 * If the label matches a system tag (in any locale/alias), it resolves to that
 * tag's single canonical row (with translations), so the same concept added in
 * different languages never duplicates. Otherwise it's a normal user tag.
 */
async function resolveTagId(admin: SupabaseClient, displayName: string): Promise<string | null> {
  const name = displayName.trim().slice(0, MAX_TAG_LEN).trim()
  if (!normalizeTagName(name)) return null

  const sys = findSystemTag(name)
  if (sys) {
    return insertOrGetTag(admin, {
      name: sys.canonical,
      normalized: normalizeTagName(sys.canonical),
      slug: sys.slug,
      extra: {
        is_system_tag: true,
        display_name_vi: sys.vi,
        display_name_en: sys.en,
        display_name_ja: sys.ja,
        display_name_ko: sys.ko,
        display_name_zh: sys.zh,
      },
    })
  }

  return insertOrGetTag(admin, { name, normalized: normalizeTagName(name), slug: slugifyTag(name) })
}

async function insertOrGetTag(
  admin: SupabaseClient,
  opts: { name: string; normalized: string; slug: string; extra?: Record<string, unknown> },
): Promise<string | null> {
  const { name, normalized, extra } = opts

  const { data: existing } = await admin
    .from('tags')
    .select('id')
    .eq('normalized_name', normalized)
    .maybeSingle()
  if (existing) return (existing as { id: string }).id

  // Insert new. Retry once with a disambiguated slug on a slug collision.
  let slug = opts.slug
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await admin
      .from('tags')
      .insert({ name, slug, normalized_name: normalized, ...(extra ?? {}) })
      .select('id')
      .maybeSingle()
    if (data) return (data as { id: string }).id
    // Lost a race on normalized_name → fetch the winner.
    if (error && /normalized_name/.test(error.message)) {
      const { data: row } = await admin
        .from('tags')
        .select('id')
        .eq('normalized_name', normalized)
        .maybeSingle()
      return row ? (row as { id: string }).id : null
    }
    if (error && /slug/.test(error.message)) {
      slug = `${opts.slug}-${Math.random().toString(36).slice(2, 6)}`
      continue
    }
    break
  }
  return null
}

// ── Read ────────────────────────────────────────────────────
/** All tags attached to one content item, ordered by display name. */
export async function getTagsForContent(
  client: SupabaseClient,
  contentType: TagContentType,
  contentId: string,
): Promise<Tag[]> {
  const { data } = await client
    .from('content_tags')
    .select(`tags ( ${TAG_COLS} )`)
    .eq('content_type', contentType)
    .eq('content_id', contentId)
  const tags = (data ?? [])
    .map((r) => (r as unknown as { tags: Tag | Tag[] | null }).tags)
    .map((t) => (Array.isArray(t) ? t[0] : t))
    .filter((t): t is Tag => !!t)
  return tags.sort((a, b) => a.name.localeCompare(b.name))
}

/** Batch variant for list/card rendering: contentId → Tag[]. */
export async function getTagsForContents(
  client: SupabaseClient,
  contentType: TagContentType,
  contentIds: string[],
): Promise<Map<string, Tag[]>> {
  const map = new Map<string, Tag[]>()
  if (!contentIds.length) return map
  const { data } = await client
    .from('content_tags')
    .select(`content_id, tags ( ${TAG_COLS} )`)
    .eq('content_type', contentType)
    .in('content_id', contentIds)
  for (const row of data ?? []) {
    const r = row as unknown as { content_id: string; tags: Tag | Tag[] | null }
    const tag = Array.isArray(r.tags) ? r.tags[0] : r.tags
    if (!tag) continue
    const list = map.get(r.content_id) ?? []
    list.push(tag)
    map.set(r.content_id, list)
  }
  Array.from(map.values()).forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)))
  return map
}

/** Most-used tags (for PopularTags / TagFilter / suggestions). */
export async function getPopularTags(client: SupabaseClient, limit = 24): Promise<Tag[]> {
  const { data } = await client
    .from('tags')
    .select(TAG_COLS)
    .gt('usage_count', 0)
    .order('usage_count', { ascending: false })
    .limit(limit)
  return (data ?? []) as unknown as Tag[]
}

/** Look up a tag by its slug. */
export async function getTagBySlug(client: SupabaseClient, slug: string): Promise<Tag | null> {
  const { data } = await client
    .from('tags')
    .select(TAG_COLS)
    .eq('slug', slug)
    .maybeSingle()
  return (data as unknown as Tag | null) ?? null
}

/** Content ids of a given type carrying a tag (newest join first). */
export async function getContentIdsForTag(
  client: SupabaseClient,
  tagId: string,
  contentType: TagContentType,
): Promise<string[]> {
  const { data } = await client
    .from('content_tags')
    .select('content_id')
    .eq('tag_id', tagId)
    .eq('content_type', contentType)
    .order('created_at', { ascending: false })
  return (data ?? []).map((r) => (r as { content_id: string }).content_id)
}
