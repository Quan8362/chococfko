'use client'

// Localizing bridge between the PURE announcement deriver (lib/.../tournament/announce) and the two
// sr-only aria-live regions the tournament table renders. It watches the viewer-safe table view +
// connection state, and on each MEANINGFUL transition emits concise localized copy — polite for
// context (blind up, new hand, street, hand complete, reconnect) and assertive for action-required
// (your turn, connection lost). Identical / duplicated realtime snapshots derive nothing, so a
// screen-reader user is never spammed. It never reads or emits any card/seed/hidden datum.

import { useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { formatCoinsShort } from '@/lib/game/economy'
import {
  deriveAnnouncements,
  announceSnapshotsEqual,
  type AnnounceEvent,
  type AnnounceSnapshot,
} from '@/lib/games/poker/tournament/announce'
import type { TournamentTableView } from '@/lib/games/poker/tournament/tableView'
import type { TnmtConnUx } from './useTournamentTable'

export interface TournamentAnnouncements {
  readonly polite: string
  readonly assertive: string
}

export function useTournamentAnnouncer(
  view: TournamentTableView | null,
  connUx: TnmtConnUx,
): TournamentAnnouncements {
  const ta = useTranslations('games.poker.tournaments.a11y')
  const ts = useTranslations('games.poker.street')
  const [polite, setPolite] = useState('')
  const [assertive, setAssertive] = useState('')
  const prevRef = useRef<AnnounceSnapshot | null>(null)

  useEffect(() => {
    if (!view) return
    const viewerSeat =
      view.viewerSeatIndex !== null ? view.seats.find((s) => s.seatIndex === view.viewerSeatIndex) ?? null : null

    // Winner is derived from PUBLIC stacks only (mirrors the visual banner) — never from cards.
    let viewerIsWinner = false
    if (view.complete && viewerSeat) {
      const contenders = view.seats.filter((s) => s.inHand && !s.folded)
      if (contenders.length > 0) {
        const top = contenders.reduce((a, b) => (b.stack > a.stack ? b : a))
        viewerIsWinner = top.seatIndex === view.viewerSeatIndex
      }
    }

    const snap: AnnounceSnapshot = {
      handId: view.handId,
      handNo: view.handNo,
      complete: view.complete,
      street: view.street,
      levelIndex: view.meta.levelIndex,
      isMyTurn: view.isMyTurn,
      viewerIsWinner,
      connUx,
    }

    const prev = prevRef.current
    if (announceSnapshotsEqual(prev, snap)) return
    const events = deriveAnnouncements(prev, snap)
    prevRef.current = snap
    if (events.length === 0) return

    const viewerStack = viewerSeat ? formatCoinsShort(viewerSeat.stack) : ''
    const localize = (e: AnnounceEvent): string => {
      switch (e.type) {
        case 'blind_level':
          return ta('blind_level', { level: e.level })
        case 'hand_start':
          return ta('hand_start', { handNo: e.handNo })
        case 'street':
          return ta('street', { street: ts(e.street.toLowerCase()), pot: formatCoinsShort(view.pot) })
        case 'hand_complete':
          return e.won ? ta('hand_won', { stack: viewerStack }) : ta('hand_complete', { stack: viewerStack })
        case 'your_turn':
          return ta('your_turn')
        case 'conn':
          return e.state === 'offline' ? ta('offline') : e.state === 'reconnecting' ? ta('reconnecting') : ta('reconnected')
      }
    }

    const politeMsgs = events.filter((e) => e.priority === 'polite').map(localize).filter(Boolean)
    const assertiveMsgs = events.filter((e) => e.priority === 'assertive').map(localize).filter(Boolean)
    if (politeMsgs.length) setPolite(politeMsgs.join('. '))
    if (assertiveMsgs.length) setAssertive(assertiveMsgs.join('. '))
    // ta/ts are next-intl functions; the snapshot-equality guard above makes re-runs cheap no-ops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, connUx])

  return { polite, assertive }
}
