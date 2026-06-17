'use server'

import { createAdminClient, checkIsAdmin } from '@/lib/supabase/admin'

export async function clearWordImage(wordId: string) {
  if (!wordId) return
  // japanese_words is shared dictionary content — only admins may clear images.
  // Without this guard, this service-role mutation is callable by anyone.
  if (!(await checkIsAdmin())) return
  const admin = createAdminClient()
  await admin.from('japanese_words').update({
    image_url: null,
    image_alt: null,
    image_source: null,
    image_credit_url: null,
    image_query: null,
    image_status: null,
    image_fetched_at: null,
  }).eq('id', wordId)
}
