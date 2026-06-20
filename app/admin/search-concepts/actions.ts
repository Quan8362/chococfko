'use server'

import { revalidatePath } from 'next/cache'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import {
  validateConceptInput,
  aliasConflicts,
  type ConceptInput,
  type ConceptRow,
} from '@/lib/placeSearch'
import { loadSearchConfig, revalidateSearchConcepts } from '@/lib/searchConcepts'
import {
  filterPlaces,
  extractFeeIntent,
  extractFacets,
  tokenize,
  normalizeText,
  explainMatch,
} from '@/lib/placeSearch'
import { getAllPlacesFromDb, attachPlaceTags, places as staticPlaces } from '@/lib/places'

const UNDEFINED_TABLE = '42P01'

export interface ConceptFormInput {
  id?: string | null
  key: string
  type: string
  enabled: boolean
  weight: number
  matching_mode: string
  category_code?: string | null
  display_names: Record<string, string>
  aliases: Record<string, string[]>
  evidence: { strong: Record<string, string[]>; structured_flags: string[] }
}

export interface ActionResult {
  ok: boolean
  errors?: string[]       // i18n codes
  conflictKeys?: string[] // other concepts sharing an alias (warning)
  tableMissing?: boolean
}

function revalidate() {
  // Search config is consumed site-wide; invalidate the cache tag + admin/home.
  revalidateSearchConcepts()
  revalidatePath('/admin/search-concepts')
  revalidatePath('/', 'layout')
}

function isMissingTable(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === UNDEFINED_TABLE || /search_concepts.*does not exist/i.test(err.message ?? ''))
}

/** Create or update a concept. Server-side auth + validation + alias-conflict check. */
export async function saveConcept(input: ConceptFormInput): Promise<ActionResult> {
  if (!(await checkIsAdmin())) return { ok: false, errors: ['unauthorized'] }

  const validation = validateConceptInput(input as ConceptInput)
  if (!validation.ok) return { ok: false, errors: validation.errors }

  const admin = createAdminClient()

  // Load the full set for duplicate-key + cross-concept alias-conflict checks.
  const { data: existing, error: readErr } = await admin
    .from('search_concepts')
    .select('id, key, enabled, aliases')
  if (isMissingTable(readErr)) return { ok: false, errors: ['table_missing'], tableMissing: true }
  if (readErr) return { ok: false, errors: ['db_error'] }

  const others = (existing ?? []) as { id: string; key: string; enabled: boolean; aliases: Record<string, string[]> }[]
  const dupKey = others.find((o) => o.key === input.key && o.id !== input.id)
  if (dupKey) return { ok: false, errors: ['key_duplicate'] }

  const conflicts = aliasConflicts(input as ConceptInput, others.filter((o) => o.id !== input.id))

  const row = {
    key: input.key.trim(),
    type: input.type,
    enabled: input.enabled,
    weight: input.weight,
    matching_mode: input.matching_mode,
    category_code: input.type === 'category' ? (input.category_code || null) : null,
    display_names: input.display_names ?? {},
    aliases: input.aliases ?? {},
    evidence: input.evidence ?? {},
  }

  const res = input.id
    ? await admin.from('search_concepts').update(row).eq('id', input.id)
    : await admin.from('search_concepts').insert(row)

  if (isMissingTable(res.error)) return { ok: false, errors: ['table_missing'], tableMissing: true }
  if (res.error) return { ok: false, errors: ['db_error'] }

  revalidate()
  return { ok: true, conflictKeys: conflicts.length ? conflicts : undefined }
}

/** Enable/disable a concept. */
export async function toggleConcept(id: string, enabled: boolean): Promise<ActionResult> {
  if (!(await checkIsAdmin())) return { ok: false, errors: ['unauthorized'] }
  const res = await createAdminClient().from('search_concepts').update({ enabled }).eq('id', id)
  if (isMissingTable(res.error)) return { ok: false, errors: ['table_missing'], tableMissing: true }
  if (res.error) return { ok: false, errors: ['db_error'] }
  revalidate()
  return { ok: true }
}

/** Delete a concept (UI confirms; prefer disabling). */
export async function deleteConcept(id: string): Promise<ActionResult> {
  if (!(await checkIsAdmin())) return { ok: false, errors: ['unauthorized'] }
  const res = await createAdminClient().from('search_concepts').delete().eq('id', id)
  if (isMissingTable(res.error)) return { ok: false, errors: ['table_missing'], tableMissing: true }
  if (res.error) return { ok: false, errors: ['db_error'] }
  revalidate()
  return { ok: true }
}

export interface PreviewResult {
  tokens: string[]
  fee: string | null
  facets: string[]
  matches: { slug: string; name: string; category: string; reasons: { concept: string; source: string; weight: number }[] }[]
}

/** Admin-only search preview: extracted concepts/tokens + matched places with reasons. */
export async function previewSearch(query: string): Promise<PreviewResult | { error: string }> {
  if (!(await checkIsAdmin())) return { error: 'unauthorized' }
  const config = await loadSearchConfig()
  const basePlaces = (await getAllPlacesFromDb('vi')) ?? staticPlaces
  const places = await attachPlaceTags(basePlaces)

  const norm = normalizeText(query)
  const { fee, rest } = extractFeeIntent(norm, config)
  const { facets, rest: rest2 } = extractFacets(rest, config)
  const tokens = rest2 ? tokenize(rest2) : []

  const matched = filterPlaces(places, { q: query }, config).slice(0, 40)
  const matches = matched.map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    reasons: explainMatch(p, query, config).reasons.map((r) => ({ concept: r.concept, source: r.source, weight: r.weight })),
  }))
  return { tokens, fee, facets: facets.map((f) => f.key), matches }
}

/** Read all concepts for the admin list (service role; bypasses RLS). */
export async function fetchConcepts(): Promise<{ rows: ConceptRow[]; tableMissing: boolean; error?: boolean }> {
  if (!(await checkIsAdmin())) return { rows: [], tableMissing: false, error: true }
  const { data, error } = await createAdminClient()
    .from('search_concepts')
    .select('*')
    .order('type', { ascending: true })
    .order('key', { ascending: true })
  if (isMissingTable(error)) return { rows: [], tableMissing: true }
  if (error) return { rows: [], tableMissing: false, error: true }
  return { rows: (data ?? []) as ConceptRow[], tableMissing: false }
}
