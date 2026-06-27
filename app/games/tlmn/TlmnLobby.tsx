'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { useTranslations } from 'next-intl'
import { createRoom, joinRoomByCode, type ActionResult } from './actions'
import { ensureWallet, getWallet, claimDailyCoins, type WalletState } from './wallet'
import {
  ENTRY_MIN_BALANCE, DAILY_GRANT, SIGNUP_GRANT, formatCoins, formatCountdown,
} from '@/lib/game/economy'

function CreateBtn() {
  const { pending } = useFormStatus()
  const t = useTranslations('games.tlmn')
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full inline-flex items-center justify-center gap-2 font-semibold text-[15px] px-6 py-3.5 rounded-2xl bg-rose text-white hover:bg-rose-deep transition-all disabled:opacity-60 shadow-[0_4px_18px_-4px_rgba(194,24,91,0.45)]"
    >
      {pending ? (
        <>
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {t('creating')}
        </>
      ) : t('create_btn')}
    </button>
  )
}

function JoinBtn() {
  const { pending } = useFormStatus()
  const t = useTranslations('games.tlmn')
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex-none font-semibold text-[14px] px-5 py-3 rounded-xl bg-ink text-white hover:bg-ink/85 transition-all disabled:opacity-60"
    >
      {pending ? '…' : t('join_btn')}
    </button>
  )
}

const INIT: ActionResult = null

