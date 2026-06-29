'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { seatIntoRoom, type TlmnRoomState } from '../actions'
import { resolveRules } from '@/lib/games/tlmn/engine'
import UserAvatar from '@/components/UserAvatar'
import { BotAvatar } from './TlmnCard'
import { botThemeIndex } from '@/lib/games/tlmn/avatar'

const MAX_SEATS = 4

type Props = {
  state: TlmnRoomState
  userId: string | null
  code: string
}

// Pre-join invite preview: who invited you (host avatar + name) + a room preview
// (code, current players, rule summary) + the join CTA. Seating runs only when the
// visitor taps "Vào phòng" (the existing coin entry-gate is enforced by seatIntoRoom).
export default function TlmnInvitePreview({ state, userId, code }: Props) {
  const t = useTranslations('games.tlmn')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const { room, seats } = state
  const host = seats.find(s => s.seat_index === room.host_seat) ?? seats[0]
  const hostName = host?.display_name?.trim() || t('player_fallback', { n: 1 })
  const playerCount = seats.length
  const isFull = playerCount >= MAX_SEATS
  const isPlaying = room.status === 'playing'

  const rules = resolveRules(room.settings?.rules)
  const ruleChips = ([
    ['toiTrangEnabled', rules.toiTrangEnabled],
    ['thoiHeoEnabled', rules.thoiHeoEnabled],
    ['thoiBomEnabled', rules.thoiBomEnabled],
    ['congEnabled', rules.congEnabled],
    ['denEnabled', rules.denEnabled],
  ] as const).filter(([, on]) => on).map(([k]) => k)

  const loginHref = `/login?next=${encodeURIComponent(`/games/tlmn/${code}`)}`

  const handleJoin = () => {
    setError(null)
    startTransition(async () => {
      const res = await seatIntoRoom(code)
      if (res.error) { setError(res.error); return }
      // Seated → re-render the page (now in-room → the waiting room view).
      router.refresh()
    })
  }

  const errorMsg = error === 'full' ? t('preview_full')
    : error === 'in_progress' ? t('preview_started')
    : error === 'insufficient_coins' ? t('preview_insufficient')
    : error === 'not_found' ? t('error_not_found')
    : error ? t('play_err_generic')
    : null

  return (
    <div className="flex flex-col gap-5">
      {/* Inviter header */}
      <div className="rounded-2xl border border-rose/20 bg-gradient-to-br from-[#fdeef5] to-cream p-6 flex flex-col items-center text-center gap-3">
        <Avatar name={hostName} url={host?.avatar_url ?? null} size={64} />
        <h1 className="font-serif font-bold text-[clamp(19px,3.6vw,24px)] leading-snug text-ink max-w-[440px]">
          {t('og_title_invite', { name: hostName })}
        </h1>
        <p className="text-[13px] text-muted">{t('invite_sub')}</p>
      </div>

      {/* Room preview */}
      <div className="rounded-2xl border border-line bg-paper p-5 flex flex-col gap-4">
        {/* Code + player count */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[2px] text-muted/60 mb-0.5">{t('room_code_label')}</p>
            <p className="font-mono font-black text-[26px] text-ink tracking-[0.18em] leading-none">{code}</p>
          </div>
          <span className="text-[12.5px] font-bold px-3 py-1.5 rounded-full bg-cream border border-line text-ink">
            {t('preview_players', { count: playerCount, max: MAX_SEATS })}
          </span>
        </div>

        {/* Players already in the room */}
        <div className="flex items-center gap-2 flex-wrap">
          {Array.from({ length: MAX_SEATS }, (_, i) => {
            const seat = seats.find(s => s.seat_index === i)
            return seat ? (
              <div key={i} className="flex items-center gap-1.5 rounded-full bg-cream border border-line pl-1 pr-3 py-1">
                <Avatar name={seat.display_name || '?'} url={seat.avatar_url} size={24} isBot={seat.is_bot} seatIndex={seat.seat_index} />
                <span className="text-[12px] font-semibold text-ink truncate max-w-[96px]">
                  {seat.is_bot ? `🤖 ${seat.display_name}` : (seat.display_name || t('player_fallback', { n: i + 1 }))}
                </span>
              </div>
            ) : (
              <div key={i} className="w-7 h-7 rounded-full border border-dashed border-line flex items-center justify-center text-muted/30 text-[14px]">
                +
              </div>
            )
          })}
        </div>

        {/* Rule summary */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-line/60">
          <span className="text-[11px] font-semibold text-muted/70 mt-2">{t('settings_heading')}:</span>
          <span className="mt-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-ink/5 text-ink/70">
            ⏱ {rules.turnSeconds}s
          </span>
          {ruleChips.map(k => (
            <span key={k} className="mt-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose/10 text-rose">
              {t(`rule_${k}` as Parameters<typeof t>[0])}
            </span>
          ))}
          {ruleChips.length === 0 && (
            <span className="mt-2 text-[11px] text-muted/60">{t('preview_rules_basic')}</span>
          )}
        </div>
      </div>

      {errorMsg && (
        <p className="text-[12.5px] text-red-600 bg-red-50 px-4 py-2.5 rounded-xl border border-red-100 text-center">
          {errorMsg}
        </p>
      )}

      {/* CTAs */}
      <div className="flex flex-col gap-2.5">
        {isPlaying ? (
          <>
            <div className="rounded-xl px-4 py-3 text-center border text-[13px] font-semibold bg-amber-50 border-amber-200 text-amber-800">
              {t('preview_started')}
            </div>
            <Link
              href={`/games/tlmn/${code}?spectate=1`}
              className="w-full text-center font-semibold text-[15px] px-6 py-3.5 rounded-2xl bg-ink text-white hover:bg-ink/85 transition-all"
            >
              {t('preview_spectate')}
            </Link>
          </>
        ) : isFull ? (
          <div className="rounded-xl px-4 py-3 text-center border text-[13px] font-semibold bg-amber-50 border-amber-200 text-amber-800">
            {t('preview_full')}
          </div>
        ) : !userId ? (
          <Link
            href={loginHref}
            className="w-full text-center font-semibold text-[15px] px-6 py-3.5 rounded-2xl bg-rose text-white hover:bg-rose-deep transition-all shadow-[0_4px_18px_-4px_rgba(194,24,91,0.45)]"
          >
            {t('preview_login_to_join')}
          </Link>
        ) : (
          <button
            onClick={handleJoin}
            disabled={isPending}
            className="w-full font-semibold text-[15px] px-6 py-3.5 rounded-2xl bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-60 shadow-[0_4px_18px_-4px_rgba(194,24,91,0.45)]"
          >
            {isPending ? t('creating') : t('preview_join_btn')}
          </button>
        )}

        <Link
          href="/games/tlmn"
          className="w-full text-center font-medium text-[13.5px] px-6 py-3 rounded-xl border border-line text-muted hover:bg-line transition-all"
        >
          {t('preview_later_btn')}
        </Link>
      </div>
    </div>
  )
}

// ── Avatar ──────────────────────────────────────────────────────────────────────
// Real players via the canonical site renderer (proxy + safe initials fallback); bots
// keep their fixed card-suit emblem — never a profile image.
function Avatar({
  name, url, size, isBot = false, seatIndex = 0,
}: { name: string; url: string | null; size: number; isBot?: boolean; seatIndex?: number }) {
  return (
    <span className="inline-flex rounded-full flex-none border border-line overflow-hidden">
      {isBot
        ? <BotAvatar seed={botThemeIndex(name, seatIndex)} size={size} />
        : <UserAvatar src={url} name={name} size={size} />}
    </span>
  )
}
