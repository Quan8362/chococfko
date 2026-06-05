// Server component — fetches initial notification data then passes to client bell
import { checkIsAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getUnreadCount, getUnreadNotifications } from '@/lib/admin/notifications'
import AdminNotificationBellClient from './AdminNotificationBellClient'

export default async function AdminNotificationBell() {
  const isAdmin = await checkIsAdmin()
  if (!isAdmin) return null

  // Get current admin's user ID to scope notifications
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [unreadCount, notifications] = await Promise.all([
    getUnreadCount(user.id),
    getUnreadNotifications(user.id, 10),
  ])

  return (
    <AdminNotificationBellClient
      initialUnread={unreadCount}
      initialNotifications={notifications}
      userId={user.id}
    />
  )
}