export default function TlmnLobby() {
  const t = useTranslations('games.tlmn')
  const [joinState, joinAction] = useFormState(joinRoomByCode, INIT)

  // ── Wallet (Run 7 — persistent virtual-coin "xu" economy, PLAY-MONEY only) ─────
  const [wallet, setWallet] = useState<WalletState | null>(null)
  const [welcome, setWelcome] = useState(false)
  const [claimToast, setClaimToast] = useState(false)
  const [claiming, startClaim] = useTransition()
  const [claimErr, setClaimErr] = useState<string | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const refreshWallet = useCallback(async () => {
    const w = await getWallet()
    if (w) setWallet(w)
  }, [])

  // On mount: ensure the wallet exists (one-time signup grant) then load its state.
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { isNew } = await ensureWallet()
      if (!alive) return
      if (isNew) setWelcome(true)
      await refreshWallet()
    })()
    return () => { alive = false }
  }, [refreshWallet])

  // Tick the countdown clock once a second (display only — eligibility is server-checked).
  const broke = wallet != null && wallet.balance < ENTRY_MIN_BALANCE
  useEffect(() => {
    if (!broke) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [broke])

  // When the cooldown elapses on screen, re-fetch so can_claim_daily flips server-side.
  const nextClaimMs = wallet?.nextClaimAt ? new Date(wallet.nextClaimAt).getTime() : null
  const cooldownDone = nextClaimMs != null && now >= nextClaimMs
  const prevDone = useRef(false)
  useEffect(() => {
    if (cooldownDone && !prevDone.current) { prevDone.current = true; refreshWallet() }
    if (!cooldownDone) prevDone.current = false
  }, [cooldownDone, refreshWallet])

  const handleClaim = () => {
    setClaimErr(null)
    startClaim(async () => {
      const res = await claimDailyCoins()
      if ('error' in res) { setClaimErr(res.error); return }
      setWallet(w => w ? { ...w, balance: res.balance, canClaimDaily: false, nextClaimAt: res.nextClaimAt } : w)
      setClaimToast(true)
      setTimeout(() => setClaimToast(false), 4000)
      refreshWallet()
    })
  }

  const errorKey = joinState?.error === 'no_code' ? 'error_no_code'
    : joinState?.error === 'not_found' ? 'error_not_found'
    : joinState?.error === 'full' ? 'error_full'
    : joinState?.error === 'in_progress' ? 'error_in_progress'
    : joinState?.error === 'insufficient_coins' ? 'error_insufficient_coins'
    : null

  // can_claim_daily already encodes "broke + cooldown elapsed" (server-computed). The
  // client clock only drives the countdown display; the server re-checks on claim.
  const claimable = !!wallet?.canClaimDaily

  return (
    <>
      {/* Celebratory toasts — welcome grant + daily claim. */}
      {welcome && (
        <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto bg-gradient-to-r from-gold/95 to-rose text-white rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-3 max-w-[460px]">
            <span className="text-[22px]" aria-hidden>🎁</span>
            <p className="text-[13.5px] font-semibold leading-snug flex-1">
              {t('coin_welcome_toast', { amount: formatCoins(SIGNUP_GRANT) })}
            </p>
            <button onClick={() => setWelcome(false)} className="text-white/80 hover:text-white text-[18px] leading-none flex-none" aria-label="×">×</button>
          </div>
        </div>
      )}
      {claimToast && (
        <div className="fixed inset-x-0 top-4 z-50 flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-3 max-w-[460px]">
            <span className="text-[22px]" aria-hidden>🪙</span>
            <p className="text-[13.5px] font-semibold leading-snug">
              {t('coin_daily_toast', { amount: formatCoins(DAILY_GRANT) })}
            </p>
          </div>
        </div>
      )}

      {/* Balance header — the REAL persisted "xu" balance (survives re-login). */}
      <div className="mb-5 rounded-2xl bg-gradient-to-r from-ink to-[#3a2d22] px-5 py-3.5 flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[2px] text-white/45 mb-0.5">{t('coin_balance_label')}</p>
          <p className="font-black text-[22px] text-gold leading-none inline-flex items-center gap-1.5">
            <span aria-hidden className="text-[16px]">🪙</span>
            {wallet ? formatCoins(wallet.balance) : '…'}
          </p>
        </div>
        <p className="text-[10.5px] text-white/40 leading-snug text-right max-w-[180px]">{t('coin_play_money')}</p>
      </div>

      {broke ? (
        /* ── "Hết xu" panel — join is blocked until the daily refill is claimed. ── */
        <div className="rounded-2xl border border-rose/30 bg-gradient-to-br from-[#fdeef5] to-cream p-6 flex flex-col items-center text-center gap-3">
          <span className="text-[34px]" aria-hidden>😵‍💫</span>
          <h2 className="font-serif font-bold text-[20px] text-rose">{t('coin_broke_title')}</h2>
          <p className="text-[13.5px] text-muted leading-relaxed max-w-[420px]">
            {t('coin_broke_desc', { min: formatCoins(ENTRY_MIN_BALANCE) })}
          </p>
          {claimable ? (
            <button
              onClick={handleClaim}
              disabled={claiming}
              className="mt-1 inline-flex items-center justify-center gap-2 font-bold text-[15px] px-7 py-3.5 rounded-2xl bg-gradient-to-r from-gold to-rose text-white hover:brightness-105 transition-all disabled:opacity-60 shadow-[0_6px_22px_-6px_rgba(194,24,91,0.55)]"
            >
              <span aria-hidden>🪙</span>
              {claiming ? t('creating') : t('coin_claim_btn')}
            </button>
          ) : (
            <div className="mt-1 inline-flex flex-col items-center gap-1">
              <p className="text-[12px] text-muted">{t('coin_next_claim_label')}</p>
              <p className="font-mono font-black text-[26px] text-ink tabular-nums tracking-wide">
                {nextClaimMs ? formatCountdown(nextClaimMs - now) : '—'}
              </p>
            </div>
          )}
          {claimErr && (
            <p className="text-[12px] text-red-600">
              {t(`coin_claim_err_${claimErr}` as Parameters<typeof t>[0])}
            </p>
          )}
        </div>
      ) : (
        /* ── Normal lobby: create / join ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="bg-paper border border-line rounded-2xl p-6 flex flex-col gap-4">
            <div>
              <h2 className="font-serif font-bold text-[20px] text-ink mb-1">{t('create_heading')}</h2>
              <p className="text-[13.5px] text-muted leading-relaxed">{t('create_desc')}</p>
            </div>
            <form action={createRoom}>
              <CreateBtn />
            </form>
          </div>

          <div className="bg-paper border border-line rounded-2xl p-6 flex flex-col gap-4">
            <div>
              <h2 className="font-serif font-bold text-[20px] text-ink mb-1">{t('join_heading')}</h2>
              <p className="text-[13.5px] text-muted leading-relaxed">{t('join_desc')}</p>
            </div>
            <form action={joinAction} className="flex gap-2">
              <input
                type="text"
                name="invite_code"
                placeholder={t('join_placeholder')}
                maxLength={5}
                autoComplete="off"
                className="flex-1 text-[14px] px-3.5 py-3 border border-line rounded-xl bg-white focus:outline-none focus:border-rose/60 focus:ring-2 focus:ring-rose/10 uppercase placeholder:normal-case placeholder:text-muted/40 font-mono tracking-widest text-ink transition-all"
              />
              <JoinBtn />
            </form>
            {errorKey && (
              <p className="text-[12.5px] text-red-600 flex items-center gap-1.5 -mt-1">
                <svg className="w-3.5 h-3.5 flex-none" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                {t(errorKey as Parameters<typeof t>[0])}
              </p>
            )}
            {joinState?.error && !errorKey && (
              <p className="text-[12.5px] text-red-600 -mt-1">{joinState.error}</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}
