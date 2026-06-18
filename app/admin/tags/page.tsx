import { redirect } from 'next/navigation'
import { checkIsAdmin, createAdminClient } from '@/lib/supabase/admin'
import TagsAdminClient, { type AdminTag } from './TagsAdminClient'

export const dynamic = 'force-dynamic'

export default async function AdminTagsPage() {
  if (!(await checkIsAdmin())) redirect('/')

  const admin = createAdminClient()
  const { data } = await admin
    .from('tags')
    .select('id, name, slug, usage_count, is_system_tag, display_name_vi, display_name_en, display_name_ja, display_name_ko, display_name_zh')
    .order('usage_count', { ascending: false })
    .order('name', { ascending: true })
    .limit(1000)

  return <TagsAdminClient tags={(data ?? []) as AdminTag[]} />
}
