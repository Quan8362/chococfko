'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { sanitizeUserName, sanitizeUserText, sanitizeUrl } from '@/lib/sanitize'

export async function updateProfile(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Strip any HTML/markup from free-text fields and reject non-http(s) URLs so
  // nothing renders as raw "code" and href= can't carry a javascript: payload.
  const display_name = sanitizeUserName((formData.get('display_name') as string) || '', 60)
  const bio          = sanitizeUserText((formData.get('bio')          as string) || '', 500)
  const area         = sanitizeUserName((formData.get('area')         as string) || '', 80)
  const facebook_url  = sanitizeUrl((formData.get('facebook_url')  as string) || '')
  const instagram_url = sanitizeUrl((formData.get('instagram_url') as string) || '')
  // Only accept http(s) avatar URLs (Supabase storage / OAuth provider). Rejects
  // javascript:/data:/etc. — consistent with the social link fields above.
  const avatar_url    = sanitizeUrl((formData.get('avatar_url') as string) || '')

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
    redirect('/profile?error=' + encodeURIComponent(error.message))
  }

  // Sync display_name to auth user_metadata so the header shows the new name immediately
  if (display_name) {
    await supabase.auth.updateUser({ data: { display_name } })
  }

  revalidatePath('/', 'layout')
  redirect('/profile?success=1')
}
