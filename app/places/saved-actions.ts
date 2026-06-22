'use server'

// Saved-place server actions. Use the anon server client (NOT admin) so RLS on
// place_saves enforces per-user isolation via auth.uid(). Guests get loggedIn:false.
import { createClient } from '@/lib/supabase/server'

export interface SavedState { loggedIn: boolean; slugs: string[] }

export async function getSavedState(): Promise<SavedState> {
  try {
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { loggedIn: false, slugs: [] }
    const { data } = await sb
      .from('place_saves')
      .select('place_slug')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    return { loggedIn: true, slugs: (data ?? []).map((r) => (r as { place_slug: string }).place_slug) }
  } catch {
    return { loggedIn: false, slugs: [] }
  }
}

export async function toggleSave(slug: string): Promise<{ ok: boolean; loggedIn: boolean; saved?: boolean }> {
  try {
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { ok: false, loggedIn: false }
    const s = (slug ?? '').trim()
    if (!s) return { ok: false, loggedIn: true }
    const { data: existing } = await sb
      .from('place_saves').select('place_slug')
      .eq('user_id', user.id).eq('place_slug', s).maybeSingle()
    if (existing) {
      const { error } = await sb.from('place_saves').delete().eq('user_id', user.id).eq('place_slug', s)
      return { ok: !error, loggedIn: true, saved: false }
    }
    const { error } = await sb.from('place_saves').insert({ user_id: user.id, place_slug: s })
    return { ok: !error, loggedIn: true, saved: true }
  } catch {
    return { ok: false, loggedIn: true }
  }
}

/** Merge guest localStorage saves into the user's DB saves (dedup, no duplicates). */
export async function mergeSaves(slugs: string[]): Promise<{ ok: boolean; slugs: string[] }> {
  try {
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return { ok: false, slugs: [] }
    const clean = Array.from(new Set((slugs ?? []).map((s) => (s ?? '').trim()).filter(Boolean))).slice(0, 500)
    if (clean.length) {
      const rows = clean.map((place_slug) => ({ user_id: user.id, place_slug }))
      await sb.from('place_saves').upsert(rows, { onConflict: 'user_id,place_slug', ignoreDuplicates: true })
    }
    const { data } = await sb
      .from('place_saves').select('place_slug')
      .eq('user_id', user.id).order('created_at', { ascending: false })
    return { ok: true, slugs: (data ?? []).map((r) => (r as { place_slug: string }).place_slug) }
  } catch {
    return { ok: false, slugs: [] }
  }
}
