'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function updateProfile(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/dang-nhap')

  const display_name = (formData.get('display_name') as string || '').trim()
  const bio          = (formData.get('bio')          as string || '').trim()
  const area         = (formData.get('area')         as string || '').trim()
  const facebook_url  = (formData.get('facebook_url')  as string || '').trim()
  const instagram_url = (formData.get('instagram_url') as string || '').trim()
  const avatar_url    = (formData.get('avatar_url')    as string || '').trim()

  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      display_name: display_name || null,
      bio:           bio           || null,
      area:          area          || null,
      facebook_url:  facebook_url  || null,
      instagram_url: instagram_url || null,
      avatar_url:    avatar_url    || null,
      updated_at: new Date().toISOString(),
    })

  if (error) {
    redirect('/ho-so?error=' + encodeURIComponent(error.message))
  }

  // Sync display_name to auth user_metadata so the header shows the new name immediately
  if (display_name) {
    await supabase.auth.updateUser({ data: { display_name } })
  }

  revalidatePath('/', 'layout')
  redirect('/ho-so?success=1')
}
