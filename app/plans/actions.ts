'use server'

// Trip-plan actions. Owner ops use the anon client (RLS via auth.uid). Shared
// read uses the service-role client filtered by is_shareable + token; private
// notes are excluded unless share_notes is on. Viewers can't edit; they can
// duplicate a shared plan into their own account.
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { genShareToken, isValidShareToken } from '@/lib/shareToken'

export interface PlanRow {
  id: string; title: string; plan_date: string | null; start_location: string | null
  notes: string | null; is_shareable: boolean; share_notes: boolean; share_token: string | null
  updated_at: string; stop_count: number
}
export interface StopRow {
  id: string; place_slug: string; sort_order: number
  arrival_time: string | null; departure_time: string | null; duration_minutes: number | null
  note: string | null; est_cost: number | null; transport_note: string | null
}
export interface SharedPlan {
  title: string; plan_date: string | null; start_location: string | null; notes: string | null
  stops: Omit<StopRow, 'id'>[]
}

async function userId(sb: ReturnType<typeof createClient>): Promise<string | null> {
  const { data: { user } } = await sb.auth.getUser()
  return user?.id ?? null
}

function cleanTime(v: unknown): string | null {
  const s = (v ?? '').toString().trim()
  return /^\d{2}:\d{2}/.test(s) ? s.slice(0, 5) : null
}
function cleanInt(v: unknown): number | null {
  const s = (v ?? '').toString().trim()
  if (!s) return null
  const n = Number.parseInt(s, 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}

export async function getMyPlans(): Promise<PlanRow[]> {
  try {
    const sb = createClient()
    const uid = await userId(sb)
    if (!uid) return []
    const { data } = await sb.from('place_plans')
      .select('id,title,plan_date,start_location,notes,is_shareable,share_notes,share_token,updated_at, place_plan_stops(count)')
      .eq('user_id', uid).order('updated_at', { ascending: false })
    return (data ?? []).map((r) => {
      const row = r as PlanRow & { place_plan_stops?: { count: number }[] }
      return { ...row, stop_count: row.place_plan_stops?.[0]?.count ?? 0 }
    })
  } catch { return [] }
}

export async function createPlan(title: string, planDate?: string): Promise<{ ok: boolean; id?: string }> {
  const sb = createClient()
  const uid = await userId(sb)
  if (!uid) return { ok: false }
  const t = (title ?? '').trim()
  if (!t) return { ok: false }
  const { data, error } = await sb.from('place_plans')
    .insert({ user_id: uid, title: t.slice(0, 120), plan_date: cleanDate(planDate) })
    .select('id').single()
  revalidatePath('/plans')
  return error ? { ok: false } : { ok: true, id: (data as { id: string }).id }
}

function cleanDate(v: unknown): string | null {
  const s = (v ?? '').toString().trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

export async function updatePlan(id: string, fields: { title?: string; planDate?: string; startLocation?: string; notes?: string }): Promise<{ ok: boolean }> {
  const sb = createClient()
  if (!(await userId(sb))) return { ok: false }
  const patch: Record<string, unknown> = {}
  if (fields.title !== undefined) { const t = fields.title.trim(); if (!t) return { ok: false }; patch.title = t.slice(0, 120) }
  if (fields.planDate !== undefined) patch.plan_date = cleanDate(fields.planDate)
  if (fields.startLocation !== undefined) patch.start_location = fields.startLocation.trim() || null
  if (fields.notes !== undefined) patch.notes = fields.notes.trim() || null
  const { error } = await sb.from('place_plans').update(patch).eq('id', id)
  revalidatePath(`/plans/${id}`); revalidatePath('/plans')
  return { ok: !error }
}

export async function deletePlan(id: string): Promise<{ ok: boolean }> {
  const sb = createClient()
  if (!(await userId(sb))) return { ok: false }
  const { error } = await sb.from('place_plans').delete().eq('id', id)
  revalidatePath('/plans')
  return { ok: !error }
}

export async function setPlanShareable(id: string, shareable: boolean, shareNotes: boolean): Promise<{ ok: boolean; token: string | null }> {
  const sb = createClient()
  if (!(await userId(sb))) return { ok: false, token: null }
  const { data: cur } = await sb.from('place_plans').select('share_token').eq('id', id).maybeSingle()
  const existing = (cur as { share_token: string | null } | null)?.share_token ?? null
  const token = shareable ? (existing && isValidShareToken(existing) ? existing : genShareToken()) : null
  const { error } = await sb.from('place_plans').update({ is_shareable: shareable, share_notes: shareNotes, share_token: token }).eq('id', id)
  revalidatePath(`/plans/${id}`)
  return { ok: !error, token }
}

export async function addStop(planId: string, slug: string): Promise<{ ok: boolean }> {
  const sb = createClient()
  if (!(await userId(sb))) return { ok: false }
  const s = (slug ?? '').trim()
  if (!s) return { ok: false }
  const { data: rows } = await sb.from('place_plan_stops').select('sort_order').eq('plan_id', planId).order('sort_order', { ascending: false }).limit(1)
  const next = ((rows as { sort_order: number }[] | null)?.[0]?.sort_order ?? -1) + 1
  const { error } = await sb.from('place_plan_stops').insert({ plan_id: planId, place_slug: s, sort_order: next })
  revalidatePath(`/plans/${planId}`)
  return { ok: !error }
}

export async function removeStop(planId: string, stopId: string): Promise<{ ok: boolean }> {
  const sb = createClient()
  if (!(await userId(sb))) return { ok: false }
  const { error } = await sb.from('place_plan_stops').delete().eq('id', stopId)
  revalidatePath(`/plans/${planId}`)
  return { ok: !error }
}

export async function updateStop(planId: string, stopId: string, fields: { arrivalTime?: string; departureTime?: string; durationMinutes?: string; note?: string; estCost?: string; transportNote?: string }): Promise<{ ok: boolean }> {
  const sb = createClient()
  if (!(await userId(sb))) return { ok: false }
  const patch: Record<string, unknown> = {
    arrival_time: cleanTime(fields.arrivalTime),
    departure_time: cleanTime(fields.departureTime),
    duration_minutes: cleanInt(fields.durationMinutes),
    note: (fields.note ?? '').trim() || null,
    est_cost: cleanInt(fields.estCost),
    transport_note: (fields.transportNote ?? '').trim() || null,
  }
  const { error } = await sb.from('place_plan_stops').update(patch).eq('id', stopId)
  revalidatePath(`/plans/${planId}`)
  return { ok: !error }
}

export async function reorderStops(planId: string, orderedStopIds: string[]): Promise<{ ok: boolean }> {
  const sb = createClient()
  if (!(await userId(sb))) return { ok: false }
  for (let i = 0; i < orderedStopIds.length; i++) {
    await sb.from('place_plan_stops').update({ sort_order: i }).eq('id', orderedStopIds[i])
  }
  revalidatePath(`/plans/${planId}`)
  return { ok: true }
}

export async function getPlanWithStops(id: string): Promise<{ plan: PlanRow; stops: StopRow[] } | null> {
  try {
    const sb = createClient()
    if (!(await userId(sb))) return null
    const { data: plan } = await sb.from('place_plans').select('*').eq('id', id).maybeSingle()
    if (!plan) return null
    const { data: stops } = await sb.from('place_plan_stops').select('*').eq('plan_id', id).order('sort_order')
    return { plan: { ...(plan as PlanRow), stop_count: (stops ?? []).length }, stops: (stops ?? []) as StopRow[] }
  } catch { return null }
}

export async function getSharedPlan(token: string): Promise<SharedPlan | null> {
  if (!isValidShareToken(token)) return null
  try {
    const admin = createAdminClient()
    const { data: plan } = await admin.from('place_plans')
      .select('id,title,plan_date,start_location,notes,share_notes')
      .eq('share_token', token).eq('is_shareable', true).maybeSingle()
    if (!plan) return null
    const p = plan as { id: string; title: string; plan_date: string | null; start_location: string | null; notes: string | null; share_notes: boolean }
    const { data: stops } = await admin.from('place_plan_stops').select('*').eq('plan_id', p.id).order('sort_order')
    return {
      title: p.title, plan_date: p.plan_date, start_location: p.start_location,
      notes: p.share_notes ? p.notes : null,
      stops: (stops ?? []).map((s) => {
        const r = s as StopRow
        return {
          place_slug: r.place_slug, sort_order: r.sort_order, arrival_time: r.arrival_time, departure_time: r.departure_time,
          duration_minutes: r.duration_minutes, note: p.share_notes ? r.note : null, est_cost: r.est_cost, transport_note: r.transport_note,
        }
      }),
    }
  } catch { return null }
}

/** Copy a shared plan into the current user's account (requires sign-in). */
export async function duplicateSharedPlan(token: string): Promise<{ ok: boolean; id?: string; needsAuth?: boolean }> {
  const sb = createClient()
  const uid = await userId(sb)
  if (!uid) return { ok: false, needsAuth: true }
  const shared = await getSharedPlan(token)
  if (!shared) return { ok: false }
  const { data: created, error } = await sb.from('place_plans')
    .insert({ user_id: uid, title: `${shared.title} (copy)`.slice(0, 120), plan_date: shared.plan_date, start_location: shared.start_location })
    .select('id').single()
  if (error || !created) return { ok: false }
  const newId = (created as { id: string }).id
  const rows = shared.stops.map((s) => ({
    plan_id: newId, place_slug: s.place_slug, sort_order: s.sort_order, arrival_time: s.arrival_time,
    departure_time: s.departure_time, duration_minutes: s.duration_minutes, note: s.note, est_cost: s.est_cost, transport_note: s.transport_note,
  }))
  if (rows.length) await sb.from('place_plan_stops').insert(rows)
  revalidatePath('/plans')
  return { ok: true, id: newId }
}
