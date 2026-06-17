'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient, checkIsAdmin } from '@/lib/supabase/admin'
import { broadcastToAllUsers } from '@/lib/notifications/user'
import { isUuid } from '@/lib/marketplace'

async function setStatus(id: string, status: 'approved' | 'rejected') {
  if (!(await checkIsAdmin()) || !isUuid(id)) return
  const admin = createAdminClient()

  // When approving, fetch prior state so we only broadcast the first time it goes live.
  type PrevListing = { status: string; user_id: string; title: string }
  let prev: PrevListing | null = null
  if (status === 'approved') {
    const { data } = await admin
      .from('marketplace_listings')
      .select('status, user_id, title')
      .eq('id', id)
      .maybeSingle()
    prev = (data as PrevListing | null) ?? null
  }

  await admin.from('marketplace_listings').update({ status }).eq('id', id)
  revalidatePath('/admin/cho-do-cu')
  revalidatePath('/marketplace')
  revalidatePath(`/marketplace/${id}`)

  if (status === 'approved' && prev && prev.status !== 'approved') {
    await broadcastToAllUsers({
      type: 'new_listing',
      targetUrl: `/marketplace/${id}`,
      actorId: prev.user_id,
      excludeUserId: prev.user_id,
      push: { title: 'Tin mới trên Chợ đồ cũ', body: prev.title, tag: `listing-${id}` },
    })
  }
}

export async function approveListing(formData: FormData): Promise<void> {
  await setStatus(formData.get('id') as string, 'approved')
}

export async function rejectListing(formData: FormData): Promise<void> {
  await setStatus(formData.get('id') as string, 'rejected')
}

export async function adminDeleteListing(formData: FormData): Promise<void> {
  if (!(await checkIsAdmin())) return
  const id = formData.get('id') as string
  if (!isUuid(id)) return
  const admin = createAdminClient()
  await admin.from('marketplace_listings').delete().eq('id', id)
  revalidatePath('/admin/cho-do-cu')
  revalidatePath('/marketplace')
}
