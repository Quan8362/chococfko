'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { createClient } from '@/lib/supabase/client'
import { formatPriceJPY } from '@/lib/marketplace'
import { placeBid, buyNowAuction, getListingBids, type BidHistoryItem } from '../actions'

type Props = {
  listingId: string
  startPrice: number
  minIncrement: number
  buyNowPrice: number | null
  initialCurrentBid: number | null
  initialBidCount: number
  initialEndsAt: string | null
  initialCurrentBidderId: string | null
  viewerId: string | null
  isOwner: boolean
  initialBids: BidHistoryItem[]
}

function fmtRemaining(ms: number): { d: number; h: number; m: number; s: number } {
  const total = Math.max(0, Math.floor(ms / 1000))
  return { d: Math.floor(total / 86400), h: Math.floor((total % 86400) / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 }
}

export default function AuctionPanel(props: Props) {
  const t = useTranslations('marketplace')
  const locale = useLocale()
  const router = useRouter()

  const [currentBid, setCurrentBid] = useState(props.initialCurrentBid)
  const [bidCount, setBidCount] = useState(props.initialBidCount)
  const [endsAt, setEndsAt] = useState(props.initialEndsAt)
  const [currentBidderId, setCurrentBidderId] = useState(props.initialCurrentBidderId)
  const [bids, setBids] = useState<BidHistoryItem[]>(props.initialBids)
  const [now, setNow] = useState(Date.now())

  const refetchBids = useCallback(async () => {
    const list = await getListingBids(props.listingId)
    setBids(list)
  }, [props.listingId])

  const nextMin = currentBid == null ? props.startPrice : currentBid + props.minIncrement
  const [amount, setAmount] = useState(String(nextMin))
  const amountTouched = useRef(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const endMs = endsAt ? new Date(endsAt).getTime() : 0
  const ended = endMs > 0 && now >= endMs

  // Keep the bid input in sync with the minimum until the user edits it.
  useEffect(() => { if (!amountTouched.current) setAmount(String(nextMin)) }, [nextMin])

  // Countdown tick
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Realtime: listing row updates (new highest bid / extended end / settled)
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`auction-${props.listingId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'marketplace_listings', filter: `id=eq.${props.listingId}` },
        (payload) => {
          const r = payload.new as { current_bid: number | null; bid_count: number; auction_ends_at: string | null; current_bidder_id: string | null }
          setCurrentBid(r.current_bid)
          setBidCount(r.bid_count ?? 0)
          setEndsAt(r.auction_ends_at)
          setCurrentBidderId(r.current_bidder_id)
          // A new bid changed the listing row → refresh the masked history list.
          refetchBids()
        })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [props.listingId, refetchBids])

  async function doBid() {
    const amt = parseInt(amount.replace(/[^\d]/g, '') || '0', 10)
    if (amt < nextMin) { setError(t('bid_too_low', { min: formatPriceJPY(nextMin) })); return }
    setBusy(true); setError(null)
    const res = await placeBid(props.listingId, amt)
    setBusy(false)
    if (res.error) {
      setError(
        res.error === 'too_low' ? t('bid_too_low', { min: formatPriceJPY(nextMin) })
        : res.error === 'ended' ? t('bid_ended')
        : res.error === 'self' ? t('bid_self')
        : res.error === 'login_required' ? t('comment_login')
        : t('bid_error'),
      )
      return
    }
    amountTouched.current = false
    refetchBids()
    router.refresh()
  }

  async function doBuyNow() {
    setBusy(true); setError(null)
    const res = await buyNowAuction(props.listingId)
    setBusy(false)
    if (res.error) { setError(t('bid_error')); return }
    refetchBids()
    router.refresh()
  }

  const rem = fmtRemaining(endMs - now)
  const iAmLeading = !!viewerLeading(props.viewerId, currentBidderId)
  const iWon = ended && props.viewerId != null && props.viewerId === currentBidderId

  return (
    <div className="bg-paper border border-rose/25 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rose bg-rose/10 px-2.5 py-1 rounded-full">🔨 {t('type_auction')}</span>
        <span className="text-[12px] text-muted">{t('bid_count', { count: bidCount })}</span>
      </div>

      <p className="text-[12px] text-muted">{currentBid == null ? t('starting_label') : t('current_bid_label')}</p>
      <div className="font-serif font-bold text-[30px] leading-tight text-rose">
        {formatPriceJPY(currentBid ?? props.startPrice)}
      </div>

      {/* Countdown / status */}
      {ended ? (
        <p className="mt-2 text-[13px] font-semibold text-ink">
          {iWon ? `🎉 ${t('auction_you_won')}` : currentBidderId ? t('auction_ended_sold') : t('auction_ended_nobids')}
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-2 text-[13px]">
          <span className="text-muted">{t('auction_ends_in')}</span>
          <span className="font-bold text-ink tabular-nums">
            {rem.d > 0 && `${rem.d}${t('time_d')} `}{String(rem.h).padStart(2, '0')}:{String(rem.m).padStart(2, '0')}:{String(rem.s).padStart(2, '0')}
          </span>
        </div>
      )}

      {!ended && props.isOwner && (
        <p className="mt-3 text-[12px] text-muted">{t('auction_owner_note')}</p>
      )}

      {!ended && !props.isOwner && props.viewerId && (
        <div className="mt-4 space-y-2">
          {iAmLeading && <p className="text-[12px] font-medium text-emerald-600">✓ {t('auction_leading')}</p>}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-semibold text-[14px]">¥</span>
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => { amountTouched.current = true; setAmount(e.target.value) }}
                className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-line bg-cream text-[15px] focus:outline-none focus:border-rose/50"
              />
            </div>
            <button onClick={doBid} disabled={busy}
              className="flex-none font-semibold text-[14px] px-5 py-2.5 rounded-xl bg-rose text-white hover:bg-rose-deep disabled:opacity-60 transition-all">
              {busy ? '…' : t('bid_button')}
            </button>
          </div>
          <p className="text-[11.5px] text-muted">{t('bid_min_hint', { min: formatPriceJPY(nextMin) })}</p>
          {props.buyNowPrice != null && (
            <button onClick={doBuyNow} disabled={busy}
              className="w-full font-semibold text-[13.5px] px-5 py-2.5 rounded-xl bg-cream border border-rose/30 text-rose hover:bg-rose/5 disabled:opacity-60 transition-all">
              {t('buy_now')} · {formatPriceJPY(props.buyNowPrice)}
            </button>
          )}
          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </div>
      )}

      {!ended && !props.viewerId && (
        <Link href="/dang-nhap" className="mt-4 block text-center font-semibold text-[14px] px-5 py-2.5 rounded-xl bg-rose text-white hover:bg-rose-deep transition-all">
          {t('login_to_bid')}
        </Link>
      )}

      {/* Bid history — masked names, shown to everyone */}
      {bids.length > 0 && (
        <div className="mt-4 border-t border-line/60 pt-3">
          <p className="text-[12px] font-semibold text-muted mb-2">{t('bid_history')} · {bids.length}</p>
          <ul className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
            {bids.map((b, i) => (
              <li key={b.id} className="flex items-center justify-between gap-2 text-[12.5px]">
                <span className="flex items-center gap-1.5 min-w-0">
                  {i === 0 && <span className="flex-none" title={t('auction_leading')}>👑</span>}
                  <span className={`truncate ${i === 0 ? 'font-semibold text-ink' : 'text-muted'}`}>{b.name}</span>
                </span>
                <span className="flex items-center gap-2 flex-none">
                  <span className={i === 0 ? 'font-bold text-rose' : 'text-ink/70'}>{formatPriceJPY(b.amount)}</span>
                  <span className="text-[10.5px] text-muted/55 tabular-nums">{timeAgo(b.createdAt, now, locale)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// Localized relative time ("2 phút trước") via the built-in Intl formatter — no
// per-unit i18n keys needed. `now` is the panel's ticking clock, so it stays live.
function timeAgo(iso: string, nowMs: number, locale: string): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const s = Math.round((new Date(iso).getTime() - nowMs) / 1000)
  const a = Math.abs(s)
  if (a < 60) return rtf.format(Math.round(s), 'second')
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute')
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour')
  return rtf.format(Math.round(s / 86400), 'day')
}

function viewerLeading(viewerId: string | null, bidderId: string | null): boolean {
  return viewerId != null && viewerId === bidderId
}
