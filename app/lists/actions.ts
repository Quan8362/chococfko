'use server'

// Custom-list actions. Owner ops use the anon client (RLS via auth.uid). Shared
// read uses the service-role client filtered by is_shareable + unguessable token
// (so private lists are never exposed and viewers can't edit).
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { genShareToken, isValidShareToken } from '@/lib/shareToken'

export interface ListRow {
  id: string; title: string; description: string | null
  is_shareable: boolean; share_notes: boolean; share_token: string | null
  updated_at: string; item_count: number
}
export interface ListItemRow { id: string; place_slug: string; sort_order: number; note: string | null }
export interface SharedList { title: string; description: string | null; items: { place_slug: string; note: string | null }[] }

async function userId(sb: ReturnType<typeof createClient>): Promise<string | null> {
  const { data: { user } } = await sb.auth.getUser()
  return user?.id ?? null
}

export async function getMyLists(): Promise<ListRow[]> {
  try {
    const sb = createClient()
    const uid = await userId(sb)
    if (!uid) return []
    const { data } = await sb
      .from('place_lists')
      .select('id,title,description,is_shareable,share_notes,share_token,updated_at, place_list_items(count)')
      .eq('user_id', uid)
      .order('updated_at', { ascending: false })
    return (data ?? []).map((r) => {
      const row = r as ListRow & { place_list_items?: { count: number }[] }
      return { ...row, item_count: row.place_list_items?.[0]?.count ?? 0 }
    })
  } catch { return [] }
}

export async function createList(title: string, description?: string): Promise<{ ok: boolean; id?: string }> {
  const sb = createClient()
  const uid = await userId(sb)
  if (!uid) return { ok: false }
  const t = (title ?? '').trim()
  if (!t) return { ok: false }
  const { data, error } = await sb.from('place_lists')
    .insert({ user_id: uid, title: t.slice(0, 120), description: (description ?? '').trim() || null })
    .select('id').single()
  revalidatePath('/lists')
  return error ? { ok: false } : { ok: true, id: (data as { id: string }).id }
}

export async function renameList(id: string, title: string, description: string): Promise<{ ok: boolean }> {
  const sb = createClient()
  if (!(await userId(sb))) return { ok: false }
  const t = (title ?? '').trim()
  if (!t) return { ok: false }
  const { error } = await sb.from('place_lists').update({ title: t.slice(0, 120), description: (description ?? '').trim() || null }).eq('id', id)
  revalidatePath('/lists'); revalidatePath(`/lists/${id}`)
  return { ok: !error }
}

export async function deleteList(id: string): Promise<{ ok: boolean }> {
  const sb = createClient()
  if (!(await userId(sb))) return { ok: false }
  const { error } = await sb.from('place_lists').delete().eq('id', id)
  revalidatePath('/lists')
  return { ok: !error }
}

export async function setListShareable(id: string, shareable: boolean, shareNotes: boolean): Promise<{ ok: boolean; token: string | null }> {
  const sb = createClient()
  if (!(await userId(sb))) return { ok: false, token: null }
  // Generate a token the first time sharing is enabled; revoking nulls it out.
  const { data: cur } = await sb.from('place_lists').select('share_token').eq('id', id).maybeSingle()
  const existing = (cur as { share_token: string | null } | null)?.share_token ?? null
  const token = shareable ? (existing && isValidShareToken(existing) ? existing : genShareToken()) : null
  const { error } = await sb.from('place_lists').update({ is_shareable: shareable, share_notes: shareNotes, share_token: token }).eq('id', id)
  revalidatePath(`/lists/${id}`)
  return { ok: !error, token }
}

