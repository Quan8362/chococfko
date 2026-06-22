'use server';

import { revalidatePath } from 'next/cache';
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { revalidateEvents } from '@/lib/eventsDb';

export interface EventInput {
  id?: string;
  slug?: string | null;
  title: string;
  description?: string | null;
  placeSlug?: string | null;
  venue?: string | null;
  area?: string | null;
  prefecture?: string | null;
  startsAt: string;
  endsAt?: string | null;
  priceType?: 'free' | 'paid' | 'varies' | null;
  priceMin?: number | null;
  priceMax?: number | null;
  currency?: string | null;
  sourceUrl?: string | null;
  registrationUrl?: string | null;
  lastVerifiedAt?: string | null;
  status?: 'draft' | 'published';
  isCancelled?: boolean;
}

function clean(s: string | null | undefined): string | null {
  const v = (s ?? '').trim();
  return v ? v : null;
}

export async function saveEvent(input: EventInput): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkIsAdmin())) return { ok: false, error: 'forbidden' };
  if (!input.title?.trim() || !input.startsAt) return { ok: false, error: 'invalid' };

  const { data: { user } } = await createClient().auth.getUser();
  const row = {
    slug: clean(input.slug),
    title: input.title.trim().slice(0, 200),
    description: clean(input.description),
    place_slug: clean(input.placeSlug),
    venue: clean(input.venue),
    area: clean(input.area),
    prefecture: clean(input.prefecture),
    starts_at: new Date(input.startsAt).toISOString(),
    ends_at: input.endsAt ? new Date(input.endsAt).toISOString() : null,
    price_type: input.priceType ?? null,
    price_min: input.priceMin ?? null,
    price_max: input.priceMax ?? null,
    currency: clean(input.currency)?.toUpperCase() ?? null,
    source_url: clean(input.sourceUrl),
    registration_url: clean(input.registrationUrl),
    last_verified_at: clean(input.lastVerifiedAt),
    status: input.status === 'published' ? 'published' : 'draft',
    is_cancelled: !!input.isCancelled,
  };

  try {
    const admin = createAdminClient();
    if (input.id) {
      const { error } = await admin.from('place_events').update(row).eq('id', input.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await admin.from('place_events').insert({ ...row, created_by: user?.id ?? null });
      if (error) return { ok: false, error: error.message };
    }
    revalidateEvents();
    revalidatePath('/admin/events');
    revalidatePath('/events');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'error' };
  }
}

export async function deleteEvent(id: string): Promise<{ ok: boolean }> {
  if (!(await checkIsAdmin()) || !id) return { ok: false };
  try {
    await createAdminClient().from('place_events').delete().eq('id', id);
    revalidateEvents();
    revalidatePath('/admin/events');
    revalidatePath('/events');
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function setEventStatus(id: string, status: 'draft' | 'published'): Promise<{ ok: boolean }> {
  if (!(await checkIsAdmin()) || !id) return { ok: false };
  try {
    await createAdminClient().from('place_events').update({ status }).eq('id', id);
    revalidateEvents();
    revalidatePath('/admin/events');
    revalidatePath('/events');
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export async function toggleEventCancelled(id: string, cancelled: boolean): Promise<{ ok: boolean }> {
  if (!(await checkIsAdmin()) || !id) return { ok: false };
  try {
    await createAdminClient().from('place_events').update({ is_cancelled: cancelled }).eq('id', id);
    revalidateEvents();
    revalidatePath('/admin/events');
    revalidatePath('/events');
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
