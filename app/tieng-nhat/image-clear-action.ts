'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function clearWordImage(wordId: string) {
  if (!wordId) return
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