export async function addPlaceToList(listId: string, slug: string): Promise<{ ok: boolean }> {
  const sb = createClient()
  if (!(await userId(sb))) return { ok: false }
  const s = (slug ?? '').trim()
  if (!s) return { ok: false }
  const { data: items } = await sb.from('place_list_items').select('sort_order').eq('list_id', listId).order('sort_order', { ascending: false }).limit(1)
  const next = ((items as { sort_order: number }[] | null)?.[0]?.sort_order ?? -1) + 1
  const { error } = await sb.from('place_list_items').upsert({ list_id: listId, place_slug: s, sort_order: next }, { onConflict: 'list_id,place_slug', ignoreDuplicates: true })
  revalidatePath(`/lists/${listId}`)
  return { ok: !error }
}

export async function removeFromList(listId: string, slug: string): Promise<{ ok: boolean }> {
  const sb = createClient()
  if (!(await userId(sb))) return { ok: false }
  const { error } = await sb.from('place_list_items').delete().eq('list_id', listId).eq('place_slug', slug)
  revalidatePath(`/lists/${listId}`)
  return { ok: !error }
}

export async function reorderList(listId: string, orderedSlugs: string[]): Promise<{ ok: boolean }> {
  const sb = createClient()
  if (!(await userId(sb))) return { ok: false }
  for (let i = 0; i < orderedSlugs.length; i++) {
    await sb.from('place_list_items').update({ sort_order: i }).eq('list_id', listId).eq('place_slug', orderedSlugs[i])
  }
  revalidatePath(`/lists/${listId}`)
  return { ok: true }
}

export async function duplicateList(id: string): Promise<{ ok: boolean; id?: string }> {
  const sb = createClient()
  const uid = await userId(sb)
  if (!uid) return { ok: false }
  const { data: src } = await sb.from('place_lists').select('title,description').eq('id', id).maybeSingle()
  if (!src) return { ok: false }
  const { data: items } = await sb.from('place_list_items').select('place_slug,sort_order,note').eq('list_id', id).order('sort_order')
  const { data: created, error } = await sb.from('place_lists')
    .insert({ user_id: uid, title: `${(src as { title: string }).title} (copy)`.slice(0, 120), description: (src as { description: string | null }).description })
    .select('id').single()
  if (error || !created) return { ok: false }
  const newId = (created as { id: string }).id
  const rows = (items ?? []).map((it) => ({ list_id: newId, place_slug: (it as ListItemRow).place_slug, sort_order: (it as ListItemRow).sort_order, note: (it as ListItemRow).note }))
  if (rows.length) await sb.from('place_list_items').insert(rows)
  revalidatePath('/lists')
  return { ok: true, id: newId }
}

export async function getListWithItems(id: string): Promise<{ list: ListRow; items: ListItemRow[] } | null> {
  try {
    const sb = createClient()
    if (!(await userId(sb))) return null
    const { data: list } = await sb.from('place_lists').select('*').eq('id', id).maybeSingle()
    if (!list) return null
    const { data: items } = await sb.from('place_list_items').select('id,place_slug,sort_order,note').eq('list_id', id).order('sort_order')
    return { list: { ...(list as ListRow), item_count: (items ?? []).length }, items: (items ?? []) as ListItemRow[] }
  } catch { return null }
}

/** Public read-only shared list by token (service role + is_shareable check). */
export async function getSharedList(token: string): Promise<SharedList | null> {
  if (!isValidShareToken(token)) return null
  try {
    const admin = createAdminClient()
    const { data: list } = await admin.from('place_lists')
      .select('id,title,description,share_notes,is_shareable')
      .eq('share_token', token).eq('is_shareable', true).maybeSingle()
    if (!list) return null
    const l = list as { id: string; title: string; description: string | null; share_notes: boolean }
    const { data: items } = await admin.from('place_list_items').select('place_slug,note,sort_order').eq('list_id', l.id).order('sort_order')
    return {
      title: l.title,
      description: l.description,
      items: (items ?? []).map((it) => {
        const row = it as { place_slug: string; note: string | null }
        return { place_slug: row.place_slug, note: l.share_notes ? row.note : null }
      }),
    }
  } catch { return null }
}
