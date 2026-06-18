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
