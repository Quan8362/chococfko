import type { SupabaseClient } from '@supabase/supabase-js'

// ── Constants ───────────────────────────────────────────────
export const MAX_TAGS = 10
export const MAX_TAG_LEN = 30

export type TagContentType = 'place' | 'post' | 'listing'

export interface Tag {
  id: string
  name: string
  slug: string
  normalized_name: string
  usage_count: number
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

/** Get-or-create a single tag by its normalized name. Returns its id, or null. */
async function resolveTagId(admin: SupabaseClient, displayName: string): Promise<string | null> {
  const name = displayName.trim().slice(0, MAX_TAG_LEN).trim()
  const normalized = normalizeTagName(name)
  if (!normalized) return null

  const { data: existing } = await admin
    .from('tags')
    .select('id')
    .eq('normalized_name', normalized)
    .maybeSingle()
  if (existing) return (existing as { id: string }).id

  // Insert new. Retry once with a disambiguated slug on a slug collision.
  let slug = slugifyTag(name)
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await admin
      .from('tags')
      .insert({ name, slug, normalized_name: normalized })
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
      slug = `${slugifyTag(name)}-${Math.random().toString(36).slice(2, 6)}`
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
    .select('tags ( id, name, slug, normalized_name, usage_count )')
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
    .select('content_id, tags ( id, name, slug, normalized_name, usage_count )')
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
    .select('id, name, slug, normalized_name, usage_count')
    .gt('usage_count', 0)
    .order('usage_count', { ascending: false })
    .limit(limit)
  return (data ?? []) as Tag[]
}

/** Look up a tag by its slug. */
export async function getTagBySlug(client: SupabaseClient, slug: string): Promise<Tag | null> {
  const { data } = await client
    .from('tags')
    .select('id, name, slug, normalized_name, usage_count')
    .eq('slug', slug)
    .maybeSingle()
  return (data as Tag | null) ?? null
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
