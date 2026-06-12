'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient, checkIsAdmin } from '@/lib/supabase/admin'
import { isUuid } from '@/lib/marketplace'

async function setStatus(id: string, status: 'approved' | 'rejected') {
  if (!(await checkIsAdmin()) || !isUuid(id)) return
  const admin = createAdminClient()
  await admin.from('marketplace_listings').update({ status }).eq('id', id)
  revalidatePath('/admin/cho-do-cu')
  revalidatePath('/cho-do-cu')
  revalidatePath(`/cho-do-cu/${id}`)
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
  revalidatePath('/cho-do-cu')
}
