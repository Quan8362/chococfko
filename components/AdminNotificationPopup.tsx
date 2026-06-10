// Server component — renders the admin corner-popup provider only for admins
import { checkIsAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import AdminNotificationPopupClient from './AdminNotificationPopupClient'

export default async function AdminNotificationPopup() {
  const isAdmin = await checkIsAdmin()
  if (!isAdmin) return null

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  return <AdminNotificationPopupClient userId={user.id} />
}
