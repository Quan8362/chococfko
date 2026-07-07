import 'server-only'

// The SINGLE poker/tournament push dispatch path (27G-H1A). Every poker notification MUST be built
// through `buildPokerNotification` — which routes through the redaction guard (`assertSafeNotification`)
// — before it can reach `web-push`. This closes the gap where the guard existed but nothing wired it
// into a send path: there is now exactly one poker sender, and it cannot bypass redaction.
//
// It is still INERT for tournaments: `buildPokerNotification` returns null for `tournament_reminder`
// unless `tournamentsEnabled` is true (a hard-off feature), and callers pass the resolved flag. This
// module does not enable poker push; it guarantees that IF a poker push is ever dispatched, it is
// structurally + content-scrubbed safe first.

import { sendPushToUsersDiag, type PushDiag } from '@/lib/push/send'
import { buildPokerNotification, type PokerNotificationInput } from './catalog'

export type PokerPushResult =
  | ({ dispatched: true } & PushDiag)
  | { dispatched: false; reason: 'inert' | 'redaction_blocked' }

// Build → redact → send. Returns { dispatched: false } when the category is inert (e.g. tournaments
// OFF) or the localized copy failed the redaction guard — nothing is ever sent in those cases.
export async function sendPokerPushToUsers(
  userIds: string[],
  input: PokerNotificationInput,
): Promise<PokerPushResult> {
  let safe
  try {
    safe = buildPokerNotification(input)
  } catch {
    // A forbidden token / word smuggled into the localized copy → guard threw. Drop, never send.
    return { dispatched: false, reason: 'redaction_blocked' }
  }
  if (!safe) return { dispatched: false, reason: 'inert' }

  const diag = await sendPushToUsersDiag(userIds, {
    title: safe.title,
    body: safe.body,
    url: safe.url,
    tag: safe.tag,
  })
  return { dispatched: true, ...diag }
}
