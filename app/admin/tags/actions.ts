'use server'

import { revalidatePath } from 'next/cache'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import { autofillTagTranslations } from '@/lib/tags'

const LOCALES = ['vi', 'en', 'ja', 'ko', 'zh'] as const

function revalidateTagViews() {
  revalidatePath('/admin/tags')
  revalidatePath('/tags')
  // Tags appear across the whole site; refresh broadly so localized names update.
  revalidatePath('/', 'layout')
}

/** Save manually-edited per-locale display names for one tag. */
export async function updateTagTranslations(formData: FormData): Promise<void> {
  if (!(await checkIsAdmin())) return
  const id = formData.get('id') as string
  if (!id) return

  const update: Record<string, string | null> = {}
  for (const loc of LOCALES) {
    const v = ((formData.get(`display_name_${loc}`) as string) ?? '').trim().slice(0, 60)
    update[`display_name_${loc}`] = v || null
  }

  await createAdminClient().from('tags').update(update).eq('id', id)
  revalidateTagViews()
}

/** Auto-fill empty translations of one tag via machine translation. */
export async function autofillTag(formData: FormData): Promise<void> {
  if (!(await checkIsAdmin())) return
  const id = formData.get('id') as string
  if (!id) return
  await autofillTagTranslations(createAdminClient(), id)
  revalidateTagViews()
}

// Bulk auto-fill processes a small batch per click (avoids serverless timeouts &
// translation rate limits). Each tag is saved as it completes, so repeated
// clicks keep making progress until none are missing. fillBlanks=true ensures
// convergence (proper nouns / failed lookups don't get reprocessed forever).
const BULK_BATCH = 10

/** Auto-translate a batch of tags that are missing any locale. */
export async function autofillAllMissingTags(): Promise<void> {
  if (!(await checkIsAdmin())) return
  const admin = createAdminClient()
  const { data } = await admin
    .from('tags')
    .select('id')
    .or(LOCALES.map((l) => `display_name_${l}.is.null`).join(','))
    .order('usage_count', { ascending: false })
    .limit(BULK_BATCH)
  const ids = (data ?? []).map((r) => (r as { id: string }).id)
  for (const id of ids) {
    await autofillTagTranslations(admin, id, true)
  }
  revalidateTagViews()
}
