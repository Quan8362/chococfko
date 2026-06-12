// Server component — initial data then hands off to the client bell.
// Shown for every logged-in user (community notifications: DM / mention / listing / comment).
import { createClient } from '@/lib/supabase/server'
import { getCommunityUnreadCount, getCommunityNotifications } from '@/lib/notifications/user'
import UserNotificationBellClient from './UserNotificationBellClient'

export default async function UserNotificationBell() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const [unread, items] = await Promise.all([
    getCommunityUnreadCount(user.id),
    getCommunityNotifications(user.id, 12),
  ])

  return (
    <UserNotificationBellClient userId={user.id} initialUnread={unread} initialNotifications={items} />
  )
}
