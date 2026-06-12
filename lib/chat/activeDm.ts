// Tiny browser-side singleton tracking which DM conversation the user is actively
// viewing (by partner user id). Shared between ChatClient (writer) and
// CommunityNotificationProvider (reader) so the DM toast is suppressed ONLY when
// the user is looking at that exact conversation — not for the whole chat page.

let activeDmPartnerId: string | null = null

export function setActiveDmPartnerId(id: string | null): void {
  activeDmPartnerId = id
}

export function getActiveDmPartnerId(): string | null {
  return activeDmPartnerId
}
