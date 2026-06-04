'use server'

import { revalidatePath } from 'next/cache'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'

async function guardAdmin() {
  if (!(await checkIsAdmin())) throw new Error('Not admin')
  return createAdminClient()
}

export async function approveConfession(formData: FormData) {
  const admin = await guardAdmin()
  const id = formData.get('id') as string
  await admin.from('confessions').update({
    status: 'approved',
    approved_at: new Date().toISOString(),
  }).eq('id', id)
  revalidatePath('/admin/confessions')
  revalidatePath('/confessions')
}

export async function rejectConfession(formData: FormData) {
  const admin = await guardAdmin()
  const id = formData.get('id') as string
  const reason = (formData.get('reason') as string ?? '').trim() || null
  await admin.from('confessions').update({
    status: 'rejected',
    rejected_reason: reason,
  }).eq('id', id)
  revalidatePath('/admin/confessions')
  revalidatePath('/confessions')
}

export async function deleteConfession(formData: FormData) {
  const admin = await guardAdmin()
  const id = formData.get('id') as string
  await admin.from('confessions').update({
    status: 'deleted',
    deleted_at: new Date().toISOString(),
  }).eq('id', id)
  revalidatePath('/admin/confessions')
  revalidatePath('/confessions')
}

export async function adminDeleteConfessionComment(formData: FormData) {
  const admin = await guardAdmin()
  const id = formData.get('id') as string
  await admin.from('confession_comments').update({
    status: 'deleted',
    deleted_at: new Date().toISOString(),
  }).eq('id', id)
  revalidatePath('/admin/confessions')
}
